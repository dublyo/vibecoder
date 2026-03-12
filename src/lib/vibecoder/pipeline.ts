// VibeCoder AI Pipeline — Direct + Maestro tiers

import { chatCompletion, type ChatMessage } from '../openrouter'
import { getOpenRouterKey } from '../openrouter'
import { classifyMessage } from './classifier'
import { buildFileContext, type FileContext } from './file-context'
import { commitMultipleFiles } from './github'
import { calculateCredits, deductCredits } from '../credits'
import { researchForPlan, generatePlan } from './research-plan'
import { analyzeCode, formatReportForPrompt } from './code-research'
import { prisma } from '../db'

export interface FileChange {
  path: string
  content: string
}

export interface PipelineResult {
  tier: 'direct' | 'maestro'
  response: string
  fileChanges: FileChange[]
  model: string
  inputTokens: number
  outputTokens: number
  creditsCost: number
  commitSha?: string
  plan?: string
}

export interface PipelineEvent {
  event: string
  data: any
}

// ─── HELPERS ──────────────────────────────────────────────

/** Run an async task while sending SSE keepalive pings every 15s to prevent proxy timeouts */
async function withKeepalive<T>(
  task: () => Promise<T>,
  publishEvent: (event: PipelineEvent) => void,
  intervalMs = 15000,
): Promise<T> {
  const timer = setInterval(() => {
    publishEvent({ event: 'keepalive', data: { ts: Date.now() } })
  }, intervalMs)
  try {
    return await task()
  } finally {
    clearInterval(timer)
  }
}

// ─── MODEL CONFIGURATION ──────────────────────────────────
// Use cheap models for most operations, only escalate when needed
const MODELS = {
  classifier: 'google/gemini-2.0-flash-001',
  direct: 'google/gemini-2.0-flash-001',
  maestro: 'deepseek/deepseek-chat-v3-0324',      // ~82% cheaper than claude-sonnet
  maestroFallback: 'anthropic/claude-sonnet-4.6',   // Fallback if cheap model fails
  ralphFix: 'deepseek/deepseek-chat-v3-0324',
}

/** Strip <think>...</think> blocks from reasoning models like DeepSeek R1 */
function stripThinkingBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

/** Parse file changes from AI response (```file:path or ```path format) */
export function parseFileChanges(text: string): FileChange[] {
  const changes: FileChange[] = []
  const cleaned = stripThinkingBlocks(text)

  // Match ```file:path/to/file.tsx or ```path/to/file.tsx (must contain / or .)
  // Supports dynamic route segments like [id], [...slug], [[...catchAll]]
  const regex = /```(?:file:)?([\w\/\.\-\[\]]+)\n([\s\S]*?)```/g
  let match

  while ((match = regex.exec(cleaned)) !== null) {
    const path = match[1].trim()
    const content = match[2].trim()
    // Must look like a file path (contains / or .), not just a language identifier
    const isFilePath = path.includes('/') || path.includes('.')
    if (path && content && !path.includes(' ') && isFilePath) {
      changes.push({ path, content })
    }
  }

  return changes
}

// ─── FRAMEWORK-SPECIFIC INSTRUCTIONS ──────────────────────

function getFrameworkRouting(framework: string): string {
  switch (framework) {
    case 'nuxt':
      return `- For multi-page apps, create SEPARATE page files using Nuxt file-based routing:
  pages/index.vue (homepage), pages/about.vue, pages/listings/index.vue, pages/dashboard.vue, etc.
  Each page file is a Vue SFC with <template>, <script setup lang="ts">, and optional <style>.
  Use <NuxtLink to="/path"> for navigation. Nuxt auto-imports components from components/ directory.`
    case 'astro':
      return `- For multi-page apps, create SEPARATE page files using Astro file-based routing:
  src/pages/index.astro (homepage), src/pages/about.astro, src/pages/listings/index.astro, etc.
  Astro pages use --- frontmatter --- for server logic and HTML/JSX below.
  For interactive islands, create React components in src/components/ and use client:load directive:
  <MyComponent client:load /> — this hydrates the component on page load.
  Use <a href="/path"> for navigation between pages.`
    default: // nextjs
      return `- For multi-page apps, create SEPARATE page files for each route using Next.js App Router convention:
  src/app/page.tsx (homepage), src/app/about/page.tsx, src/app/listings/page.tsx, src/app/dashboard/page.tsx, etc.
  Each page file should export default a React component. The sandbox preview auto-routes between them.`
  }
}

