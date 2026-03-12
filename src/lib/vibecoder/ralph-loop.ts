// Ralph Loop — Iterative AI auto-fix cycle inspired by autoresearch
// Pattern: generate → commit → build → evaluate → fix → repeat

import { chatCompletion, type ChatMessage } from '../openrouter'
import { getOpenRouterKey } from '../openrouter'
import { buildFileContext } from './file-context'
import { commitMultipleFiles, getWorkflowRuns, getWorkflowRunLogs } from './github'
import { parseFileChanges, type FileChange, type PipelineEvent } from './pipeline'
import { calculateCredits, deductCredits } from '../credits'
import { prisma } from '../db'

const MAX_FIX_ATTEMPTS = 5

function buildFixPrompt(framework: string): string {
  const fwSpecificErrors = framework === 'nuxt'
    ? `CRITICAL — Nuxt build / Prisma errors:
- If the error mentions "PrismaClientInitializationError" during build:
  Ensure server/utils/db.ts has a proper singleton and is only used in server/ routes.
- If the error mentions module resolution issues with auto-imports:
  Check that the component exists in components/ or the composable exists in composables/.
- For icons, ALWAYS use lucide-vue-next. Do NOT use @heroicons/vue or other icon libraries.
- Use Vue SFCs with <script setup lang="ts">, not JSX.`
    : framework === 'astro'
    ? `CRITICAL — Astro build errors:
- If the error mentions "PrismaClientInitializationError" during build:
  Ensure src/lib/db.ts has a proper singleton and is only used in --- frontmatter --- or API routes.
- If the error mentions "client:load" on an .astro component:
  client directives only work on framework components (React, Vue), NOT on .astro components.
- For icons, use lucide-react in React islands. Do NOT use @heroicons/react or react-icons.
- React components must be in .tsx files and mounted with client:load in .astro pages.`
    : `CRITICAL — Next.js build / Prisma / SSG errors:
- If the error mentions "Validation Error" + "schema.prisma" or "PrismaClientInitializationError" during build:
  This means a Server Component tries to query the database during static generation (SSG).
  Fix by adding "export const dynamic = 'force-dynamic'" to the page that imports the DB-querying component.
- If the error mentions "not a valid Route export field" (e.g. "authOptions"):
  Next.js 15 App Router only allows GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS exports in route files.
  Remove any extra exports (like authOptions, config, etc). Use: const handler = NextAuth({...}); export { handler as GET, handler as POST }
- If the error is about CSS "Module not found: Can't resolve './globals.css'":
  Fix the import path in layout.tsx to match the actual location (e.g. '../styles/globals.css')
- ALWAYS output next.config.ts with typescript: { ignoreBuildErrors: true } and eslint: { ignoreDuringBuilds: true } when fixing type errors
- If Prisma is used and Dockerfile doesn't have "npx prisma generate", output an updated Dockerfile with it
- If the error mentions "Missing: <package> from lock file" or "npm ci" failing:
  The Dockerfile uses "npm ci" which requires package-lock.json to match package.json exactly.
  Fix by outputting an updated Dockerfile that uses "npm install --ignore-scripts" instead of "npm ci --ignore-scripts".
  Also use "COPY package.json package-lock.json* ./" (with asterisk) so it works even without a lock file.`

  const componentStyle = framework === 'nuxt'
    ? `- ALWAYS write Vue SFCs (.vue) with <template>, <script setup lang="ts">, NEVER raw HTML files`
    : `- ALWAYS write React JSX/TSX components, NEVER raw HTML files`

  return `You are an expert code fixer for a vibe-coding IDE. The project uses ${framework === 'nuxt' ? 'Nuxt 4' : framework === 'astro' ? 'Astro 6' : 'Next.js 16'}.
You receive build/test errors and must fix them.

You have full context of the project files and the error output. Fix the issue and respond with:
1. A brief explanation of what went wrong and how you fixed it (1-2 sentences)
2. The complete updated file(s) using this format:

\`\`\`file:path/to/file.${framework === 'nuxt' ? 'vue' : 'tsx'}
// complete file content here
\`\`\`

Rules:
- Only output files that need changes to fix the error
- Output the COMPLETE file content (not diffs)
- Fix the ROOT CAUSE, not just the symptom
- If the error is a missing import, add it
- If the error is a type mismatch, fix the types
- If the error is a syntax error, fix the syntax
- If the error is "Module not found" for a package, ALSO output an updated package.json with the missing dependency added
- For icons, use ${framework === 'nuxt' ? 'lucide-vue-next' : 'lucide-react'}. Do NOT use @heroicons or react-icons.
- EVERY npm package you import MUST be in package.json. If it's missing, output an updated package.json.
- If the error is "404 Not Found" or "ETARGET" or "not in this registry", the package does NOT EXIST. REMOVE it from package.json and rewrite the code to not use it.
- If the error is "Module not found: Can't resolve '@/components/ui/...'" — these shadcn/ui components DO NOT EXIST in the project. REMOVE all imports from "@/components/ui/" and rewrite using plain HTML + Tailwind CSS. For example, replace <Button> with <button className="bg-blue-600 text-white px-4 py-2 rounded">.
- NEVER use @radix-ui packages, shadcn/ui, or headless UI libraries. Write ALL UI from scratch using plain HTML + Tailwind CSS.
- Maintain existing code style
- Include all imports
${componentStyle}
- Use inline styles or Tailwind classes for styling

CRITICAL — Export/Import mismatches ("is not exported" errors):
- If the error says "'Foo' is not exported from './file'", check if the file uses "export default" but is imported as { Foo }
- Fix by EITHER changing the export to named: export { Foo } OR changing the import to default: import Foo from './file'
- When fixing, also check ALL other files that import from the same module — fix them ALL at once
- Best practice: always provide both named and default export: export { Foo }; export default Foo

${fwSpecificErrors}

CRITICAL — Dependency version conflicts (ERESOLVE / peer dependency errors):
- If the error contains "ERESOLVE", "peer dep", "Could not resolve dependency", or version conflicts:
  1. Read the error carefully to identify which packages have incompatible versions
  2. ALWAYS output an updated package.json that resolves the conflict
  3. PREFER upgrading to latest compatible versions
  4. Also output an updated Dockerfile with \`RUN npm install --legacy-peer-deps\` if the error is from Docker build

CRITICAL — GitHub Actions workflow:
- NEVER modify .github/workflows/deploy.yml
- NEVER add test jobs, lint jobs, or any extra jobs to the workflow
- The workflow only has a Docker build job — leave it alone
- If the error is from a "test" job (npm ci, npm test), IGNORE it — focus only on Docker build errors`
}

