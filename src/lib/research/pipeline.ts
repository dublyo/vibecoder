/**
 * Research pipeline orchestrator
 * Coordinates: keywords -> search -> dedup -> crawl -> summarize -> synthesize
 */
import { searchSerper, type SerperResult } from './serper'
import { crawlPages, type CrawledPage } from './crawl'
import { extractKeywords, summarizePage, synthesizeReport } from './ai'
import { calculateCredits } from '@/lib/credits'

export interface ResearchProgress {
  stage: string
  message: string
  progress: number // 0-100
  detail?: string
}

export interface ResearchConfig {
  query: string
  depth: 'standard' | 'extensive'
  cheapModel: string
  maestroModel: string
  serperApiKey: string
  openRouterApiKey: string
  onProgress: (p: ResearchProgress) => void | Promise<void>
}

export interface RankedUrl {
  url: string
  title: string
  snippet: string
  frequency: number // how many keywords returned this URL
  bestPosition: number // best position across searches
}

export interface ResearchResult {
  keywords: string[]
  searchResults: Record<string, SerperResult[]>
  rankedUrls: RankedUrl[]
  crawledPages: CrawledPage[]
  summaries: Array<{ url: string; title: string; summary: string }>
  report: string
  sources: Array<{ url: string; title: string; snippet: string }>
  totalCredits: number
  serperCreditsUsed: number
}

/**
 * Deduplicate and rank URLs by frequency across keyword searches.
 * URLs that appear in multiple keyword results are ranked higher.
 * Non-repeated URLs are included too, ranked by their search position.
 */
function deduplicateAndRank(
  searchResults: Record<string, SerperResult[]>,
  maxUrls: number,
): RankedUrl[] {
  const urlMap = new Map<string, RankedUrl>()

  for (const results of Object.values(searchResults)) {
    for (const result of results) {
      const normalized = result.link.replace(/\/$/, '').toLowerCase()
      const existing = urlMap.get(normalized)
      if (existing) {
        existing.frequency++
        existing.bestPosition = Math.min(existing.bestPosition, result.position)
      } else {
        urlMap.set(normalized, {
          url: result.link,
          title: result.title,
          snippet: result.snippet,
          frequency: 1,
          bestPosition: result.position,
        })
      }
    }
  }

  // Sort: frequency DESC, then bestPosition ASC
  const ranked = Array.from(urlMap.values()).sort((a, b) => {
    if (b.frequency !== a.frequency) return b.frequency - a.frequency
    return a.bestPosition - b.bestPosition
  })

  return ranked.slice(0, maxUrls)
}

/**
 * Phase 1: Extract keywords and build a research plan.
 * Returns the plan for user approval before proceeding.
 */
export async function planResearch(config: ResearchConfig): Promise<{
  keywords: string[]
  planCredits: number
  keywordCount: number
  maxCrawlUrls: number
}> {
  const { query, depth, cheapModel, openRouterApiKey, onProgress } = config

  const keywordCount = depth === 'extensive' ? 10 : 5
  const maxCrawlUrls = depth === 'extensive' ? 20 : 12

  await onProgress({ stage: 'extracting_keywords', message: 'Analyzing your query...', progress: 5 })

  const kw = await extractKeywords(query, keywordCount, cheapModel, openRouterApiKey)
  const planCredits = calculateCredits(cheapModel, kw.inputTokens, kw.outputTokens)

  await onProgress({
    stage: 'extracting_keywords',
    message: `Extracted ${kw.keywords.length} search keywords`,
    progress: 10,
    detail: kw.keywords.join(', '),
  })

  return { keywords: kw.keywords, planCredits, keywordCount, maxCrawlUrls }
}

/**
 * Phase 2: Execute the research pipeline after user approval.
 * Starts from searching (keywords already extracted).
 */