function getFrameworkDeps(framework: string): string {
  switch (framework) {
    case 'nuxt':
      return `- ALWAYS use the LATEST stable versions of all packages. Current versions (March 2026):
  nuxt@^4.2.0, vue@^3.6.0, typescript@^5.9.0, tailwindcss@^4.2.0, @nuxtjs/tailwindcss@^7.0.0, lucide-vue-next@^0.577.0, prisma@^7.5.0, @prisma/client@^7.5.0, @sidebase/nuxt-auth@^0.10.0
- For icons, ALWAYS use lucide-vue-next (e.g. import { Home, Settings, User } from 'lucide-vue-next'). Do NOT use @heroicons/vue or other icon libraries.`
    case 'astro':
      return `- ALWAYS use the LATEST stable versions of all packages. Current versions (March 2026):
  astro@^6.0.0, @astrojs/react@^5.0.0, @astrojs/tailwind@^7.0.0, react@^19.2.0, react-dom@^19.2.0, typescript@^5.9.0, tailwindcss@^4.2.0, lucide-react@^0.577.0, prisma@^7.5.0, @prisma/client@^7.5.0
- For icons in React islands, use lucide-react. For Astro pages, use inline SVGs or lucide-react in client:load islands.`
    default:
      return `- ALWAYS use the LATEST stable versions of all packages. Current versions (March 2026):
  next@^16.1.0, react@^19.2.0, react-dom@^19.2.0, typescript@^5.9.0, tailwindcss@^4.2.0, @tailwindcss/postcss@^4.2.0, lucide-react@^0.577.0, prisma@^7.5.0, @prisma/client@^7.5.0, next-auth@^4.24.0
- For icons, ALWAYS use lucide-react (e.g. import { Home, Settings, User } from 'lucide-react'). Do NOT use @heroicons/react, react-icons, or other icon libraries.`
  }
}

function getFrameworkBackend(framework: string): string {
  switch (framework) {
    case 'nuxt':
      return `BACKEND & API SUPPORT:
- Create Nuxt server routes at server/api/[resource].ts or server/api/[resource]/index.ts
- Server routes use defineEventHandler: export default defineEventHandler(async (event) => { ... })
- Read body with readBody(event), query with getQuery(event), params with event.context.params
- Return data directly (auto-serialized to JSON), throw createError({ statusCode, message }) for errors
- Nuxt auto-imports: defineEventHandler, readBody, getQuery, createError, getRequestIP, etc. — do NOT import from 'h3'
- For database needs, use Prisma: create server/utils/db.ts with PrismaClient singleton
- Access environment variables via useRuntimeConfig() in server routes, or runtimeConfig in nuxt.config.ts
- Client-side env vars use runtimeConfig.public.* (defined in nuxt.config.ts under runtimeConfig.public)
- Create server/utils/db.ts for shared database client, server/utils/redis.ts for Redis client
- IMPORTANT: When introducing new npm packages, ALWAYS output a package.json with all dependencies.`
    case 'astro':
      return `BACKEND & API SUPPORT:
- Create Astro API routes at src/pages/api/[resource].ts
- API routes export named functions: export async function GET({ request }) and POST/PUT/DELETE
- Return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
- For SSR API routes, ensure astro.config.ts has output: 'server' or output: 'hybrid'
- For database needs, use Prisma: create src/lib/db.ts with PrismaClient singleton
- Access environment variables via import.meta.env.KEY_NAME (public: PUBLIC_ prefix, server: no prefix)
- Create src/lib/db.ts for shared database client, src/lib/redis.ts for Redis client
- IMPORTANT: When introducing new npm packages, ALWAYS output a package.json with all dependencies.`
    default:
      return `BACKEND & API SUPPORT:
- When user asks for API routes, create Next.js API routes at api/route.ts or api/[resource]/route.ts
- API route files use: export async function GET/POST/PUT/DELETE(request: Request)
- For database needs, use Prisma patterns: import { PrismaClient } from '@prisma/client'
- Create prisma/schema.prisma when user needs a database schema
- For data fetching in components, use fetch('/api/...') with proper error handling
- Access environment variables via process.env.KEY_NAME (server-side) or NEXT_PUBLIC_ prefix (client-side)
- Create lib/db.ts for shared database client instances
- Support Redis patterns: import { createClient } from 'redis'
- IMPORTANT: When introducing new npm packages (prisma, redis, etc), ALWAYS output a package.json file with the required dependencies. If one already exists in the project, add to it. If not, create one with name, version, scripts (dev, build, start), and all needed dependencies.`
  }
}