interface RalphLoopOptions {
  projectId: string
  initialMessage: string
  initialFileChanges: FileChange[]
  commitSha: string
  publishEvent: (event: PipelineEvent) => void
}

interface RalphLoopResult {
  success: boolean
  totalAttempts: number
  totalCredits: number
  finalError?: string
}

/** Clean up build log — strip timestamps and limit length for AI context */
function extractBuildErrors(buildLog: string): string {
  // The log already has errors extracted by getWorkflowRunLogs/extractErrorLines
  // Just clean up timestamps and limit size
  const lines = buildLog.split('\n')
    .map(l => l.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/, '').trim())
    .filter(l => l.length > 0)
    // Filter out noise lines (GitHub Actions metadata, docker cache info)
    .filter(l => !l.startsWith('##[') && !l.startsWith('"maxUsedSpace"') && !l.startsWith('"minFreeSpace"') && !l.startsWith('"reservedSpace"'))

  return lines.slice(0, 150).join('\n')
}

/** Check the Docker build job specifically (not the overall run which may include test jobs) */
async function checkBuildJob(repo: string, runId: number): Promise<{ done: boolean; success: boolean; buildLog: string }> {
  const GITHUB_API = 'https://api.github.com'
  const headers = { Authorization: `Bearer ${process.env.GITHUB_PAT}`, Accept: 'application/vnd.github.v3+json' }

  const jobsRes = await fetch(`${GITHUB_API}/repos/${repo}/actions/runs/${runId}/jobs`, { headers })
  if (!jobsRes.ok) return { done: false, success: false, buildLog: '' }

  const jobsData = await jobsRes.json()
  const jobs = jobsData.jobs || []

  // Find the Docker build job specifically (our scaffold names it "build")
  const buildJob = jobs.find((j: any) => j.name === 'build') || jobs[0]
  if (!buildJob) return { done: false, success: false, buildLog: '' }

  if (buildJob.status !== 'completed') return { done: false, success: false, buildLog: '' }

  if (buildJob.conclusion === 'success') {
    return { done: true, success: true, buildLog: '' }
  }

  // Build job failed — get its logs
  let buildLog = ''
  try {
    buildLog = await getWorkflowRunLogs(repo, runId)
  } catch {
    buildLog = `Build job failed with conclusion: ${buildJob.conclusion}`
  }
  return { done: true, success: false, buildLog }
}

