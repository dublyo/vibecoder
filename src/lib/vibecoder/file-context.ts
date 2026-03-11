// File context system for VibeCoder AI pipeline

import { getFileTree as fetchGitHubTree, getFileContent as fetchGitHubFile, type FileTreeNode, type FileContent } from './github'
import { chatCompletion, type ChatMessage } from '../openrouter'
import { getOpenRouterKey } from '../openrouter'
import { getRedis } from '../redis'

export interface FileContext {
  tree: FileTreeNode[]
  files: FileContent[]
  packageJson: any
  tsConfig: any
}

/** Get file tree with Redis caching */
export async function getFileTree(repo: string, projectId: string): Promise<FileTreeNode[]> {
  const cacheKey = `vc:${projectId}:tree`
  const redis = getRedis()

  if (redis) {
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)
  }

  const tree = await fetchGitHubTree(repo)

  if (redis) {
    await redis.set(cacheKey, JSON.stringify(tree), 'EX', 300) // 5 min TTL
  }

  return tree
}

/** Get file content with Redis caching */
export async function getFile(repo: string, projectId: string, path: string): Promise<FileContent | null> {
  const cacheKey = `vc:${projectId}:file:${path}`
  const redis = getRedis()

  if (redis) {
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)
  }

  const file = await fetchGitHubFile(repo, path)
  if (!file) return null

  if (redis) {
    await redis.set(cacheKey, JSON.stringify(file), 'EX', 600) // 10 min TTL
  }

  return file
}

/** Invalidate cache for a file */
export async function invalidateFileCache(projectId: string, path?: string) {
  const redis = getRedis()
  if (!redis) return

  if (path) {
    await redis.del(`vc:${projectId}:file:${path}`)
  }
  await redis.del(`vc:${projectId}:tree`)
}

/** Build complete file context for an AI request */
export async function buildFileContext(
  repo: string,
  projectId: string,
  userMessage: string,
  framework: string,
): Promise<FileContext> {
  const tree = await getFileTree(repo, projectId)

  // Always include config files
  const configFiles = ['package.json', 'tsconfig.json', 'next.config.ts', 'next.config.js', 'nuxt.config.ts', 'tailwind.config.ts']
  const baseFiles: FileContent[] = []

  for (const configFile of configFiles) {
    if (tree.some(n => n.path === configFile)) {
      const file = await getFile(repo, projectId, configFile)
      if (file) baseFiles.push(file)
    }
  }

  // Smart file selection
  const relevantPaths = await selectRelevantFiles(tree, userMessage, framework)
  const relevantFiles: FileContent[] = []

  for (const path of relevantPaths) {
    if (!baseFiles.some(f => f.path === path)) {
      const file = await getFile(repo, projectId, path)
      if (file) relevantFiles.push(file)
    }
  }

  // Combine and trim to token budget
  const allFiles = [...baseFiles, ...relevantFiles]
  const trimmed = trimToTokenBudget(allFiles, 12000)

  const packageJson = baseFiles.find(f => f.path === 'package.json')
  const tsConfig = baseFiles.find(f => f.path === 'tsconfig.json')

  return {
    tree,
    files: trimmed,
    packageJson: packageJson ? JSON.parse(packageJson.content) : null,
    tsConfig: tsConfig ? JSON.parse(tsConfig.content) : null,
  }
}

/** Use cheap model to pick relevant files */
async function selectRelevantFiles(
  tree: FileTreeNode[],
  message: string,
  framework: string,
): Promise<string[]> {
  const apiKey = await getOpenRouterKey()
  if (!apiKey) return []

  // Only include source files (not node_modules, dist, etc.)
  const sourcePaths = tree
    .filter(n => n.type === 'file')
    .filter(n => !n.path.startsWith('node_modules/'))
    .filter(n => !n.path.startsWith('.next/'))
    .filter(n => !n.path.startsWith('dist/'))
    .filter(n => !n.path.startsWith('.git/'))
    .filter(n => !n.path.endsWith('.lock'))
    .map(n => n.path)

  if (sourcePaths.length <= 10) return sourcePaths

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `Given a coding request and a ${framework} project file tree, select the 3-10 most relevant files. Return a JSON array of file paths only.`,
    },
    {
      role: 'user',
      content: JSON.stringify({ request: message, files: sourcePaths }),
    },
  ]

  try {
    const response = await chatCompletion('google/gemini-2.0-flash-001', messages, apiKey, {
      temperature: 0.1,
      maxTokens: 500,
    })
    const text = response.choices[0]?.message?.content || '[]'
    const match = text.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : sourcePaths.slice(0, 5)
  } catch {
    return sourcePaths.slice(0, 5)
  }
}

/** Trim files to fit within a token budget (rough estimate: 4 chars = 1 token) */
function trimToTokenBudget(files: FileContent[], maxTokens: number): FileContent[] {
  const result: FileContent[] = []
  let totalTokens = 0

  for (const file of files) {
    const fileTokens = Math.ceil(file.content.length / 4)
    if (totalTokens + fileTokens > maxTokens) {
      // Truncate this file to fit remaining budget
      const remainingTokens = maxTokens - totalTokens
      if (remainingTokens > 200) {
        const truncatedContent = file.content.slice(0, remainingTokens * 4) + '\n// ... truncated'
        result.push({ ...file, content: truncatedContent })
      }
      break
    }
    result.push(file)
    totalTokens += fileTokens
  }

  return result
}