function getFrameworkBuildRules(framework: string): string {
  switch (framework) {
    case 'nuxt':
      return `NUXT BUILD RULES:
- nuxt.config.ts is the central config — define runtimeConfig, modules, css, etc. there
- Nuxt auto-imports Vue composables (ref, computed, watch, etc.) and Nuxt composables (useRoute, useFetch, useAsyncData, etc.) — do NOT import them manually
- Components in components/ are auto-imported — do NOT import them in pages or other components
- Use <script setup lang="ts"> in all Vue SFCs — this is the recommended Nuxt 4 pattern
- For data fetching, use useFetch('/api/...') or useAsyncData() — NOT raw fetch() in components
- Tailwind CSS: use @nuxtjs/tailwindcss module, configure in nuxt.config.ts modules array
- When using Prisma, add "postinstall": "prisma generate" to package.json scripts`
    case 'astro':
      return `ASTRO BUILD RULES:
- astro.config.ts is the central config — define integrations (react, tailwind), output mode, etc.
- Astro pages (.astro files) are server-rendered by default — NO JavaScript shipped to client
- For interactivity, use React components with client:load, client:idle, or client:visible directives
- NEVER add client directives to .astro components — only to framework components (React, Vue, etc.)
- Use --- frontmatter --- in .astro files for server-side imports, data fetching, and logic
- Astro supports both static (output: 'static') and SSR (output: 'server') modes
- For dynamic routes, use [...slug].astro or [id].astro with getStaticPaths() (static) or params (SSR)
- When using Prisma, add "postinstall": "prisma generate" to package.json scripts`
    default:
      return `NEXT.JS BUILD RULES:
- Pages/components that fetch data from a database (Prisma, etc.) MUST add: export const dynamic = 'force-dynamic'
  This prevents Next.js from trying to render them at build time when no DB is available.
- next.config.ts MUST include: typescript: { ignoreBuildErrors: true } and eslint: { ignoreDuringBuilds: true }
  This prevents type-only errors (like NextAuth beta types) from blocking the build.
- CSS imports in layout.tsx must use correct relative paths (e.g. '../styles/globals.css', NOT './globals.css' if the CSS is in a different directory)
- When using Prisma, the Dockerfile MUST include: RUN npx prisma generate (before npm run build)
- NextAuth v5 (next-auth@^5) route files must ONLY export GET and POST. Do NOT export authOptions or any other named export — Next.js 15 will reject it.
- For NextAuth v5 routes: const handler = NextAuth({...}); export { handler as GET, handler as POST }`
  }
}

function getFrameworkComponentRules(framework: string): string {
  switch (framework) {
    case 'nuxt':
      return `- Components are Vue SFCs (.vue) with <template>, <script setup lang="ts">, optional <style>
- SPLIT code into multiple files: create separate components in components/ (e.g. components/Header.vue, components/Footer.vue, components/ProductCard.vue)
- Components in components/ are auto-imported — use them directly in templates without import statements
- Use Vue 3 Composition API: ref(), computed(), watch(), onMounted(), etc. (auto-imported by Nuxt)
- Use Tailwind classes in templates, NOT separate CSS files
- For layouts, create layouts/default.vue with <slot /> — pages auto-use it`
    case 'astro':
      return `- Astro pages (.astro) use HTML-like syntax with --- frontmatter --- for server logic
- For interactive components, create React components in src/components/ (.tsx files)
- SPLIT code: Astro pages for layout/routing, React components for interactive islands
- React components MUST be mounted with client:load (or client:idle, client:visible) in .astro files
- Static content should be in .astro files (zero JS), interactive parts in React islands
- Use Tailwind classes, NOT separate CSS files
- Shared layouts go in src/layouts/Layout.astro with <slot /> for content`
    default:
      return `- App.tsx MUST have \`export default function App()\` — it is the entry point
- Other component files MUST use \`export default function ComponentName()\`
- SPLIT code into multiple files: create separate files for distinct components (e.g. components/Header.tsx, components/Footer.tsx, components/ProductCard.tsx)
- App.tsx should import and compose components from other files
- ALWAYS write React JSX/TSX (export default function), NEVER raw HTML
- Use inline styles or Tailwind classes, not separate CSS files`
  }
}