/** Wait for a GitHub Actions build to complete and get the result */
async function waitForBuild(
  repo: string,
  commitSha: string,
  publishEvent: (event: PipelineEvent) => void,
  timeoutMs = 300000, // 5 min default
): Promise<{ success: boolean; buildLog: string }> {
  const startTime = Date.now()
  const pollInterval = 10000 // 10 seconds

  publishEvent({ event: 'build_started', data: { commitSha } })

  while (Date.now() - startTime < timeoutMs) {
    try {
      const runs = await getWorkflowRuns(repo, commitSha)
      if (runs.length > 0) {
        const run = runs[0]

        // Check the build job specifically, not the overall run status
        // This avoids false failures from test jobs that fail on npm ci etc.
        const buildCheck = await checkBuildJob(repo, run.id)

        if (buildCheck.done) {
          if (buildCheck.success) {
            publishEvent({ event: 'build_passed', data: { runId: run.id, duration: Date.now() - startTime } })
            return { success: true, buildLog: '' }
          } else {
            publishEvent({ event: 'build_failed', data: { runId: run.id, error: buildCheck.buildLog.slice(0, 500) } })
            return { success: false, buildLog: buildCheck.buildLog }
          }
        }

        // Still running
        publishEvent({ event: 'build_log', data: { status: run.status, elapsed: Date.now() - startTime } })
      }
    } catch (err: any) {
      publishEvent({ event: 'build_log', data: { warning: `Poll error: ${err.message}` } })
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval))
  }

  // Timeout
  publishEvent({ event: 'build_failed', data: { error: 'Build timed out after 5 minutes' } })
  return { success: false, buildLog: 'Build timed out' }
}

/** Ask AI to fix build/test errors */
async function generateFix(
  repo: string,
  projectId: string,
  framework: string,
  errorOutput: string,
  previousMessage: string,
  attempt: number,
  publishEvent: (event: PipelineEvent) => void,
): Promise<{ fileChanges: FileChange[]; response: string; model: string; inputTokens: number; outputTokens: number }> {
  const apiKey = await getOpenRouterKey()
  if (!apiKey) throw new Error('OpenRouter API key not configured')

  publishEvent({ event: 'auto_fix_attempt', data: { attempt, maxAttempts: MAX_FIX_ATTEMPTS } })

  // Get current file context (fresh, not cached)
  const fileContext = await buildFileContext(repo, projectId, `Fix build errors: ${errorOutput.slice(0, 200)}`, framework)

  const contextStr = fileContext.files
    .map(f => `--- ${f.path} ---\n${f.content}`)
    .join('\n\n')

  const treeStr = fileContext.tree
    .filter(n => n.type === 'file')
    .filter(n => !n.path.startsWith('node_modules/'))
    .map(n => n.path)
    .join('\n')

  const structuredErrors = extractBuildErrors(errorOutput)

  const messages: ChatMessage[] = [
    { role: 'system', content: buildFixPrompt(framework) },
    {
      role: 'user',
      content: `Project: ${framework}
File tree:\n${treeStr}

Current files:\n${contextStr}

Original request that caused the error: ${previousMessage}

BUILD/TEST ERROR OUTPUT (attempt ${attempt}/${MAX_FIX_ATTEMPTS}):
${structuredErrors}

Please fix the errors above. Output the complete corrected file(s).`,
    },
  ]

  // Use cheap model for fixes, fallback to Claude if no changes produced
  const model = 'deepseek/deepseek-chat-v3-0324'
  // Send keepalive pings during AI call to prevent proxy timeouts
  const keepaliveTimer = setInterval(() => {
    publishEvent({ event: 'keepalive', data: { ts: Date.now() } })
  }, 15000)
  let response
  try {
    response = await chatCompletion(model, messages, apiKey, {
      temperature: 0.2,
      maxTokens: 16384,
    })
  } finally {
    clearInterval(keepaliveTimer)
  }

  const text = response.choices[0]?.message?.content || ''
  const fileChanges = parseFileChanges(text)

  return {
    fileChanges,
    response: text,
    model,
    inputTokens: response.usage.prompt_tokens,
    outputTokens: response.usage.completion_tokens,
  }
}

