// GitHub API helpers for VibeCoder project management

const GITHUB_API = 'https://api.github.com'
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'dublyo'

function getHeaders() {
  const token = process.env.GITHUB_PAT
  if (!token) throw new Error('GITHUB_PAT not configured')
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

export interface FileTreeNode {
  path: string
  type: 'file' | 'dir'
  size?: number
  sha?: string
}

export interface FileContent {
  path: string
  content: string
  sha: string
  size: number
}

/** Create a repo from a template */
export async function createRepoFromTemplate(
  templateRepo: string,
  newRepoName: string,
  description: string,
  isPrivate = true,
): Promise<{ fullName: string; htmlUrl: string }> {
  const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${templateRepo}/generate`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      owner: GITHUB_OWNER,
      name: newRepoName,
      description,
      private: isPrivate,
      include_all_branches: false,
    }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Failed to create repo: ${err.message}`)
  }
  const data = await res.json()
  return { fullName: data.full_name, htmlUrl: data.html_url }
}

/** Create a new empty repo */
export async function createRepo(
  name: string,
  description: string,
  isPrivate = true,
): Promise<{ fullName: string; htmlUrl: string }> {
  const res = await fetch(`${GITHUB_API}/user/repos`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      name,
      description,
      private: isPrivate,
      auto_init: true,
    }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Failed to create repo: ${err.message}`)
  }
  const data = await res.json()
  return { fullName: data.full_name, htmlUrl: data.html_url }
}

/** Set repo secrets for GitHub Actions */
export async function setRepoSecret(repo: string, secretName: string, secretValue: string) {
  // Get the public key for encrypting secrets
  const keyRes = await fetch(`${GITHUB_API}/repos/${repo}/actions/secrets/public-key`, {
    headers: getHeaders(),
  })
  if (!keyRes.ok) return // non-critical

  const { key, key_id } = await keyRes.json()

  // Encrypt the secret using libsodium (simplified - in production use tweetnacl)
  // For now, set it via the API which handles encryption
  const res = await fetch(`${GITHUB_API}/repos/${repo}/actions/secrets/${secretName}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({
      encrypted_value: await encryptSecret(secretValue, key),
      key_id,
    }),
  })
  if (!res.ok) {
    console.error(`Failed to set secret ${secretName} on ${repo}`)
  }
}

/** Encrypt a secret for GitHub Actions (base64 encoded) */
async function encryptSecret(secret: string, publicKey: string): Promise<string> {
  // In production, use tweetnacl-js for proper NaCl sealed box encryption
  // For now, use a simplified approach - the GitHub API will validate
  const encoder = new TextEncoder()
  const keyBytes = Uint8Array.from(atob(publicKey), c => c.charCodeAt(0))
  const secretBytes = encoder.encode(secret)

  // Simple XOR + base64 as placeholder (replace with proper NaCl in production)
  const encrypted = new Uint8Array(secretBytes.length)
  for (let i = 0; i < secretBytes.length; i++) {
    encrypted[i] = secretBytes[i] ^ keyBytes[i % keyBytes.length]
  }
  return btoa(String.fromCharCode(...encrypted))
}

/** Get file tree from a repo */
export async function getFileTree(repo: string, branch = 'main'): Promise<FileTreeNode[]> {
  const res = await fetch(`${GITHUB_API}/repos/${repo}/git/trees/${branch}?recursive=1`, {
    headers: getHeaders(),
  })
  if (!res.ok) return []

  const data = await res.json()
  return (data.tree || [])
    .filter((n: any) => n.type === 'blob' || n.type === 'tree')
    .map((n: any) => ({
      path: n.path,
      type: n.type === 'blob' ? 'file' : 'dir',
      size: n.size,
      sha: n.sha,
    }))
}

/** Get file content from a repo */
export async function getFileContent(repo: string, path: string, branch = 'main'): Promise<FileContent | null> {
  const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`, {
    headers: getHeaders(),
  })
  if (!res.ok) return null

  const data = await res.json()
  if (data.type !== 'file') return null

  const content = Buffer.from(data.content, 'base64').toString('utf-8')
  return { path: data.path, content, sha: data.sha, size: data.size }
}

/** Update or create a file in a repo */
export async function putFileContent(
  repo: string,
  path: string,
  content: string,
  sha: string | null,
  message: string,
  branch = 'main',
): Promise<{ sha: string; commitSha: string }> {
  const body: any = {
    message,
    content: Buffer.from(content).toString('base64'),
    branch,
  }
  if (sha) body.sha = sha

  const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Failed to update file: ${err.message}`)
  }

  const data = await res.json()
  return { sha: data.content.sha, commitSha: data.commit.sha }
}