function getFrameworkNeverModify(framework: string): string {
  const base = `- .github/workflows/deploy.yml — NEVER touch the CI/CD workflow. Do NOT add test jobs, lint jobs, or extra steps.
- Dockerfile — only modify if fixing a Docker build error. Never add test stages.`
  switch (framework) {
    case 'nuxt':
      return `${base}
- nuxt.config.ts — it already has the correct SSR and build settings. Do NOT create nuxt.config.js.`
    case 'astro':
      return `${base}
- astro.config.ts — it already has the correct integrations and output mode. Do NOT create astro.config.mjs.`
    default:
      return `${base}
- next.config.ts — it already has output: 'standalone'. Do NOT create next.config.js (it would override next.config.ts).`
  }
}

function buildDirectCoderPrompt(framework: string): string {
  return `You are a precise code editor for a vibe-coding IDE. You receive a coding request and the current file contents.
The project uses the ${framework === 'nuxt' ? 'Nuxt 4' : framework === 'astro' ? 'Astro 6' : 'Next.js 16'} framework.

Respond in TWO parts:

**Part 1 — Summary** (shown to user in chat):
Write 1-3 sentences explaining what you changed and why. Use a numbered list if multiple changes. Do NOT include any code in this section.

**Part 2 — File outputs** (parsed automatically):
Output each changed file using EXACTLY this format:

\`\`\`file:path/to/file.${framework === 'nuxt' ? 'vue' : framework === 'astro' ? 'astro' : 'tsx'}
// complete file content here
\`\`\`

CRITICAL RULES:
- You MUST use \`\`\`file:path format. Example: \`\`\`file:${framework === 'nuxt' ? 'pages/index.vue' : framework === 'astro' ? 'src/pages/index.astro' : 'App.tsx'}
- Do NOT use \`\`\`tsx or \`\`\`typescript or \`\`\`vue — always \`\`\`file:filename
${getFrameworkComponentRules(framework)}
${getFrameworkRouting(framework)}
- Output COMPLETE file content (not diffs), including all imports
- Only output files that need changes
- Keep changes minimal and focused

DEPENDENCY RULES:
${getFrameworkDeps(framework)}
- EVERY npm package you import MUST be listed in package.json. If you import a new package, you MUST also output an updated package.json with it in dependencies.
- Prefer built-in APIs and framework patterns over adding new packages when possible.
- DO NOT use @radix-ui packages, shadcn/ui, or headless UI. Write UI components from scratch using Tailwind CSS.
- Only use packages you are CERTAIN exist on npm. If unsure, write the code yourself instead of importing a library.
- Tailwind CSS v4 uses @import "tailwindcss" in CSS (NOT @tailwind directives). PostCSS config uses @tailwindcss/postcss plugin. No tailwind.config needed — use CSS variables and @theme for customization.

${getFrameworkBackend(framework)}

EXPORT/IMPORT RULES:
- ALWAYS use NAMED exports for reusable components: export { Button } or export function Button()
- When a file has a named export, consumers MUST use matching named import: import { Button } from '...'
- If you use "export default", also add a named export: export { MyComponent }; export default MyComponent
- NEVER mix default exports and named imports — they will cause "is not exported" build errors
- Be consistent: if importing as { Foo }, export as { Foo }. If importing as Foo, use export default.

${getFrameworkBuildRules(framework)}

CONTAINER & LOCAL DEV FILES (include on first generation or when creating a new app):
- ALWAYS output a docker-compose.yml with:
  - Service name matching the app (e.g. "app")
  - Build context "." with Dockerfile
  - env_file: [".env"] so all env vars are loaded from .env file
  - ports: ["3000:3000"]
  - restart: unless-stopped
  - If using Prisma/Postgres, add a postgres service with POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB from env vars
  - If using Redis, add a redis service
  - Use a shared network for all services
- ALWAYS output a .dockerignore with: node_modules, ${framework === 'nextjs' ? '.next' : framework === 'nuxt' ? '.nuxt, .output' : 'dist'}, .git, *.md, .env*.local, npm-debug.log, .DS_Store, coverage
- ALWAYS output a .env.example listing every env var the app needs with placeholder values
- ALWAYS output a README.md with Quick Start, Docker, and Tech Stack sections
- These files ensure the app works both locally and in container deployment

NEVER MODIFY these files (they are managed by the platform):
${getFrameworkNeverModify(framework)}`
}

