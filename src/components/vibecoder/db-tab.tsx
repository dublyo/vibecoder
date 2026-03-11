'use client'

import { useState, useEffect, useRef } from 'react'
import { Database, Play, Table2, RefreshCw, AlertTriangle, Copy, CheckCircle2 } from 'lucide-react'

interface DbTabProps {
  projectId: string
}

const EXAMPLE_QUERIES = [
  { label: 'List tables', sql: "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name" },
  { label: 'Row counts', sql: "SELECT schemaname, relname AS table, n_live_tup AS rows FROM pg_stat_user_tables ORDER BY n_live_tup DESC" },
  { label: 'Table sizes', sql: "SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::text)) AS size FROM pg_tables WHERE schemaname='public'" },
]

export function DbTab({ projectId }: DbTabProps) {
  const [sql, setSql] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [rowCount, setRowCount] = useState<number | undefined>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tables, setTables] = useState<string | null>(null)
  const [tablesLoading, setTablesLoading] = useState(true)
  const [allowWrite, setAllowWrite] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [copied, setCopied] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const resultRef = useRef<HTMLPreElement>(null)

  // Fetch tables on mount
  useEffect(() => {
    setTablesLoading(true)
    fetch(`/api/vibecoder/projects/${projectId}/sql`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setTables(d.tables || 'No tables found')
      })
      .catch(e => setError(e.message))
      .finally(() => setTablesLoading(false))
  }, [projectId])

  const runQuery = async () => {
    if (!sql.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    setRowCount(undefined)
    setBlocked(false)
    try {
      const res = await fetch(`/api/vibecoder/projects/${projectId}/sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sql.trim(), allowWrite }),
      })
      const data = await res.json()
      if (data.blocked) {
        setBlocked(true)
        setError(data.error)
      } else if (data.error) {
        setError(data.error)
      } else {
        setResult(data.rows || 'Query executed successfully')
        setRowCount(data.rowCount)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      runQuery()
    }
  }

  const copyResult = () => {
    if (result) {
      navigator.clipboard.writeText(result)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  useEffect(() => {
    if (resultRef.current) resultRef.current.scrollTop = 0
  }, [result])

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <Database className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Database Explorer</span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar — Tables */}
        <div className="w-48 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 overflow-y-auto">
          <div className="px-3 py-2 text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Tables</div>
          {tablesLoading ? (
            <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400">
              <RefreshCw className="w-3 h-3 animate-spin" /> Loading...
            </div>
          ) : error && !result ? (
            <div className="px-3 py-2 text-xs text-red-400">{error}</div>
          ) : (
            <pre className="px-3 py-1 text-[10px] font-mono text-gray-500 whitespace-pre-wrap">{tables}</pre>
          )}

          <div className="px-3 py-2 mt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-2">Quick Queries</div>
            <div className="space-y-1">
              {EXAMPLE_QUERIES.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setSql(q.sql)}
                  className="w-full text-left px-2 py-1.5 text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition-colors"
                >
                  <Table2 className="w-3 h-3 inline mr-1 opacity-50" />
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* SQL Editor */}
          <div className="flex-shrink-0 border-b border-gray-100 dark:border-gray-800">
            <textarea
              ref={textareaRef}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter SQL query... (Cmd+Enter to run)"
              className="w-full h-24 px-4 py-3 text-xs font-mono bg-transparent text-gray-700 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none resize-none"
              spellCheck={false}
            />
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-900/50">
              <button
                onClick={runQuery}
                disabled={loading || !sql.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Run Query
              </button>
              <label className="flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowWrite}
                  onChange={(e) => setAllowWrite(e.target.checked)}
                  className="rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                />
                Allow writes
              </label>
              <div className="flex-1" />
              <span className="text-[10px] text-gray-400">Cmd+Enter to run</span>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-50 dark:bg-gray-900/30 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">Results</span>
              {rowCount !== undefined && (
                <span className="text-[10px] text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                  {rowCount} rows
                </span>
              )}
              {result && (
                <button
                  onClick={copyResult}
                  className="ml-auto p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="Copy results"
                >
                  {copied ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </button>
              )}
            </div>

            <pre
              ref={resultRef}
              className="flex-1 overflow-auto p-4 text-xs font-mono text-gray-600 dark:text-gray-300 whitespace-pre-wrap"
            >
              {loading ? (
                <span className="text-gray-400 flex items-center gap-2">
                  <RefreshCw className="w-3 h-3 animate-spin inline" /> Running query...
                </span>
              ) : blocked ? (
                <div className="flex items-start gap-2 text-amber-500">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Write operation blocked</p>
                    <p className="text-[10px] mt-1 text-amber-400">{error}</p>
                    <p className="text-[10px] mt-1 text-gray-400">Enable "Allow writes" checkbox to run write queries.</p>
                  </div>
                </div>
              ) : error ? (
                <span className="text-red-400">{error}</span>
              ) : result ? (
                result
              ) : (
                <span className="text-gray-400">Run a query to see results here.</span>
              )}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