export async function executeResearch(config: ResearchConfig & {
  keywords: string[]
  maxCrawlUrls: number
  priorCredits: number
}): Promise<ResearchResult> {
  const {
    query, keywords, maxCrawlUrls, priorCredits,
    cheapModel, maestroModel,
    serperApiKey, openRouterApiKey, onProgress,
  } = config

  let totalCredits = priorCredits
  let serperCreditsUsed = 0
  const searchResults: Record<string, SerperResult[]> = {}

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i]
    const progressPct = 10 + Math.round(((i + 1) / keywords.length) * 25)
    await onProgress({
      stage: 'searching',
      message: `Searching: "${keyword}" (${i + 1}/${keywords.length})`,
      progress: progressPct,
    })

    try {
      const response = await searchSerper(keyword, serperApiKey, { num: 10 })
      searchResults[keyword] = response.organic || []
      serperCreditsUsed++
      totalCredits += 1 // 1 credit per Serper call
    } catch (err) {
      console.error(`[research] Serper search failed for "${keyword}":`, (err as Error).message)
      searchResults[keyword] = []
    }
  }

  // ═══════════════════════════════════════
  // Stage 3: Deduplicate & Rank URLs
  // ═══════════════════════════════════════
  await onProgress({ stage: 'deduplicating', message: 'Ranking and deduplicating results...', progress: 38 })

  const rankedUrls = deduplicateAndRank(searchResults, maxCrawlUrls)
  const repeatedCount = rankedUrls.filter(u => u.frequency > 1).length

  await onProgress({
    stage: 'deduplicating',
    message: `Found ${rankedUrls.length} unique URLs (${repeatedCount} appeared in multiple searches)`,
    progress: 40,
    detail: rankedUrls.slice(0, 5).map(u => u.title).join(', '),
  })

  // ═══════════════════════════════════════
  // Stage 4: Crawl Pages
  // ═══════════════════════════════════════
  const crawledPages = await crawlPages(
    rankedUrls.map(u => u.url),
    5, // concurrency
    async (completed, total) => {
      const progressPct = 40 + Math.round((completed / total) * 25)
      await onProgress({
        stage: 'crawling',
        message: `Crawling pages: ${completed}/${total}`,
        progress: progressPct,
      })
    },
  )

  const successfulCrawls = crawledPages.filter(p => p.success && p.wordCount > 50)
  await onProgress({
    stage: 'crawling',
    message: `Crawled ${successfulCrawls.length}/${crawledPages.length} pages successfully`,
    progress: 65,
  })

  if (successfulCrawls.length === 0) {
    // Fallback: use snippets from search results as content
    await onProgress({
      stage: 'crawling',
      message: 'No pages crawled, using search snippets instead',
      progress: 65,
    })
  }

  // ═══════════════════════════════════════
  // Stage 5: Summarize Each Page
  // ═══════════════════════════════════════
  const summaries: Array<{ url: string; title: string; summary: string }> = []
  const pagesToSummarize = successfulCrawls.length > 0
    ? successfulCrawls
    : rankedUrls.slice(0, 10).map(u => ({
        url: u.url, title: u.title, content: u.snippet, wordCount: u.snippet.split(/\s+/).length, success: true,
      }))

  for (let i = 0; i < pagesToSummarize.length; i++) {
    const page = pagesToSummarize[i]
    const progressPct = 65 + Math.round(((i + 1) / pagesToSummarize.length) * 20)
    await onProgress({
      stage: 'summarizing',
      message: `Summarizing: ${page.title.slice(0, 60)}... (${i + 1}/${pagesToSummarize.length})`,
      progress: progressPct,
    })

    try {
      const result = await summarizePage(
        page.content, page.title, page.url, query, cheapModel, openRouterApiKey,
      )
      totalCredits += calculateCredits(cheapModel, result.inputTokens, result.outputTokens)

      if (!result.summary.toLowerCase().includes('not relevant to query')) {
        summaries.push({ url: page.url, title: page.title, summary: result.summary })
      }
    } catch (err) {
      console.error(`[research] Summarize failed for ${page.url}:`, (err as Error).message)
    }
  }

  await onProgress({
    stage: 'summarizing',
    message: `Summarized ${summaries.length} relevant pages`,
    progress: 85,
  })

  if (summaries.length === 0) {
    return {
      keywords, searchResults, rankedUrls, crawledPages, summaries,
      report: '# Research Failed\n\nNo relevant content was found for your query. Try rephrasing or using a more specific question.',
      sources: [],
      totalCredits,
      serperCreditsUsed,
    }
  }

  // ═══════════════════════════════════════
  // Stage 6: Synthesize Final Report
  // ═══════════════════════════════════════
  await onProgress({
    stage: 'synthesizing',
    message: `Writing final report from ${summaries.length} sources using ${maestroModel.split('/').pop()}...`,
    progress: 88,
  })

  const synthesis = await synthesizeReport(query, summaries, maestroModel, openRouterApiKey)
  totalCredits += calculateCredits(maestroModel, synthesis.inputTokens, synthesis.outputTokens)

  const sources = summaries.map(s => ({
    url: s.url,
    title: s.title,
    snippet: rankedUrls.find(u => u.url === s.url)?.snippet || '',
  }))

  await onProgress({
    stage: 'completed',
    message: 'Research complete!',
    progress: 100,
  })

  return {
    keywords,
    searchResults,
    rankedUrls,
    crawledPages,
    summaries,
    report: synthesis.report,
    sources,
    totalCredits,
    serperCreditsUsed,
  }
}
