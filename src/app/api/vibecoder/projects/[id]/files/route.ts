import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getAuthCookie } from '@/lib/auth'
import { getFileTree } from '@/lib/vibecoder/file-context'
import { getFileContent, putFileContent, deleteFileContent } from '@/lib/vibecoder/github'

async function getUser() {
  const token = await getAuthCookie()
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return prisma.user.findUnique({ where: { id: payload.userId } })
}

// GET /api/vibecoder/projects/[id]/files — get file tree
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const project = await prisma.vcProject.findFirst({ where: { id: projectId, userId: user.id } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Check if a specific file path is requested
  const filePath = request.nextUrl.searchParams.get('path')

  if (filePath) {
    // Return file content
    const file = await getFileContent(project.githubRepo, filePath, project.githubBranch)
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })
    return NextResponse.json(file)
  }

  // Return file tree
  const tree = await getFileTree(project.githubRepo, projectId)

  // Cache the tree in the project record
  await prisma.vcProject.update({
    where: { id: projectId },
    data: {
      fileTreeCache: JSON.stringify(tree),
      fileTreeUpdatedAt: new Date(),
    },
  })

  return NextResponse.json({ tree })
}

// PUT /api/vibecoder/projects/[id]/files — update a file
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const project = await prisma.vcProject.findFirst({ where: { id: projectId, userId: user.id } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const body = await request.json()
  const { path, content, sha, commitMessage } = body

  if (!path || content === undefined) {
    return NextResponse.json({ error: 'Path and content are required' }, { status: 400 })
  }

  try {
    const result = await putFileContent(
      project.githubRepo,
      path,
      content,
      sha || null,
      commitMessage || `Update ${path}`,
      project.githubBranch,
    )

    // Invalidate cache
    const { invalidateFileCache } = await import('@/lib/vibecoder/file-context')
    await invalidateFileCache(projectId, path)

    return NextResponse.json({ commit: result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/vibecoder/projects/[id]/files?path=... — delete a file
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const project = await prisma.vcProject.findFirst({ where: { id: projectId, userId: user.id } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const filePath = request.nextUrl.searchParams.get('path')
  if (!filePath) return NextResponse.json({ error: 'Path is required' }, { status: 400 })

  try {
    // Get the file SHA first
    const file = await getFileContent(project.githubRepo, filePath, project.githubBranch)
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

    const result = await deleteFileContent(
      project.githubRepo,
      filePath,
      file.sha,
      `Delete ${filePath.split('/').pop()}`,
      project.githubBranch,
    )

    // Invalidate cache
    const { invalidateFileCache } = await import('@/lib/vibecoder/file-context')
    await invalidateFileCache(projectId, filePath)

    return NextResponse.json({ commit: result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
