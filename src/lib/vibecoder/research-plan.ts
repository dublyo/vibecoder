// Research + Planning phase for VibeCoder pipeline
// Runs before code generation for complex/new-app requests

import { chatCompletion, type ChatMessage } from '../openrouter'
import { getOpenRouterKey } from '../openrouter'
import { searchSerper } from '../research/serper'
import { prisma } from '../db'
import type { PipelineEvent } from './pipeline'
import type { FileContext } from './file-context'

const PLAN_MODEL = 'deepseek/deepseek-chat-v3-0324'

const PLANNER_PROMPT = `You are Maestro Planner, a senior software architect for a vibe-coding IDE.

Your job is to create a detailed, actionable implementation plan for a full-stack application.
You have access to web research results about best practices.

Create a structured plan in markdown with EXACTLY these sections:

## Architecture Overview
Brief description of the app, its purpose, and high-level architecture (1-2 paragraphs).

## Tech Stack
- Framework, database, auth, styling decisions with brief justification
- List specific npm packages that will be used

## Database Schema
Write the complete Prisma schema models needed. Use proper relations, indexes, and field types.
Format as a prisma code block.

## API Routes
List all API routes with their HTTP methods and brief descriptions.
Format: \`METHOD /api/path\` — description

## File Structure
Tree-style listing of all files that will be created.

## Implementation Steps
Numbered list of 5-15 steps in order of implementation.
Each step should be specific and actionable (e.g., "Create Prisma schema with User, Listing, Bid models").

## UI Pages & Components
List all pages and key components with brief descriptions.

RULES:
- Be specific, not generic. Include actual model names, field names, route paths.
- Use Next.js App Router patterns (app/ directory, server components, route handlers).
- Use Prisma ORM for database access.
- Use Tailwind CSS v4 for styling — write all UI from scratch, do NOT plan for shadcn/ui, @radix-ui, or headless UI.
- Use lucide-react for icons.
- Include proper auth, validation, and error handling in the plan.
- The plan should be comprehensive enough that another AI can follow it to build the entire app.
- ALWAYS use the LATEST stable package versions. Current versions (March 2026):
  next@^16.1.0, react@^19.2.0, react-dom@^19.2.0, typescript@^5.9.0, tailwindcss@^4.2.0, @tailwindcss/postcss@^4.2.0, lucide-react@^0.577.0, prisma@^7.5.0, @prisma/client@^7.5.0, next-auth@^4.24.0

BUILD REQUIREMENTS (include in Implementation Steps):
- next.config.ts MUST include: output: 'standalone', typescript: { ignoreBuildErrors: true }, eslint: { ignoreDuringBuilds: true }
- Pages that fetch DB data MUST have: export const dynamic = 'force-dynamic'
- Dockerfile MUST have: RUN npx prisma generate (before npm run build)
- All component exports must use NAMED exports (export { Foo }) not just export default
- NextAuth v5 route: ONLY export GET and POST, no other named exports
- Tailwind CSS v4: src/app/globals.css with @import "tailwindcss" (NOT @tailwind directives). postcss.config.mjs uses @tailwindcss/postcss plugin. No tailwind.config needed.

CONTAINER & LOCAL DEV (include in File Structure and Implementation Steps):
- docker-compose.yml: app service with build context, env_file: [".env"], ports 3000:3000, restart: unless-stopped. Add postgres/redis services if needed.
- .dockerignore: node_modules, .next, .git, *.md, .env*.local, npm-debug.log, .DS_Store, dist, coverage, .turbo
- .env.example: list ALL env vars with placeholder values (DATABASE_URL, REDIS_URL, NEXTAUTH_SECRET, API keys, etc.)
- README.md: Quick Start (clone, cp .env.example .env, npm install, prisma generate if needed, npm run dev), Docker section (docker compose up --build), Tech Stack list`

/** Generate 3 search queries from the user's request for research */
function generateSearchQueries(message: string): string[] {
  // Extract key topics and generate targeted search queries
  const words = message.toLowerCase()
  const queries: string[] = []

  // Always search for the core app type + best practices
  queries.push(`${message.slice(0, 80)} nextjs app architecture best practices 2026`)

  // Database/schema query
  if (words.includes('database') || words.includes('postgres') || words.includes('prisma') ||
      words.includes('marketplace') || words.includes('auction') || words.includes('ecommerce') ||
      words.includes('saas') || words.includes('app')) {
    queries.push(`prisma schema ${message.split(' ').slice(0, 6).join(' ')} database design`)
  }

  // UI/UX query
  queries.push(`${message.split(' ').slice(0, 5).join(' ')} UI design patterns modern nextjs`)

  return queries.slice(0, 3)
}

