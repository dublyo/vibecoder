'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, GitCommit, GitBranch, ChevronRight, ChevronDown, ExternalLink, Plus, Minus, FileText } from 'lucide-react'

interface GitTabProps {
  projectId: string
}

interface Commit {
  sha: string
  message: string
  author: { name: string; email: string; date: string }
  html_url: string
}

interface FileDiff {
  filename: string
  status: string
  additions: number
  deletions: number
  changes: number
  patch?: string
}

export function GitTab({ projectId }: GitTabProps) {
  const [commits, setCommits] = useState<Commit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSha, setExpandedSha] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([])
  const [commitStats, setCommitStats] = useState<{ additions: number; deletions: number; total: number } | null>(null)

  const fetchCommits = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/vibecoder/projects/${projectId}/git?per_page=30`)
      if (res.ok) {
        const data = await res.json()
        setCommits(data.commits || [])
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to fetch commits')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchCommits() }, [fetchCommits])

  const fetchDiff = async (sha: string) => {
    if (expandedSha === sha) {
      setExpandedSha(null)
      return
    }
    setExpandedSha(sha)
    setDiffLoading(true)
    setFileDiffs([])
    setCommitStats(null)
    try {
      const res = await fetch(`/api/vibecoder/projects/${projectId}/git?sha=${sha}`)
      if (res.ok) {
        const data = await res.json()
        setFileDiffs(data.files || [])
        setCommitStats(data.commit?.stats || null)
      }
    } catch {} finally {
      setDiffLoading(false)
    }
  }

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'added': return 'text-green-400'
      case 'removed': return 'text-red-400'
      case 'modified': return 'text-yellow-400'
      case 'renamed': return 'text-blue-400'
      default: return 'text-gray-400'
    }
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case 'added': return 'A'
      case 'removed': return 'D'
      case 'modified': return 'M'
      case 'renamed': return 'R'
      default: return '?'
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading git history...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white dark:bg-gray-950 gap-3">
        <GitBranch className="w-8 h-8 text-gray-300 dark:text-gray-600" />
        <p className="text-sm text-gray-500">{error}</p>
        <button
          onClick={fetchCommits}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <GitBranch className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Git History</span>
        <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
          {commits.length} commits
        </span>
        <div className="flex-1" />
        <button
          onClick={fetchCommits}
          className="p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Commit list */}
      <div className="flex-1 overflow-y-auto">
        {commits.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <GitCommit className="w-8 h-8 text-gray-300 dark:text-gray-600" />
            <p className="text-xs text-gray-400">No commits found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
            {commits.map((commit) => {
              const isExpanded = expandedSha === commit.sha
              const firstLine = commit.message.split('\n')[0]

              return (
                <div key={commit.sha}>
                  <button
                    onClick={() => fetchDiff(commit.sha)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors ${
                      isExpanded ? 'bg-gray-50 dark:bg-gray-900/50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex-shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                          {firstLine}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-gray-400">{commit.author.name}</span>
                          <span className="text-[10px] text-gray-300 dark:text-gray-600">·</span>
                          <span className="text-[10px] text-gray-400">{timeAgo(commit.author.date)}</span>
                          <span className="text-[10px] text-gray-300 dark:text-gray-600">·</span>
                          <code className="text-[10px] text-brand-500 font-mono">{commit.sha.slice(0, 7)}</code>
                        </div>
                      </div>
                      <a
                        href={commit.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 flex-shrink-0"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </button>

                  {/* Expanded diff */}
                  {isExpanded && (
                    <div className="bg-gray-50 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-800/50">
                      {diffLoading ? (
                        <div className="flex items-center gap-2 p-4 text-gray-400 text-xs">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Loading diff...
                        </div>
                      ) : (
                        <>
                          {commitStats && (
                            <div className="flex items-center gap-3 px-4 py-2 text-[10px] border-b border-gray-100 dark:border-gray-800/50">
                              <span className="text-green-500 flex items-center gap-0.5">
                                <Plus className="w-3 h-3" /> {commitStats.additions}
                              </span>
                              <span className="text-red-500 flex items-center gap-0.5">
                                <Minus className="w-3 h-3" /> {commitStats.deletions}
                              </span>
                              <span className="text-gray-400">{fileDiffs.length} files changed</span>
                            </div>
                          )}
                          {fileDiffs.map((file, i) => (
                            <div key={i} className="border-b border-gray-100 dark:border-gray-800/30 last:border-0">
                              <div className="flex items-center gap-2 px-4 py-2">
                                <span className={`text-[10px] font-mono font-bold ${statusColor(file.status)}`}>
                                  {statusLabel(file.status)}
                                </span>
                                <FileText className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                <span className="text-xs text-gray-600 dark:text-gray-300 font-mono truncate">
                                  {file.filename}
                                </span>
                                <div className="flex-1" />
                                <span className="text-[10px] text-green-500">+{file.additions}</span>
                                <span className="text-[10px] text-red-500">-{file.deletions}</span>
                              </div>
                              {file.patch && (
                                <pre className="px-4 pb-2 text-[10px] font-mono text-gray-400 overflow-x-auto max-h-60 whitespace-pre leading-relaxed">
                                  {file.patch.split('\n').map((line, j) => (
                                    <div
                                      key={j}
                                      className={
                                        line.startsWith('+') && !line.startsWith('+++')
                                          ? 'text-green-400 bg-green-900/10'
                                          : line.startsWith('-') && !line.startsWith('---')
                                            ? 'text-red-400 bg-red-900/10'
                                            : line.startsWith('@@')
                                              ? 'text-blue-400'
                                              : ''
                                      }
                                    >
                                      {line}
                                    </div>
                                  ))}
                                </pre>
                              )}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