// ─── DIRECT TIER ───────────────────────────────────────────

async function executeDirectPipeline(
  fileContext: FileContext,
  message: string,
  publishEvent: (event: PipelineEvent) => void,
  framework: string = 'nextjs',
): Promise<PipelineResult> {
  const apiKey = await getOpenRouterKey()
  if (!apiKey) throw new Error('OpenRouter API key not configured')

  publishEvent({ event: 'phase_start', data: { phase: 'generating', description: 'Generating code changes...' } })
  publishEvent({ event: 'ai_thinking', data: { phase: 'direct' } })

  const contextStr = fileContext.files
    .map(f => `--- ${f.path} ---\n${f.content}`)
    .join('\n\n')

  const treeStr = fileContext.tree
    .filter(n => n.type === 'file')
    .filter(n => !n.path.startsWith('node_modules/'))
    .map(n => n.path)
    .join('\n')

  const messages: ChatMessage[] = [
    { role: 'system', content: buildDirectCoderPrompt(framework) },
    {
      role: 'user',
      content: `Project file tree:\n${treeStr}\n\nCurrent files:\n${contextStr}\n\nUser request: ${message}`,
    },
  ]

  const genStart = Date.now()
  const model = MODELS.direct
  const response = await withKeepalive(
    () => chatCompletion(model, messages, apiKey, { temperature: 0.3, maxTokens: 8192 }),
    publishEvent,
  )

  const text = response.choices[0]?.message?.content || ''
  const fileChanges = parseFileChanges(text)
  const creditsCost = calculateCredits(model, response.usage.prompt_tokens, response.usage.completion_tokens)

  publishEvent({ event: 'phase_complete', data: { phase: 'generating', durationMs: Date.now() - genStart } })
  publishEvent({ event: 'thinking_detail', data: { phase: 'generating', detail: `Generated ${fileChanges.length} file(s) using ${model.split('/')[1]}` } })

  // Emit per-file events for iterative preview
  for (let i = 0; i < fileChanges.length; i++) {
    publishEvent({
      event: 'file_generated',
      data: { path: fileChanges[i].path, content: fileChanges[i].content, index: i, total: fileChanges.length },
    })
  }

  publishEvent({
    event: 'ai_complete',
    data: { filesChanged: fileChanges.map(f => f.path), creditsCost, model },
  })

  return {
    tier: 'direct',
    response: stripThinkingBlocks(text),
    fileChanges,
    model,
    inputTokens: response.usage.prompt_tokens,
    outputTokens: response.usage.completion_tokens,
    creditsCost,
  }
}

// ─── MAESTRO TIER ──────────────────────────────────────────

