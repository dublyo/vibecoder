// Code Research phase for VibeCoder Maestro pipeline
// Sends ALL project files to a cheap model for semantic analysis before code generation.
// This gives Maestro deep understanding of existing patterns, components, and architecture.

import { chatCompletion, type ChatMessage } from '../openrouter'
import { getOpenRouterKey } from '../openrouter'
import { getFileTree, getFile } from './file-context'
import type { FileContext } from './file-context'
import type { PipelineEvent } from './pipeline'

const CODE_RESEARCH_MODEL = 'google/gemini-2.0-flash-001' // cheapest, ~$0.10/1M input tokens

export interface CodeResearchReport {
  summary: string
  components: string[]
  apiRoutes: string[]
  dbSchema: string | null
  patterns: string[]
  imports: string[]
  suggestions: string[]
  raw: string
}

const CODE_RESEARCH_PROMPT = `You are a code analyst for a vibe-coding IDE. Your job is to deeply analyze an existing codebase and produce a structured report that will guide another AI in making accurate modifications.

Analyze ALL provided files and output a structured report in EXACTLY this format:

## COMPONENT MAP
List every React component found, its file path, what it renders, and what props it accepts.
Format: \`path/Component\` — description (props: propName, propName)

## API ROUTES
List every API route, its HTTP methods, what it does, and what models/tables it touches.
Format: \`METHOD /api/path\` — description → uses: ModelName

## DATABASE SCHEMA
If a Prisma schema or DB models exist, summarize all models, their fields, and relations.
If no schema exists, write "No database schema found."

## STYLING PATTERNS
What CSS approach is used? (Tailwind classes, CSS modules, inline styles, etc.)
List any custom theme colors, spacing conventions, or design tokens found.

## IMPORT PATTERNS
List the key packages used and how they're imported (named vs default exports).
Note any path aliases (like @/) or custom import conventions.

## COMPONENT HIERARCHY
Describe how components are composed — which component renders which.
Format as a tree: App → Layout → [Header, MainContent → [ProductGrid → ProductCard], Footer]

## STATE MANAGEMENT
How is state managed? (useState, useContext, Redux, Zustand, server components, etc.)
List any shared state/context providers.

## WHAT EXISTS vs WHAT'S MISSING
Based on the project structure and code, list:
- Features that are fully implemented
- Features that are partially implemented (stubs, TODOs, empty handlers)
- Common patterns the codebase follows that new code should match

## KEY CONVENTIONS
List coding conventions the project follows:
- File naming (kebab-case, PascalCase, etc.)
- Export style (default vs named)
- Error handling patterns
- Data fetching patterns

RULES:
- Be precise — use actual names from the code, not generic descriptions.
- If a section has no relevant findings, write "None found."
- Keep each section concise but complete.
- Focus on information that would help someone modify this codebase correctly.`

/** Gather ALL source files from a project (not just the 3-10 selected ones) */
async function gatherAllSourceFiles(
  repo: string,
  projectId: string,
): Promise<{ path: string; content: string }[]> {
  const tree = await getFileTree(repo, projectId)

  const sourceFiles = tree
    .filter(n => n.type === 'file')
    .filter(n => !n.path.startsWith('node_modules/'))
    .filter(n => !n.path.startsWith('.next/'))
    .filter(n => !n.path.startsWith('dist/'))
    .filter(n => !n.path.startsWith('.git/'))
    .filter(n => !n.path.endsWith('.lock'))
    .filter(n => !n.path.endsWith('.ico'))
    .filter(n => !n.path.endsWith('.png'))
    .filter(n => !n.path.endsWith('.jpg'))
    .filter(n => !n.path.endsWith('.svg'))
    .filter(n => !n.path.endsWith('.woff'))
    .filter(n => !n.path.endsWith('.woff2'))
    .filter(n => !n.path.endsWith('.ttf'))
    .filter(n => !n.path.endsWith('.eot'))
    .filter(n => {
      // Skip large config/generated files
      const skip = ['.dockerignore', '.gitignore', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']
      return !skip.includes(n.path.split('/').pop() || '')
    })

  // Fetch all files in parallel (batched to avoid rate limits)
  const BATCH_SIZE = 10
  const allFiles: { path: string; content: string }[] = []

  for (let i = 0; i < sourceFiles.length; i += BATCH_SIZE) {
    const batch = sourceFiles.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(n => getFile(repo, projectId, n.path).catch(() => null))
    )
    for (const file of results) {
      if (file && file.content) {
        allFiles.push({ path: file.path, content: file.content })
      }
    }
  }

  return allFiles
}