/** Run the Ralph Loop — iterative build-fix cycle */
export async function runRalphLoop(options: RalphLoopOptions): Promise<RalphLoopResult> {
  const { projectId, initialMessage, initialFileChanges, commitSha, publishEvent } = options

  const project = await prisma.vcProject.findUnique({ where: { id: projectId } })
  if (!project) throw new Error('Project not found')

  let totalCredits = 0
  let currentCommitSha = commitSha
  let attempt = 0

  publishEvent({ event: 'ralph_loop_started', data: { maxAttempts: MAX_FIX_ATTEMPTS } })

  // Wait for the initial build
  const initialBuild = await waitForBuild(project.githubRepo, currentCommitSha, publishEvent)

  if (initialBuild.success) {
    publishEvent({ event: 'ralph_loop_complete', data: { success: true, attempts: 0 } })
    return { success: true, totalAttempts: 0, totalCredits: 0 }
  }

  // Build failed — enter the fix loop
  let lastError = initialBuild.buildLog

  while (attempt < MAX_FIX_ATTEMPTS) {
    attempt++

    try {
      // Generate fix
      const fix = await generateFix(
        project.githubRepo,
        projectId,
        project.framework,
        lastError,
        initialMessage,
        attempt,
        publishEvent,
      )

      const fixCredits = calculateCredits(fix.model, fix.inputTokens, fix.outputTokens)
      totalCredits += fixCredits

      if (fix.fileChanges.length === 0) {
        publishEvent({ event: 'ralph_loop_log', data: { message: `Attempt ${attempt}: AI could not identify a fix` } })
        break
      }

      // Commit the fix
      publishEvent({ event: 'git_committing', data: { fileCount: fix.fileChanges.length, attempt } })

      try {
        currentCommitSha = await commitMultipleFiles(
          project.githubRepo,
          fix.fileChanges,
          `ralph-fix #${attempt}: ${initialMessage.slice(0, 50)}`,
        )
        publishEvent({ event: 'git_pushed', data: { commitSha: currentCommitSha, attempt } })
      } catch (err: any) {
        publishEvent({ event: 'ralph_loop_log', data: { message: `Git commit failed: ${err.message}` } })
        break
      }

      // Update deployment record
      await prisma.vcDeployment.updateMany({
        where: { projectId, status: { in: ['pending', 'building', 'failed'] } },
        data: { autoFixAttempts: attempt },
      })

      // Deduct credits for the fix
      await deductCredits(project.userId, fixCredits, `Ralph fix #${attempt}: ${initialMessage.slice(0, 40)}`)

      // Wait for the new build
      const buildResult = await waitForBuild(project.githubRepo, currentCommitSha, publishEvent)

      if (buildResult.success) {
        publishEvent({
          event: 'ralph_loop_complete',
          data: { success: true, attempts: attempt, totalCredits },
        })

        // Send the fix file contents for Sandpack preview
        const fileContents: Record<string, string> = {}
        for (const fc of fix.fileChanges) {
          fileContents[fc.path] = fc.content
        }
        publishEvent({
          event: 'ralph_fix_files',
          data: { fileContents, response: fix.response },
        })

        return { success: true, totalAttempts: attempt, totalCredits }
      }

      // Build still fails — loop again
      lastError = buildResult.buildLog
      publishEvent({
        event: 'ralph_loop_log',
        data: { message: `Fix attempt ${attempt} didn't resolve the build error, trying again...` },
      })
    } catch (err: any) {
      publishEvent({
        event: 'ralph_loop_log',
        data: { message: `Fix attempt ${attempt} error: ${err.message}` },
      })
    }
  }

  // Max attempts reached
  publishEvent({
    event: 'ralph_loop_complete',
    data: {
      success: false,
      attempts: attempt,
      totalCredits,
      finalError: lastError?.slice(0, 500),
    },
  })

  return { success: false, totalAttempts: attempt, totalCredits, finalError: lastError }
}
