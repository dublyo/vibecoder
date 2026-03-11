import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getAuthCookie } from '@/lib/auth'

const GITHUB_API = 'https://api.github.com'
const GITHUB_PAT = process.env.GITHUB_PAT || ''
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'dublyo'

function getGitHeaders() {
  return { Authorization: `Bearer ${GITHUB_PAT}`, Accept: 'application/vnd.github.v3+json' }
}

async function getUser() {
  const token = await getAuthCookie()
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return prisma.user.findUnique({ where: { id: payload.userId } })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const project = await prisma.vcProject.findFirst({
      where: { id, userId: user.id },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!project.githubRepo) {
      return NextResponse.json(
        { error: 'No GitHub repo linked to this project' },
        { status: 400 }
      )
    }

    const repo = project.githubRepo
    const { searchParams } = new URL(request.url)
    const sha = searchParams.get('sha')
    const branch = searchParams.get('branch') || 'main'
    const perPage = searchParams.get('per_page') || '20'

    // If sha is provided, fetch a specific commit with file diffs
    if (sha) {
      const commitRes = await fetch(
        `${GITHUB_API}/repos/${repo}/commits/${sha}`,
        { headers: getGitHeaders() }
      )

      if (!commitRes.ok) {
        const errBody = await commitRes.text()
        return NextResponse.json(
          { error: `GitHub API error: ${commitRes.status}`, details: errBody },
          { status: commitRes.status }
        )
      }

      const commitData = await commitRes.json()

      return NextResponse.json({
        commit: {
          sha: commitData.sha,
          message: commitData.commit.message,
          author: {
            name: commitData.commit.author.name,
            email: commitData.commit.author.email,
            date: commitData.commit.author.date,
          },
          html_url: commitData.html_url,
          stats: commitData.stats,
        },
        files: (commitData.files || []).map((f: any) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          changes: f.changes,
          patch: f.patch,
        })),
      })
    }

    // Fetch recent commit history
    const commitsRes = await fetch(
      `${GITHUB_API}/repos/${repo}/commits?sha=${branch}&per_page=${perPage}`,
      { headers: getGitHeaders() }
    )

    if (!commitsRes.ok) {
      const errBody = await commitsRes.text()
      return NextResponse.json(
        { error: `GitHub API error: ${commitsRes.status}`, details: errBody },
        { status: commitsRes.status }
      )
    }

    const commitsData = await commitsRes.json()

    const commits = commitsData.map((c: any) => ({
      sha: c.sha,
      message: c.commit.message,
      author: {
        name: c.commit.author.name,
        email: c.commit.author.email,
        date: c.commit.author.date,
      },
      html_url: c.html_url,
    }))

    return NextResponse.json({ commits, branch, total: commits.length })
  } catch (error: any) {
    console.error('Git API error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
