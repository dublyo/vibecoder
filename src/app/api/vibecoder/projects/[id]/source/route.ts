import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getAuthCookie } from '@/lib/auth'
import { getFileTree, getFileContent } from '@/lib/vibecoder/github'

async function getUser() {
  const token = await getAuthCookie()
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return prisma.user.findUnique({ where: { id: payload.userId } })
}

// Source file extensions we want to load for preview
const SOURCE_EXTENSIONS = /\.(tsx|jsx|ts|js|css|html|json|svg|md)$/
const SKIP_PATHS = /^(node_modules|\.next|\.git|dist|build|\.github|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)/

// GET /api/vibecoder/projects/[id]/source — return all source files as a map for Sandpack preview
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const project = await prisma.vcProject.findFirst({ where: { id: projectId, userId: user.id } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  try {
    const tree = await getFileTree(project.githubRepo, project.githubBranch)
    const sourceFiles = tree.filter(n =>
      n.type === 'file' &&
      SOURCE_EXTENSIONS.test(n.path) &&
      !SKIP_PATHS.test(n.path) &&
      (n.size || 0) < 100000 // skip files > 100KB
    )

    // Limit to 30 files to avoid rate limits and slow loads
    const filesToFetch = sourceFiles.slice(0, 30)

    const fileContents: Record<string, string> = {}
    const results = await Promise.allSettled(
      filesToFetch.map(async (f) => {
        const content = await getFileContent(project.githubRepo, f.path, project.githubBranch)
        if (content) {
          fileContents[f.path] = content.content
        }
      })
    )

    return NextResponse.json({ files: fileContents })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
