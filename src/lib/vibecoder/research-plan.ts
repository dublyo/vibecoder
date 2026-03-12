// Research + Planning phase for VibeCoder pipeline
// Runs before code generation for complex/new-app requests

import { chatCompletion, type ChatMessage } from '../openrouter'
import { getOpenRouterKey } from '../openrouter'
import { searchSerper } from '../research/serper'
import { prisma } from '../db'
import type { PipelineEvent } from './pipeline'
import type { FileContext } from './file-context'

const PLAN_MODEL = 'deepseek/deepseek-chat-v3-0324'

function buildPlannerPrompt(framework: string): string {
  const fwName = framework === 'nuxt' ? 'Nuxt 4' : framework === 'astro' ? 'Astro 6' : 'Next.js 16'
  const fwPatterns = framework === 'nuxt'
    ? `- Use Nuxt 4 file-based routing (pages/ directory) and server routes (server/api/).
- Nuxt auto-imports Vue composables and components from components/.
- Use <script setup lang="ts"> in all Vue SFCs.
- Use useFetch() or useAsyncData() for data fetching in pages/components.
- Use lucide-vue-next for icons.
- Server routes use defineEventHandler, readBody, getQuery, createError (auto-imported from h3).
- Environment variables via useRuntimeConfig() in server routes.`
    : framework === 'astro'
    ? `- Use Astro 6 file-based routing (src/pages/).
- .astro pages are server-rendered by default (zero JS). Use React islands with client:load for interactivity.
- Create React components in src/components/ for interactive parts.
- API routes at src/pages/api/ export GET/POST functions.
- Use lucide-react for icons in React islands.
- Environment variables via import.meta.env.`
    : `- Use Next.js App Router patterns (app/ directory, server components, route handlers).
- Use lucide-react for icons.
- Access environment variables via process.env (server) or NEXT_PUBLIC_ prefix (client).`

  const fwDeps = framework === 'nuxt'
    ? `nuxt@^4.2.0, vue@^3.6.0, typescript@^5.9.0, tailwindcss@^4.2.0, @nuxtjs/tailwindcss@^7.0.0, lucide-vue-next@^0.577.0, prisma@^7.5.0, @prisma/client@^7.5.0`
    : framework === 'astro'
    ? `astro@^6.0.0, @astrojs/react@^5.0.0, @astrojs/tailwind@^7.0.0, react@^19.2.0, react-dom@^19.2.0, typescript@^5.9.0, tailwindcss@^4.2.0, lucide-react@^0.577.0, prisma@^7.5.0, @prisma/client@^7.5.0`
    : `next@^16.1.0, react@^19.2.0, react-dom@^19.2.0, typescript@^5.9.0, tailwindcss@^4.2.0, @tailwindcss/postcss@^4.2.0, lucide-react@^0.577.0, prisma@^7.5.0, @prisma/client@^7.5.0, next-auth@^4.24.0`

  const fwBuildRules = framework === 'nuxt'
    ? `- nuxt.config.ts is the central config file. Do NOT create nuxt.config.js.
- Add "postinstall": "prisma generate" to package.json scripts when using Prisma.
- Dockerfile MUST have: RUN npx prisma generate (before npm run build).
- All component exports: Vue SFCs are auto-imported from components/, no explicit export needed.`
    : framework === 'astro'
    ? `- astro.config.ts is the central config. Include react() and tailwind() integrations.
- For SSR, set output: 'server' in astro.config.ts.
- Add "postinstall": "prisma generate" to package.json scripts when using Prisma.
- Dockerfile MUST have: RUN npx prisma generate (before npm run build).
- React components need client:load directive when used in .astro pages.`
    : `- next.config.ts MUST include: output: 'standalone', typescript: { ignoreBuildErrors: true }, eslint: { ignoreDuringBuilds: true }
- Pages that fetch DB data MUST have: export const dynamic = 'force-dynamic'
- Dockerfile MUST have: RUN npx prisma generate (before npm run build)
- All component exports must use NAMED exports (export { Foo }) not just export default
- NextAuth v5 route: ONLY export GET and POST, no other named exports
- Tailwind CSS v4: src/app/globals.css with @import "tailwindcss" (NOT @tailwind directives). postcss.config.mjs uses @tailwindcss/postcss plugin. No tailwind.config needed.`

  const ignoreDirs = framework === 'nuxt' ? '.nuxt, .output' : framework === 'astro' ? 'dist' : '.next'

  return `You are Maestro Planner, a senior software architect for a vibe-coding IDE.
The project uses ${fwName}.

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
${fwPatterns}
- Use Prisma ORM for database access.
- Use Tailwind CSS v4 for styling — write ALL UI components from scratch using plain HTML + Tailwind classes. NEVER plan for shadcn/ui, @radix-ui, or headless UI (they are NOT installed). NEVER reference @/components/ui/ imports.
- Include proper auth, validation, and error handling in the plan.
- The plan should be comprehensive enough that another AI can follow it to build the entire app.
- ALWAYS use the LATEST stable package versions. Current versions (March 2026):
  ${fwDeps}

BUILD REQUIREMENTS (include in Implementation Steps):
${fwBuildRules}

CONTAINER & LOCAL DEV (include in File Structure and Implementation Steps):
- docker-compose.yml: app service with build context, env_file: [".env"], ports 3000:3000, restart: unless-stopped. Add postgres/redis services if needed.
- .dockerignore: node_modules, ${ignoreDirs}, .git, *.md, .env*.local, npm-debug.log, .DS_Store, dist, coverage
- .env.example: list ALL env vars with placeholder values (DATABASE_URL, REDIS_URL, auth secrets, API keys, etc.)
- README.md: Quick Start (clone, cp .env.example .env, npm install, prisma generate if needed, npm run dev), Docker section (docker compose up --build), Tech Stack list`
}