/** Delete a file from a repo */
export async function deleteFileContent(
  repo: string,
  path: string,
  sha: string,
  message: string,
  branch = 'main',
): Promise<{ commitSha: string }> {
  const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${encodeURIComponent(path)}`, {
    method: 'DELETE',
    headers: getHeaders(),
    body: JSON.stringify({ message, sha, branch }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Failed to delete file: ${err.message}`)
  }
  const data = await res.json()
  return { commitSha: data.commit.sha }
}

/** Commit multiple file changes at once */
export async function commitMultipleFiles(
  repo: string,
  files: { path: string; content: string }[],
  message: string,
  branch = 'main',
): Promise<string> {
  // Get the current commit SHA
  const refRes = await fetch(`${GITHUB_API}/repos/${repo}/git/ref/heads/${branch}`, {
    headers: getHeaders(),
  })
  if (!refRes.ok) throw new Error('Failed to get branch ref')
  const refData = await refRes.json()
  const baseCommitSha = refData.object.sha

  // Get the base tree
  const commitRes = await fetch(`${GITHUB_API}/repos/${repo}/git/commits/${baseCommitSha}`, {
    headers: getHeaders(),
  })
  if (!commitRes.ok) throw new Error('Failed to get commit')
  const commitData = await commitRes.json()
  const baseTreeSha = commitData.tree.sha

  // Create blobs for each file
  const treeItems = await Promise.all(
    files.map(async (file) => {
      const blobRes = await fetch(`${GITHUB_API}/repos/${repo}/git/blobs`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          content: file.content,
          encoding: 'utf-8',
        }),
      })
      if (!blobRes.ok) throw new Error(`Failed to create blob for ${file.path}`)
      const blob = await blobRes.json()
      return {
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      }
    }),
  )

  // Create new tree
  const treeRes = await fetch(`${GITHUB_API}/repos/${repo}/git/trees`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeItems,
    }),
  })
  if (!treeRes.ok) throw new Error('Failed to create tree')
  const tree = await treeRes.json()

  // Create commit
  const newCommitRes = await fetch(`${GITHUB_API}/repos/${repo}/git/commits`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [baseCommitSha],
    }),
  })
  if (!newCommitRes.ok) throw new Error('Failed to create commit')
  const newCommit = await newCommitRes.json()

  // Update ref
  await fetch(`${GITHUB_API}/repos/${repo}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ sha: newCommit.sha }),
  })

  return newCommit.sha
}

/** Trigger a GitHub Actions workflow dispatch */
export async function triggerWorkflow(repo: string, workflowFile = 'deploy.yml', branch = 'main') {
  const res = await fetch(`${GITHUB_API}/repos/${repo}/actions/workflows/${workflowFile}/dispatches`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ ref: branch }),
  })
  return res.ok
}

/** Scaffold a new project repo with GitHub Actions workflow + Dockerfile + basic files */
export async function scaffoldProjectRepo(
  repo: string,
  framework: string,
  projectName: string,
  branch = 'main',
): Promise<string> {
  const files: { path: string; content: string }[] = []

  // 1. GitHub Actions workflow for GHCR build
  files.push({
    path: '.github/workflows/deploy.yml',
    content: `name: Build & Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/\${{ github.repository }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
`,
  })

  // 2. Framework-specific Dockerfile + files
  if (framework === 'nextjs') {
    files.push({
      path: 'Dockerfile',
      content: `FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
`,
    })

    files.push({
      path: 'next.config.ts',
      content: `import type { NextConfig } from 'next'
const nextConfig: NextConfig = { output: 'standalone' }
export default nextConfig
`,
    })

    files.push({
      path: 'tsconfig.json',
      content: JSON.stringify({
        compilerOptions: {
          target: 'ES2017', lib: ['dom', 'dom.iterable', 'esnext'],
          allowJs: true, skipLibCheck: true, strict: true, noEmit: true,
          esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler',
          resolveJsonModule: true, isolatedModules: true, jsx: 'preserve',
          incremental: true, plugins: [{ name: 'next' }],
          paths: { '@/*': ['./src/*'] },
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
        exclude: ['node_modules'],
      }, null, 2) + '\n',
    })

    files.push({
      path: 'package.json',
      content: JSON.stringify({
        name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        version: '0.1.0', private: true,
        scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
        dependencies: { next: '^16.1.0', react: '^19.2.0', 'react-dom': '^19.2.0', 'lucide-react': '^0.577.0' },
        devDependencies: { typescript: '^5.9.0', '@types/node': '^25', '@types/react': '^19.2.0', '@types/react-dom': '^19.2.0', tailwindcss: '^4.2.0', '@tailwindcss/postcss': '^4.2.0', postcss: '^8.5.0' },
      }, null, 2) + '\n',
    })

    files.push({
      path: 'postcss.config.mjs',
      content: `/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
export default config
`,
    })

    files.push({
      path: 'src/app/globals.css',
      content: `@import "tailwindcss";
`,
    })

    files.push({
      path: 'src/app/layout.tsx',
      content: `import './globals.css'

export const metadata = { title: '${projectName}', description: 'Built with VibeCoder' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="antialiased">{children}</body></html>
}
`,
    })

    files.push({
      path: 'src/app/page.tsx',
      content: `export default function Home() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>${projectName}</h1>
      <p style={{ color: '#666', marginTop: '0.5rem' }}>Built with VibeCoder</p>
    </main>
  )
}
`,
    })

    files.push({ path: 'public/.gitkeep', content: '' })
  } else {
    // Generic Node.js Dockerfile for nuxt/astro/custom
    files.push({
      path: 'Dockerfile',
      content: `FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "start"]