/** Run code research analysis on the entire project codebase */
export async function analyzeCode(
  repo: string,
  projectId: string,
  message: string,
  publishEvent: (event: PipelineEvent) => void,
): Promise<CodeResearchReport | null> {
  const apiKey = await getOpenRouterKey()
  if (!apiKey) return null

  publishEvent({ event: 'phase_start', data: { phase: 'code_research', description: 'Analyzing existing codebase...' } })

  try {
    // Gather all source files
    const files = await gatherAllSourceFiles(repo, projectId)

    if (files.length === 0) {
      publishEvent({ event: 'thinking_detail', data: { phase: 'code_research', detail: 'No source files found — skipping code research' } })
      publishEvent({ event: 'phase_complete', data: { phase: 'code_research' } })
      return null
    }

    publishEvent({ event: 'thinking_detail', data: { phase: 'code_research', detail: `Analyzing ${files.length} source files...` } })

    // Build the full codebase string
    const codebaseStr = files
      .map(f => `--- ${f.path} ---\n${f.content}`)
      .join('\n\n')

    // Trim to ~100K tokens (400K chars) to stay within Gemini Flash limits
    const maxChars = 400_000
    const trimmedCodebase = codebaseStr.length > maxChars
      ? codebaseStr.slice(0, maxChars) + '\n\n... (truncated — project has more files)'
      : codebaseStr

    const messages: ChatMessage[] = [
      { role: 'system', content: CODE_RESEARCH_PROMPT },
      {
        role: 'user',
        content: `USER'S MODIFICATION REQUEST (for context — analyze the codebase with this in mind):
${message}

FULL PROJECT CODEBASE:
${trimmedCodebase}`,
      },
    ]

    const response = await chatCompletion(CODE_RESEARCH_MODEL, messages, apiKey, {
      temperature: 0.1,
      maxTokens: 4096,
    })

    const raw = response.choices[0]?.message?.content || ''

    publishEvent({ event: 'thinking_detail', data: { phase: 'code_research', detail: `Code analysis complete (${response.usage.prompt_tokens} input tokens)` } })
    publishEvent({ event: 'phase_complete', data: { phase: 'code_research' } })

    // Parse sections from the raw report
    return parseReport(raw)
  } catch (err: any) {
    publishEvent({ event: 'thinking_detail', data: { phase: 'code_research', detail: `Code research error: ${err.message}` } })
    publishEvent({ event: 'phase_complete', data: { phase: 'code_research' } })
    return null
  }
}

/** Parse the structured report from raw AI output */
function parseReport(raw: string): CodeResearchReport {
  const getSection = (heading: string): string => {
    const regex = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`)
    const match = raw.match(regex)
    return match ? match[1].trim() : ''
  }

  const extractList = (section: string): string[] => {
    return section
      .split('\n')
      .map(l => l.replace(/^[-*]\s*/, '').trim())
      .filter(l => l.length > 0 && l !== 'None found.')
  }

  const componentSection = getSection('COMPONENT MAP')
  const apiSection = getSection('API ROUTES')
  const dbSection = getSection('DATABASE SCHEMA')
  const importSection = getSection('IMPORT PATTERNS')
  const patternsSection = getSection('KEY CONVENTIONS')
  const existsSection = getSection("WHAT EXISTS vs WHAT'S MISSING")

  return {
    summary: getSection('COMPONENT HIERARCHY') || getSection('STYLING PATTERNS') || '',
    components: extractList(componentSection),
    apiRoutes: extractList(apiSection),
    dbSchema: dbSection && dbSection !== 'No database schema found.' ? dbSection : null,
    patterns: extractList(patternsSection),
    imports: extractList(importSection),
    suggestions: extractList(existsSection),
    raw,
  }
}

/** Format the report as a concise string for injection into AI prompts */
export function formatReportForPrompt(report: CodeResearchReport): string {
  // Use the raw report directly — it's already well-structured markdown
  // Trim to ~3000 chars to avoid bloating the code generation prompt
  const maxLen = 3000
  if (report.raw.length <= maxLen) return report.raw
  return report.raw.slice(0, maxLen) + '\n\n... (analysis truncated)'
}