/** Generate 3 search queries from the user's request for research */
function generateSearchQueries(message: string, framework: string = 'nextjs'): string[] {
  const fwKeyword = framework === 'nuxt' ? 'nuxt vue' : framework === 'astro' ? 'astro' : 'nextjs'
  const words = message.toLowerCase()
  const queries: string[] = []

  // Always search for the core app type + best practices
  queries.push(`${message.slice(0, 80)} ${fwKeyword} app architecture best practices 2026`)

  // Database/schema query
  if (words.includes('database') || words.includes('postgres') || words.includes('prisma') ||
      words.includes('marketplace') || words.includes('auction') || words.includes('ecommerce') ||
      words.includes('saas') || words.includes('app')) {
    queries.push(`prisma schema ${message.split(' ').slice(0, 6).join(' ')} database design`)
  }

  // UI/UX query
  queries.push(`${message.split(' ').slice(0, 5).join(' ')} UI design patterns modern ${fwKeyword}`)

  return queries.slice(0, 3)
}

/** Run web research using Serper.dev to gather best practices */
export async function researchForPlan(
  message: string,
  publishEvent: (event: PipelineEvent) => void,
  framework: string = 'nextjs',
): Promise<string> {
  publishEvent({ event: 'phase_start', data: { phase: 'researching', description: 'Researching best practices...' } })

  // Get Serper API key from settings
  const serperSetting = await prisma.settings.findUnique({ where: { key: 'serper_api_key' } })
  if (!serperSetting?.value) {
    publishEvent({ event: 'thinking_detail', data: { phase: 'researching', detail: 'No Serper API key — skipping web research' } })
    publishEvent({ event: 'phase_complete', data: { phase: 'researching' } })
    return ''
  }

  const queries = generateSearchQueries(message, framework)
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
  framework: string = 'nextjs',
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
    { role: 'system', content: buildPlannerPrompt(framework) },
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
