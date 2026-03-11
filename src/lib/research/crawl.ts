/**
 * Web page crawler using fetch + Readability for content extraction
 */
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

export interface CrawledPage {
  url: string
  title: string
  content: string // extracted text
  wordCount: number
  success: boolean
  error?: string
}

const CRAWL_TIMEOUT = 15000
const MAX_CONTENT_LENGTH = 10000 // chars per page
const BLOCKED_EXTENSIONS = ['.pdf', '.zip', '.tar', '.gz', '.mp4', '.mp3', '.avi', '.mov', '.exe', '.dmg']
const BLOCKED_DOMAINS = ['youtube.com', 'youtu.be', 'twitter.com', 'x.com', 'instagram.com', 'facebook.com', 'tiktok.com']

function isBlockedUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (BLOCKED_DOMAINS.some(d => parsed.hostname.includes(d))) return true
    if (BLOCKED_EXTENSIONS.some(ext => parsed.pathname.toLowerCase().endsWith(ext))) return true
    return false
  } catch {
    return true
  }
}

export async function crawlPage(url: string): Promise<CrawledPage> {
  if (isBlockedUrl(url)) {
    return { url, title: '', content: '', wordCount: 0, success: false, error: 'Blocked URL type' }
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VibeCoder/1.0; +https://vibecode.new)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(CRAWL_TIMEOUT),
    })

    if (!res.ok) {
      return { url, title: '', content: '', wordCount: 0, success: false, error: `HTTP ${res.status}` }
    }

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return { url, title: '', content: '', wordCount: 0, success: false, error: 'Not HTML' }
    }

    const html = await res.text()
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()

    if (!article || !article.textContent) {
      return { url, title: dom.window.document.title || '', content: '', wordCount: 0, success: false, error: 'No readable content' }
    }

    // Clean and truncate content
    const content = article.textContent
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_CONTENT_LENGTH)

    return {
      url,
      title: article.title || dom.window.document.title || '',
      content,
      wordCount: content.split(/\s+/).length,
      success: true,
    }
  } catch (err) {
    return {
      url,
      title: '',
      content: '',
      wordCount: 0,
      success: false,
      error: (err as Error).message?.slice(0, 100) || 'Crawl failed',
    }
  }
}

/**
 * Crawl multiple pages in parallel with concurrency limit
 */
export async function crawlPages(
  urls: string[],
  concurrency = 5,
  onProgress?: (completed: number, total: number) => void,
): Promise<CrawledPage[]> {
  const results: CrawledPage[] = []
  let completed = 0

  // Process in batches
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(url => crawlPage(url)))
    results.push(...batchResults)
    completed += batch.length
    onProgress?.(completed, urls.length)
  }

  return results
}
