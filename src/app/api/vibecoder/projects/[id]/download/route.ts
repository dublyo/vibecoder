import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getAuthCookie } from '@/lib/auth'
import { getFileTree, getFileContent } from '@/lib/vibecoder/github'
import archiver from 'archiver'
import { PassThrough } from 'stream'

async function getUser() {
  const token = await getAuthCookie()
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return prisma.user.findUnique({ where: { id: payload.userId } })
}

const SOURCE_EXT = /\.(tsx|jsx|ts|js|css|html|json|svg|md|mjs|cjs)$/
const SKIP = /^(node_modules|\.next|\.git|dist|build|\.github)/

/** Generate scaffold files based on framework */
function getScaffoldFiles(framework: string, projectName: string): Record<string, string> {
  const files: Record<string, string> = {}

  if (framework === 'nextjs' || framework === 'react') {
    files['package.json'] = JSON.stringify({
      name: projectName,
      version: '1.0.0',
      private: true,
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
      },
      dependencies: {
        next: '^14.2.0',
        react: '^18.3.0',
        'react-dom': '^18.3.0',
      },
      devDependencies: {
        typescript: '^5.5.0',
        '@types/react': '^18.3.0',
        '@types/react-dom': '^18.3.0',
        '@types/node': '^20.14.0',
      },
    }, null, 2)

    files['tsconfig.json'] = JSON.stringify({
      compilerOptions: {
        target: 'es5',
        lib: ['dom', 'dom.iterable', 'esnext'],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'preserve',
        incremental: true,
        paths: { '@/*': ['./src/*'] },
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
      exclude: ['node_modules'],
    }, null, 2)

    files['next.config.mjs'] = `/** @type {import('next').NextConfig} */
const nextConfig = {}
export default nextConfig
`
    files['.gitignore'] = `node_modules/
.next/
dist/
.env.local
`
  } else if (framework === 'astro') {
    files['package.json'] = JSON.stringify({
      name: projectName,
      version: '1.0.0',
      scripts: {
        dev: 'astro dev',
        build: 'astro build',
        preview: 'astro preview',
      },
      dependencies: {
        astro: '^4.0.0',
      },
    }, null, 2)
  } else {
    // Generic fallback
    files['package.json'] = JSON.stringify({
      name: projectName,
      version: '1.0.0',
      private: true,
      scripts: {
        dev: 'npx serve .',
      },
    }, null, 2)
  }

  return files
}

// GET /api/vibecoder/projects/[id]/download — download project as scaffolded zip
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const project = await prisma.vcProject.findFirst({ where: { id: projectId, userId: user.id } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const slug = project.slug || project.name.toLowerCase().replace(/\s+/g, '-')

  try {
    // Fetch all source files from GitHub
    const tree = await getFileTree(project.githubRepo, project.githubBranch)
    const sourceFiles = tree.filter(n =>
      n.type === 'file' &&
      SOURCE_EXT.test(n.path) &&
      !SKIP.test(n.path) &&
      (n.size || 0) < 500000
    )

    // Fetch file contents in parallel
    const fileContents: Record<string, string> = {}
    const results = await Promise.allSettled(
      sourceFiles.slice(0, 50).map(async (f) => {
        const content = await getFileContent(project.githubRepo, f.path, project.githubBranch)
        if (content) fileContents[f.path] = content.content
      })
    )

    // Get scaffold files (package.json, tsconfig, etc.)
    const scaffold = getScaffoldFiles(project.framework, slug)

    // Build zip using archiver
    const archive = archiver('zip', { zlib: { level: 9 } })
    const chunks: Buffer[] = []
    const passthrough = new PassThrough()

    passthrough.on('data', (chunk: Buffer) => chunks.push(chunk))

    const archiveComplete = new Promise<Buffer>((resolve, reject) => {
      passthrough.on('end', () => resolve(Buffer.concat(chunks)))
      archive.on('error', reject)
    })

    archive.pipe(passthrough)

    // Add scaffold files (only if not already in repo)
    for (const [path, content] of Object.entries(scaffold)) {
      if (!fileContents[path]) {
        archive.append(content, { name: `${slug}/${path}` })
      }
    }

    // Add repo source files — place in src/ for Next.js structure if they're bare .tsx files
    for (const [path, content] of Object.entries(fileContents)) {
      // If the file is at root level (like index.tsx), place it in src/app/ for Next.js
      const isRootComponent = /^[^/]+\.(tsx|jsx)$/.test(path) && !path.includes('config')
      let destPath = path

      if (isRootComponent && (project.framework === 'nextjs' || project.framework === 'react')) {
        // Root tsx/jsx files → src/app/page.tsx (Next.js convention)
        if (path === 'index.tsx' || path === 'index.jsx') {
          destPath = 'src/app/page.tsx'
        } else {
          destPath = `src/components/${path}`
        }

        // Also create a layout.tsx if we're putting files in src/app/
        if (!fileContents['src/app/layout.tsx'] && !scaffold['src/app/layout.tsx']) {
          const layoutContent = `import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '${project.name}',
  description: 'Generated by VibeCoder',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`
          archive.append(layoutContent, { name: `${slug}/src/app/layout.tsx` })
          scaffold['src/app/layout.tsx'] = layoutContent // prevent dupes
        }
      }

      archive.append(content, { name: `${slug}/${destPath}` })
    }

    // Add a README
    if (!fileContents['README.md']) {
      archive.append(`# ${project.name}\n\nGenerated by VibeCoder.\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`, { name: `${slug}/README.md` })
    }

    archive.finalize()
    const zipBuffer = await archiveComplete

    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${slug}.zip"`,
        'Content-Length': String(zipBuffer.length),
      },
    })
  } catch (err: any) {
    console.error('Download error:', err)
    return NextResponse.json({ error: err.message || 'Download failed' }, { status: 500 })
  }
}