function buildMaestroPrompt(framework: string): string {
  return `You are Maestro, an AI architect for a vibe-coding IDE.
The project uses the ${framework === 'nuxt' ? 'Nuxt 4' : framework === 'astro' ? 'Astro 6' : 'Next.js 16'} framework.
Break down the user's coding request into a plan, then implement ALL the changes yourself.

Respond in TWO parts:

**Part 1 — Plan & Summary** (shown to user in chat):
Write a brief numbered plan (2-5 steps) of what you'll change. Do NOT include code in this section.

**Part 2 — File outputs** (parsed automatically):
Output each file using EXACTLY this format:

\`\`\`file:path/to/file.${framework === 'nuxt' ? 'vue' : framework === 'astro' ? 'astro' : 'tsx'}
// complete file content here
\`\`\`

CRITICAL RULES:
- You MUST use \`\`\`file:path format. Example: \`\`\`file:${framework === 'nuxt' ? 'pages/index.vue' : framework === 'astro' ? 'src/pages/index.astro' : 'App.tsx'}
- Do NOT use \`\`\`tsx or \`\`\`typescript or \`\`\`vue — always \`\`\`file:filename
- ALWAYS split code into MULTIPLE FILES with proper component architecture:
  - Put each major UI section in its own file (e.g. components/Header.${framework === 'nuxt' ? 'vue' : 'tsx'}, components/Hero.${framework === 'nuxt' ? 'vue' : 'tsx'}, etc.)
  - Put shared types in types.ts, utilities in utils.ts, constants/data in data.ts
${getFrameworkComponentRules(framework)}
${getFrameworkRouting(framework)}
  Every link in the navbar MUST have a corresponding page file.
- Output COMPLETE file content (not diffs), including all imports
- Ensure files work together (consistent naming, proper imports between files)
- Follow the project's existing patterns

DEPENDENCY RULES:
${getFrameworkDeps(framework)}
- EVERY npm package you import MUST be listed in package.json. If you import a new package, you MUST also output an updated package.json with it in dependencies.
- Prefer built-in APIs and framework patterns over adding new packages when possible.
- DO NOT use @radix-ui packages, shadcn/ui, or headless UI. Write UI components from scratch using Tailwind CSS.
- Only use packages you are CERTAIN exist on npm. If unsure, write the code yourself instead of importing a library.
- Tailwind CSS v4 uses @import "tailwindcss" in CSS (NOT @tailwind directives). PostCSS config uses @tailwindcss/postcss plugin. No tailwind.config needed — use CSS variables and @theme for customization.

${getFrameworkBackend(framework)}

EXPORT/IMPORT RULES:
- ALWAYS use NAMED exports for reusable components: export { Button } or export function Button()
- When a file has a named export, consumers MUST use matching named import: import { Button } from '...'
- If you use "export default", also add a named export: export { MyComponent }; export default MyComponent
- NEVER mix default exports and named imports — they will cause "is not exported" build errors
- Be consistent: if importing as { Foo }, export as { Foo }. If importing as Foo, use export default.

${getFrameworkBuildRules(framework)}

CONTAINER & LOCAL DEV FILES (include on first generation or when creating a new app):
- ALWAYS output a docker-compose.yml with:
  - Service name matching the app (e.g. "app")
  - Build context "." with Dockerfile
  - env_file: [".env"] so all env vars are loaded from .env file
  - ports: ["3000:3000"]
  - restart: unless-stopped
  - If using Prisma/Postgres, add a postgres service with POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB from env vars
  - If using Redis, add a redis service
  - Use a shared network for all services
- ALWAYS output a .dockerignore with: node_modules, ${framework === 'nextjs' ? '.next' : framework === 'nuxt' ? '.nuxt, .output' : 'dist'}, .git, *.md, .env*.local, npm-debug.log, .DS_Store, coverage
- ALWAYS output a .env.example listing every env var the app needs with placeholder values
- ALWAYS output a README.md with Quick Start, Docker, and Tech Stack sections
- These files ensure the app works both locally and in container deployment

NEVER MODIFY these files (they are managed by the platform):
${getFrameworkNeverModify(framework)}`
}

