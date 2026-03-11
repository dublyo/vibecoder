import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

const SAFE_PATH_SEGMENT = /^[a-zA-Z0-9._-]+$/

// Install a skill from skills.sh (GitHub-hosted SKILL.md files)
// Accepts:
//   - owner/repo (SKILL.md at root)
//   - owner/repo/skill-name (skills/skill-name/SKILL.md)
//   - https://skills.sh/owner/repo/skill-name (full URL)
//   - npx skills add https://github.com/owner/repo --skill skill-name (CLI format)
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()

    // Rate limit
    const rl = checkRateLimit(`skillInstall:${user.id}`, RATE_LIMITS.skillInstall)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const body = await req.json()
    let { skillPath } = body as { skillPath: string }

    if (!skillPath?.trim()) {
      return NextResponse.json(
        { error: 'Skill path is required' },
        { status: 400 },
      )
    }

    skillPath = skillPath.trim()

    // Parse various input formats
    // 1. Full skills.sh URL: https://skills.sh/owner/repo/skill-name
    if (skillPath.includes('skills.sh/')) {
      const match = skillPath.match(/skills\.sh\/(.+)/)
      if (match) skillPath = match[1]
    }
    // 2. Full GitHub URL: https://github.com/owner/repo
    if (skillPath.includes('github.com/')) {
      const match = skillPath.match(/github\.com\/([^/]+\/[^/\s]+)/)
      if (match) skillPath = match[1].replace(/\.git$/, '')
    }
    // 3. npx skills add format: extract owner/repo and --skill name
    if (skillPath.includes('npx skills add') || skillPath.includes('--skill')) {
      const repoMatch = skillPath.match(/github\.com\/([^/\s]+\/[^/\s]+)/)
      const skillMatch = skillPath.match(/--skill\s+(\S+)/)
      if (repoMatch && skillMatch) {
        skillPath = `${repoMatch[1].replace(/\.git$/, '')}/${skillMatch[1]}`
      } else if (repoMatch) {
        skillPath = repoMatch[1].replace(/\.git$/, '')
      }
    }

    if (!skillPath.includes('/')) {
      return NextResponse.json(
        { error: 'Invalid skill path. Use format: owner/repo, owner/repo/skill-name, or paste a skills.sh URL' },
        { status: 400 },
      )
    }

    if (skillPath.length > 200) {
      return NextResponse.json({ error: 'Skill path too long' }, { status: 400 })
    }

    const parts = skillPath.split('/')
    const owner = parts[0]
    const repo = parts[1]
    const skillName = parts[2] || null // optional sub-skill

    // Validate path segments to prevent SSRF/path traversal
    if (!SAFE_PATH_SEGMENT.test(owner) || !SAFE_PATH_SEGMENT.test(repo)) {
      return NextResponse.json(
        { error: 'Invalid owner/repo format. Only letters, numbers, dots, hyphens, and underscores are allowed.' },
        { status: 400 },
      )
    }
    if (skillName && !SAFE_PATH_SEGMENT.test(skillName)) {
      return NextResponse.json(
        { error: 'Invalid skill name format. Only letters, numbers, dots, hyphens, and underscores are allowed.' },
        { status: 400 },
      )
    }

    // Build list of URLs to try
    const urlsToTry: string[] = []

    if (skillName) {
      // owner/repo/skill-name -> try multiple patterns
      urlsToTry.push(
        // Exact match: skills/skill-name/SKILL.md
        `https://raw.githubusercontent.com/${owner}/${repo}/main/skills/${skillName}/SKILL.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/master/skills/${skillName}/SKILL.md`,
      )
      // skills.sh often prefixes skill names with owner/repo name, so try stripping common prefixes
      // e.g. "vercel-react-best-practices" -> try "react-best-practices"
      const prefixes = [owner, repo, `${owner}-`, `${repo}-`]
      for (const prefix of prefixes) {
        if (skillName.startsWith(prefix) && skillName.length > prefix.length) {
          const stripped = skillName.startsWith(`${prefix}-`) ? skillName.slice(prefix.length + 1) : skillName.slice(prefix.length)
          if (stripped) {
            urlsToTry.push(`https://raw.githubusercontent.com/${owner}/${repo}/main/skills/${stripped}/SKILL.md`)
          }
        }
      }
      // Also try skill name as a subdirectory directly
      urlsToTry.push(`https://raw.githubusercontent.com/${owner}/${repo}/main/${skillName}/SKILL.md`)
    } else {
      // owner/repo -> look for SKILL.md at root, then in skills/
      urlsToTry.push(
        `https://raw.githubusercontent.com/${owner}/${repo}/main/SKILL.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/master/SKILL.md`,
      )
      // Try listing skills/ directory via GitHub API to find available skills
      try {
        const dirRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/skills`,
          { headers: { Accept: 'application/vnd.github.v3+json' } },
        )
        if (dirRes.ok) {
          const entries = await dirRes.json()
          const dirs = (entries as { name: string; type: string }[]).filter(e => e.type === 'dir')
          for (const dir of dirs) {
            urlsToTry.push(`https://raw.githubusercontent.com/${owner}/${repo}/main/skills/${dir.name}/SKILL.md`)
          }
        }
      } catch { /* continue */ }
    }

    let skillContent: string | null = null
    let sourceUrl = ''
    let resolvedSkillName = skillName

    for (const url of urlsToTry) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) }) // 10s timeout
        if (res.ok) {
          const text = await res.text()
          if (text.length > 100000) continue // skip oversized files
          skillContent = text
          sourceUrl = url
          // Extract the actual skill directory name from the URL
          const dirMatch = url.match(/\/skills\/([^/]+)\/SKILL\.md$/)
          if (dirMatch) resolvedSkillName = dirMatch[1]
          break
        }
      } catch {
        // try next URL
      }
    }

    // If not found, try searching GitHub for the repo name
    if (!skillContent) {
      const searchName = skillName || repo
      try {
        const searchRes = await fetch(
          `https://api.github.com/search/repositories?q=${encodeURIComponent(searchName)}+SKILL+in:name&sort=stars&per_page=5`,
          { headers: { Accept: 'application/vnd.github.v3+json' } },
        )
        if (searchRes.ok) {
          const searchData = await searchRes.json()
          for (const item of searchData.items || []) {
            for (const tryUrl of [
              `https://raw.githubusercontent.com/${item.full_name}/main/SKILL.md`,
              `https://raw.githubusercontent.com/${item.full_name}/main/skills/${searchName}/SKILL.md`,
            ]) {
              try {
                const tryRes = await fetch(tryUrl)
                if (tryRes.ok) {
                  skillContent = await tryRes.text()
                  sourceUrl = tryUrl
                  break
                }
              } catch { /* try next */ }
            }
            if (skillContent) break
          }
        }
      } catch { /* search failed */ }
    }

    if (!skillContent) {
      return NextResponse.json(
        { error: `Could not find SKILL.md for "${skillPath}". Try pasting the full skills.sh URL or use the exact GitHub owner/repo path.` },
        { status: 404 },
      )
    }

    // Try to fetch README or metadata for description
    const finalName = resolvedSkillName || repo
    let description = `Skill installed from skills.sh: ${skillPath}`
    try {
      // Try metadata.json first (skill-level)
      const metaUrl = sourceUrl.replace('/SKILL.md', '/metadata.json')
      const metaRes = await fetch(metaUrl)
      if (metaRes.ok) {
        const meta = await metaRes.json()
        if (meta.abstract) description = (meta.abstract as string).slice(0, 200)
      } else {
        // Fallback to repo README
        const readmeUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`
        const readmeRes = await fetch(readmeUrl)
        if (readmeRes.ok) {
          const readmeText = await readmeRes.text()
          const lines = readmeText.split('\n').filter(l => l.trim())
          const descLine = lines.find(l => !l.startsWith('#') && !l.startsWith('!') && l.length > 10)
          if (descLine) description = descLine.trim().slice(0, 200)
        }
      }
    } catch {
      // keep default description
    }

    const slug = `${owner}-${finalName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    // Check if already installed
    const existing = await prisma.skill.findUnique({ where: { slug } })
    if (existing) {
      // Update existing skill content
      const updated = await prisma.skill.update({
        where: { slug },
        data: {
          content: skillContent,
          sourceUrl,
          description,
        },
      })
      return NextResponse.json({ skill: updated, updated: true })
    }

    const skill = await prisma.skill.create({
      data: {
        name: finalName
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c: string) => c.toUpperCase()),
        slug,
        description,
        content: skillContent,
        icon: '📦',
        category: 'installed',
        source: 'skills.sh',
        sourceUrl,
        userId: user.id,
        isPublic: false,
      },
    })

    return NextResponse.json({ skill, updated: false })
  } catch (err) {
    console.error('[skills/install] Error:', err)
    const msg = process.env.NODE_ENV === 'production' ? 'Failed to install skill' : (err as Error).message
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