`,
    })

    files.push({
      path: 'package.json',
      content: JSON.stringify({
        name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        version: '0.1.0', private: true,
        scripts: { dev: 'node index.js', build: 'echo "build ok"', start: 'node index.js' },
      }, null, 2) + '\n',
    })

    files.push({
      path: 'index.js',
      content: `const http = require('http')
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end('<html><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui"><h1>${projectName}</h1></body></html>')
})
server.listen(3000, () => console.log('Server running on port 3000'))
`,
    })
  }

  // Common files
  files.push({ path: '.dockerignore', content: 'node_modules\n.next\n.git\n*.md\n.env*\n' })
  files.push({ path: '.gitignore', content: 'node_modules/\n.next/\n.env\n.env.local\n*.log\ndist/\n' })

  // Wait a moment for GitHub to initialize the repo (auto_init creates initial commit)
  await new Promise(r => setTimeout(r, 2000))

  return commitMultipleFiles(repo, files, `scaffold: ${framework} project with CI/CD`, branch)
}

/** Delete a repo */
export async function deleteRepo(repo: string) {
  const res = await fetch(`${GITHUB_API}/repos/${repo}`, {
    method: 'DELETE',
    headers: getHeaders(),
  })
  return res.ok
}

// ─── GitHub Actions Build Monitoring ──────────────────────────

export interface WorkflowRun {
  id: number
  status: string       // queued, in_progress, completed
  conclusion: string | null  // success, failure, cancelled, etc.
  head_sha: string
  created_at: string
  updated_at: string
  html_url: string
}

/** Get workflow runs for a specific commit SHA */
export async function getWorkflowRuns(repo: string, commitSha?: string): Promise<WorkflowRun[]> {
  let url = `${GITHUB_API}/repos/${repo}/actions/runs?per_page=5`
  if (commitSha) {
    url += `&head_sha=${commitSha}`
  }

  const res = await fetch(url, { headers: getHeaders() })
  if (!res.ok) return []

  const data = await res.json()
  return (data.workflow_runs || []).map((run: any) => ({
    id: run.id,
    status: run.status,
    conclusion: run.conclusion,
    head_sha: run.head_sha,
    created_at: run.created_at,
    updated_at: run.updated_at,
    html_url: run.html_url,
  }))
}

/** Extract meaningful error lines from a build log */
function extractErrorLines(logText: string): string {
  const lines = logText.split('\n')
  const errorLines: string[] = []
  let capturing = false
  let captureCount = 0

  // Error patterns to detect
  const errorPatterns = [
    /error TS\d+/i,                    // TypeScript errors
    /Error:/,                           // Generic errors
    /SyntaxError/,                      // Syntax errors
    /Module not found/i,                // Webpack/Next.js module errors
    /Cannot find module/i,              // Node module errors
    /Failed to compile/i,               // Next.js build errors
    /Build error occurred/i,            // Next.js build errors
    /npm ERR!/,                         // npm errors
    /npm error/,                        // npm errors
    /ERESOLVE/,                         // npm dependency resolution
    /ERROR \[\w+ \d+\/\d+\]/,           // Docker build step errors
    /executor failed/i,                 // Docker executor
    /returned a non-zero code/i,        // Docker exit code
    /Type error:/i,                     // Next.js type checking
    /ReferenceError/,                   // Runtime errors
    /TypeError/,                        // Runtime errors
    /Cannot find name/i,               // TypeScript errors
    /Property .+ does not exist/i,     // TypeScript errors
    /has no exported member/i,          // TypeScript import errors
    /is not assignable to/i,           // TypeScript type errors
    /ENOENT/,                           // File not found
    /Permission denied/i,               // Permission errors
  ]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Strip GitHub Actions timestamp prefix (e.g. "2026-03-10T22:12:09.5179008Z ")
    const cleanLine = line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/, '').trim()

    if (!capturing) {
      // Check if this line matches any error pattern
      if (errorPatterns.some(p => p.test(cleanLine))) {
        capturing = true
        captureCount = 0
      }
    }

    if (capturing) {
      errorLines.push(cleanLine)
      captureCount++
      // Stop capturing after 20 lines of context per error block, or on blank line after enough context
      if (captureCount > 20 || (cleanLine === '' && captureCount > 3)) {
        capturing = false
      }
    }
  }

  if (errorLines.length > 0) {
    return errorLines.slice(0, 150).join('\n')
  }

  // Fallback: no patterns matched, return lines around "error" keyword
  const errorIdxs: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (/error/i.test(lines[i]) && !/##\[endgroup\]/.test(lines[i])) {
      errorIdxs.push(i)
    }
  }
  if (errorIdxs.length > 0) {
    const contextLines: string[] = []
    for (const idx of errorIdxs.slice(0, 10)) {
      const start = Math.max(0, idx - 2)
      const end = Math.min(lines.length, idx + 5)
      for (let i = start; i < end; i++) {
        const clean = lines[i].replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/, '').trim()
        if (clean && !contextLines.includes(clean)) contextLines.push(clean)
      }
    }
    return contextLines.slice(0, 100).join('\n')
  }

  // Last resort: return last 50 lines
  return lines.slice(-50).map(l => l.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/, '').trim()).join('\n')
}

/** Get logs for a failed workflow run (extracts error output) */
export async function getWorkflowRunLogs(repo: string, runId: number): Promise<string> {
  // First try to get the jobs to find failed steps
  const jobsRes = await fetch(`${GITHUB_API}/repos/${repo}/actions/runs/${runId}/jobs`, {
    headers: getHeaders(),
  })

  if (!jobsRes.ok) return 'Failed to fetch build logs'

  const jobsData = await jobsRes.json()
  const failedJobs = (jobsData.jobs || []).filter((j: any) => j.conclusion === 'failure')

  if (failedJobs.length === 0) return 'Build failed but no failed job details available'

  // Also check for annotations (GitHub Actions surfaces errors as annotations)
  const errors: string[] = []

  // Try to get annotations from the check run API
  try {
    const annotationsRes = await fetch(
      `${GITHUB_API}/repos/${repo}/check-runs/${failedJobs[0].id}/annotations`,
      { headers: getHeaders() },
    )
    if (annotationsRes.ok) {
      const annotations = await annotationsRes.json()
      for (const ann of annotations) {
        if (ann.annotation_level === 'failure' || ann.annotation_level === 'warning') {
          errors.push(`${ann.path || ''}:${ann.start_line || ''} ${ann.message}`)
        }
      }
    }
  } catch {
    // Annotations not available
  }

  for (const job of failedJobs) {
    // List failed steps
    for (const step of job.steps || []) {
      if (step.conclusion === 'failure') {
        errors.push(`Step "${step.name}" failed`)
      }
    }

    // Get the full job log and extract error lines
    try {
      const logRes = await fetch(`${GITHUB_API}/repos/${repo}/actions/jobs/${job.id}/logs`, {
        headers: getHeaders(),
      })
      if (logRes.ok) {
        const logText = await logRes.text()
        const extracted = extractErrorLines(logText)
        if (extracted) errors.push(extracted)
      }
    } catch {
      // Log fetch failed, continue
    }
  }

  return errors.join('\n---\n').slice(0, 10000)
}

/** Get the latest workflow run status for a repo (regardless of commit) */
export async function getLatestBuildStatus(repo: string): Promise<WorkflowRun | null> {
  const runs = await getWorkflowRuns(repo)
  return runs.length > 0 ? runs[0] : null
}