/** Run web research using Serper.dev to gather best practices */
export async function researchForPlan(
  message: string,
  publishEvent: (event: PipelineEvent) => void,
): Promise<string> {
  publishEvent({ event: 'phase_start', data: { phase: 'researching', description: 'Researching best practices...' } })

  // Get Serper API key from settings
  const serperSetting = await prisma.settings.findUnique({ where: { key: 'serper_api_key' } })
  if (!serperSetting?.value) {
    publishEvent({ event: 'thinking_detail', data: { phase: 'researching', detail: 'No Serper API key — skipping web research' } })
    publishEvent({ event: 'phase_complete', data: { phase: 'researching' } })
    return ''
  }

  const queries = generateSearchQueries(message)
  publishEvent({ event: 'thinking_detail', data: { phase: 'researching', detail: `Searching: ${queries.join(', ')}` } })

  try {
    // Run all searches in parallel
    const results = await Promise.all(
      queries.map(q =>
        searchSerper(q, serperSetting.value, { num: 5 }).catch(() => null)
      )
    )

    // Collect unique snippets
    const seen = new Set<string>()
    const snippets: string[] = []

    for (const result of results) {
      if (!result?.organic) continue
      for (const item of result.organic) {
        const key = item.link
        if (seen.has(key)) continue
        seen.add(key)
        snippets.push(`**${item.title}** (${item.link})\n${item.snippet}`)
      }
    }

    const researchContext = snippets.slice(0, 10).join('\n\n')
    publishEvent({ event: 'thinking_detail', data: { phase: 'researching', detail: `Found ${snippets.length} relevant results` } })
    publishEvent({ event: 'phase_complete', data: { phase: 'researching' } })

    return researchContext
  } catch (err: any) {
    publishEvent({ event: 'thinking_detail', data: { phase: 'researching', detail: `Research error: ${err.message}` } })
    publishEvent({ event: 'phase_complete', data: { phase: 'researching' } })
    return ''
  }
}

/** Generate a detailed implementation plan using AI */
export async function generatePlan(
  message: string,
  researchContext: string,
  fileContext: FileContext,
  publishEvent: (event: PipelineEvent) => void,
): Promise<string> {
  const apiKey = await getOpenRouterKey()
  if (!apiKey) throw new Error('OpenRouter API key not configured')

  publishEvent({ event: 'phase_start', data: { phase: 'planning', description: 'Creating implementation plan...' } })
  publishEvent({ event: 'ai_thinking', data: { phase: 'planning' } })

  const treeStr = fileContext.tree
    .filter(n => n.type === 'file')
    .filter(n => !n.path.startsWith('node_modules/'))
    .map(n => n.path)
    .join('\n')

  const existingDeps = fileContext.packageJson?.dependencies
    ? JSON.stringify(fileContext.packageJson.dependencies, null, 2)
    : 'none'

  const messages: ChatMessage[] = [
    { role: 'system', content: PLANNER_PROMPT },
    {
      role: 'user',
      content: `USER REQUEST:
${message}

EXISTING PROJECT FILES:
${treeStr || '(empty project — scaffold only)'}

CURRENT DEPENDENCIES:
${existingDeps}

${researchContext ? `WEB RESEARCH RESULTS (best practices & references):
${researchContext}` : ''}

Create a detailed implementation plan for this request. Be specific with model names, field types, route paths, and component names.`,
    },
  ]

  const response = await chatCompletion(PLAN_MODEL, messages, apiKey, {
    temperature: 0.3,
    maxTokens: 8192,
  })

  const plan = response.choices[0]?.message?.content || ''
  const cleanPlan = plan.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

  publishEvent({ event: 'thinking_detail', data: { phase: 'planning', detail: 'Plan generated' } })
  publishEvent({ event: 'phase_complete', data: { phase: 'planning' } })

  return cleanPlan
}
