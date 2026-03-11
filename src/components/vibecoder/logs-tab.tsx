'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { RefreshCw, Download, Trash2, Search, ArrowDown } from 'lucide-react'

interface LogsTabProps {
  projectId: string
}

export function LogsTab({ projectId }: LogsTabProps) {
  const [logs, setLogs] = useState('')
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [filter, setFilter] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const logRef = useRef<HTMLPreElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/vibecoder/projects/${projectId}/logs`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || 'No logs available')
      } else {
        const data = await res.json().catch(() => ({}))
        setLogs(`Error fetching logs: ${data.error || res.statusText}`)
      }
    } catch (err: any) {
      setLogs(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 5000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [autoRefresh, fetchLogs])

  const scrollToBottom = () => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }

  useEffect(scrollToBottom, [logs])

  const downloadLogs = () => {
    const blob = new Blob([logs], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `logs-${projectId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredLines = filter
    ? logs.split('\n').filter(l => l.toLowerCase().includes(filter.toLowerCase())).join('\n')
    : logs

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-800 flex-shrink-0">
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh logs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>

        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
            autoRefresh ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800' : 'text-gray-400 hover:bg-gray-800'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
          {autoRefresh ? 'Live' : 'Auto'}
        </button>

        <div className="flex-1" />

        <button
          onClick={() => setShowFilter(!showFilter)}
          className={`p-1.5 rounded-lg transition-colors ${showFilter ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'}`}
          title="Filter logs"
        >
          <Search className="w-3.5 h-3.5" />
        </button>

        <button onClick={scrollToBottom} className="p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 rounded-lg transition-colors" title="Scroll to bottom">
          <ArrowDown className="w-3.5 h-3.5" />
        </button>

        <button onClick={downloadLogs} className="p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 rounded-lg transition-colors" title="Download logs">
          <Download className="w-3.5 h-3.5" />
        </button>

        <button onClick={() => setLogs('')} className="p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 rounded-lg transition-colors" title="Clear">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Filter bar */}
      {showFilter && (
        <div className="px-3 py-2 border-b border-gray-800">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter logs..."
            className="w-full px-3 py-1.5 text-xs bg-gray-900 border border-gray-700 rounded-lg text-gray-200 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
            autoFocus
          />
        </div>
      )}

      {/* Log output */}
      <pre
        ref={logRef}
        className="flex-1 overflow-auto p-4 text-xs font-mono text-gray-300 whitespace-pre-wrap leading-relaxed scrollbar-thin"
      >
        {filteredLines || (loading ? 'Loading logs...' : 'No logs available. Click Refresh to fetch.')}
      </pre>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-800 text-[10px] text-gray-500">
        <span>{logs.split('\n').length} lines</span>
        {filter && <span className="text-brand-400">Filtered: {filteredLines.split('\n').length} matches</span>}
        {autoRefresh && <span className="text-emerald-400">Refreshing every 5s</span>}
      </div>
    </div>
  )
}