async function executeMaestroPipeline(
  fileContext: FileContext,
  message: string,
  publishEvent: (event: PipelineEvent) => void,
  plan?: string | null,
  codeResearch?: string | null,
  framework: string = 'nextjs',
): Promise<PipelineResult> {
  const apiKey = await getOpenRouterKey()
  if (!apiKey) throw new Error('OpenRouter API key not configured')

  publishEvent({ event: 'phase_start', data: { phase: 'planning', description: 'Planning architectural changes...' } })
  publishEvent({ event: 'ai_thinking', data: { phase: 'maestro_planning' } })

  const contextStr = fileContext.files
    .map(f => `--- ${f.path} ---\n${f.content}`)
    .join('\n\n')

  const treeStr = fileContext.tree
    .filter(n => n.type === 'file')
    .filter(n => !n.path.startsWith('node_modules/'))
    .map(n => n.path)
    .join('\n')

  const messages: ChatMessage[] = [
    { role: 'system', content: buildMaestroPrompt(framework) },
    {
      role: 'user',
      content: `Framework: ${fileContext.packageJson?.name || 'unknown'}
Dependencies: ${JSON.stringify(fileContext.packageJson?.dependencies || {}, null, 2)}

Project file tree:
${treeStr}

Current files:
${contextStr}
${codeResearch ? `
CODE ANALYSIS (follow these existing patterns — do NOT break existing code):
${codeResearch}

` : ''}${plan ? `
PROJECT PLAN (you MUST follow this plan exactly — implement all steps):
${plan}

` : ''}User request: ${message}`,
    },
  ]

  publishEvent({ event: 'phase_complete', data: { phase: 'planning' } })
  publishEvent({ event: 'phase_start', data: { phase: 'generating', description: 'Generating code with AI...' } })
  publishEvent({ event: 'ai_thinking', data: { phase: 'maestro_executing' } })

  // Try cheap model first, fallback to premium if it produces no file changes
  const genStart = Date.now()
  let model = MODELS.maestro
  let response = await withKeepalive(
    () => chatCompletion(model, messages, apiKey, { temperature: 0.3, maxTokens: 16384 }),
    publishEvent,
  )

  let text = response.choices[0]?.message?.content || ''
  let fileChanges = parseFileChanges(text)

  // Fallback: if cheap model produced no file changes, try premium
  if (fileChanges.length === 0 && text.length > 0) {
    publishEvent({ event: 'thinking_detail', data: { phase: 'generating', detail: `${model.split('/')[1]} produced no files, escalating to Claude...` } })
    model = MODELS.maestroFallback
    response = await withKeepalive(
      () => chatCompletion(model, messages, apiKey, { temperature: 0.3, maxTokens: 16384 }),
      publishEvent,
    )
    text = response.choices[0]?.message?.content || ''
    fileChanges = parseFileChanges(text)
  }

  const creditsCost = calculateCredits(model, response.usage.prompt_tokens, response.usage.completion_tokens)

  publishEvent({ event: 'phase_complete', data: { phase: 'generating', durationMs: Date.now() - genStart } })
  publishEvent({ event: 'thinking_detail', data: { phase: 'generating', detail: `Generated ${fileChanges.length} file(s) using ${model.split('/')[1]}` } })

  // Emit per-file events for iterative preview
  for (let i = 0; i < fileChanges.length; i++) {
    publishEvent({
      event: 'file_generated',
      data: { path: fileChanges[i].path, content: fileChanges[i].content, index: i, total: fileChanges.length },
    })
  }

  publishEvent({
    event: 'ai_complete',
    data: { filesChanged: fileChanges.map(f => f.path), creditsCost, model },
  })

  return {
    tier: 'maestro',
    response: stripThinkingBlocks(text),
    fileChanges,
    model,
    inputTokens: response.usage.prompt_tokens,
    outputTokens: response.usage.completion_tokens,
    creditsCost,
  }
}

// ─── MAIN PIPELINE ─────────────────────────────────────────

export async function runPipeline(
  projectId: string,
  message: string,
  publishEvent: (event: PipelineEvent) => void,
): Promise<PipelineResult> {
  const project = await prisma.vcProject.findUnique({ where: { id: projectId } })
  if (!project) throw new Error('Project not found')

  // 1. Classify complexity
  publishEvent({ event: 'phase_start', data: { phase: 'classifying', description: 'Analyzing your request...' } })
  publishEvent({ event: 'ai_classifying', data: {} })
  const classifyStart = Date.now()
  const classification = await classifyMessage(message)
  publishEvent({ event: 'phase_complete', data: { phase: 'classifying', durationMs: Date.now() - classifyStart } })
  publishEvent({ event: 'thinking_detail', data: { phase: 'classifying', detail: `${classification.tier} tier (${(classification.confidence * 100).toFixed(0)}% confidence) — ${classification.reasoning}` } })
  publishEvent({ event: 'ai_classified', data: { tier: classification.tier, estimatedCredits: classification.estimatedCredits } })

  // 2. Build file context
  publishEvent({ event: 'phase_start', data: { phase: 'selecting_files', description: 'Selecting relevant files...' } })
  const ctxStart = Date.now()
  const fileContext = await buildFileContext(project.githubRepo, projectId, message, project.framework)
  publishEvent({ event: 'phase_complete', data: { phase: 'selecting_files', durationMs: Date.now() - ctxStart } })
  publishEvent({ event: 'thinking_detail', data: { phase: 'selecting_files', detail: `Selected ${fileContext.files.length} files for context` } })

  // 2.5 Code Research + Web Research + Plan (for maestro tier)
  let plan: string | null = project.plan || null
  let codeResearchReport: string | null = null

  if (classification.tier === 'maestro') {
    // Run code research in parallel with web research (both cheap, both async)
    const codeResearchPromise = analyzeCode(project.githubRepo, projectId, message, publishEvent)
      .then(report => report ? formatReportForPrompt(report) : null)
      .catch(() => null)

    if (classification.needsPlan && !project.plan) {
      // Run web research + code research in parallel
      const [researchContext, codeReport] = await Promise.all([
        researchForPlan(message, publishEvent, project.framework),
        codeResearchPromise,
      ])

      codeResearchReport = codeReport

      // Generate architectural plan (with code research context)
      const planContext = codeReport
        ? `${researchContext}\n\nEXISTING CODE ANALYSIS:\n${codeReport}`
        : researchContext
      plan = await generatePlan(message, planContext, fileContext, publishEvent, project.framework)

      // Emit plan to client
      publishEvent({ event: 'plan_generated', data: { plan } })

      // Persist plan on project
      await prisma.vcProject.update({
        where: { id: projectId },
        data: { plan },
      })
    } else {
      // No plan needed but still run code research for modification accuracy
      codeResearchReport = await codeResearchPromise
    }
  }

  // 3. Execute appropriate pipeline
  let result: PipelineResult

  if (classification.tier === 'maestro') {
    result = await executeMaestroPipeline(fileContext, message, publishEvent, plan, codeResearchReport, project.framework)
    if (plan) result.plan = plan
  } else {
    // Even direct tier gets plan context for follow-up edits
    if (plan) result = await executeDirectPipeline(fileContext, `[Project Plan for context: ${plan.slice(0, 1000)}]\n\n${message}`, publishEvent, project.framework)
    else result = await executeDirectPipeline(fileContext, message, publishEvent, project.framework)
  }

  // 4. Commit file changes to GitHub
  if (result.fileChanges.length > 0) {
    publishEvent({ event: 'phase_start', data: { phase: 'committing', description: 'Committing to GitHub...' } })
    publishEvent({ event: 'git_committing', data: { fileCount: result.fileChanges.length } })

    try {
      const commitSha = await commitMultipleFiles(
        project.githubRepo,
        result.fileChanges,
        `vibecoder: ${message.slice(0, 72)}`,
      )

      result.commitSha = commitSha
      publishEvent({ event: 'phase_complete', data: { phase: 'committing' } })
      publishEvent({ event: 'git_pushed', data: { commitSha } })

      // Create deployment record
      await prisma.vcDeployment.create({
        data: {
          projectId,
          commitSha,
          status: 'pending',
        },
      })
    } catch (err: any) {
      publishEvent({ event: 'git_error', data: { error: err.message } })
    }
  }

  // 5. Deduct credits
  await deductCredits(project.userId, result.creditsCost, `VibeCoder ${result.tier}: ${message.slice(0, 50)}`)

  // 6. Update project stats
  await prisma.vcProject.update({
    where: { id: projectId },
    data: {
      totalCreditsUsed: { increment: result.creditsCost },
      messageCount: { increment: 1 },
    },
  })

  return result
}
