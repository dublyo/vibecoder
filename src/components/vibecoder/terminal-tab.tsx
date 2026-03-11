'use client'

import { useState, useEffect, useRef } from 'react'
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react'

interface LogEntry {
  timestamp: string
  type: 'info' | 'success' | 'error' | 'warning' | 'system'
  message: string
  section: string
}

interface TerminalTabProps {
  projectId: string
  events: any[]
}

const SECTION_ORDER = ['Build', 'Deploy', 'Tests', 'Console']

function eventToLogEntries(event: any): LogEntry[] {
  const ts = new Date().toISOString()
  const entries: LogEntry[] = []

  switch (event.event) {
    case 'ai_classifying':
      entries.push({ timestamp: ts, type: 'system', message: 'Classifying request complexity...', section: 'Build' })
      break
    case 'ai_classified':
      entries.push({ timestamp: ts, type: 'info', message: `Pipeline: ${event.data?.tier || 'unknown'}`, section: 'Build' })
      break
    case 'ai_thinking':
      entries.push({ timestamp: ts, type: 'info', message: `AI phase: ${event.data?.phase || 'thinking'}`, section: 'Build' })
      break
    case 'ai_complete':
      entries.push({ timestamp: ts, type: 'success', message: `AI complete — ${event.data?.filesChanged?.length || 0} files changed`, section: 'Build' })
      break
    case 'git_committing':
      entries.push({ timestamp: ts, type: 'info', message: 'Committing changes to GitHub...', section: 'Deploy' })
      break
    case 'git_pushed':
      entries.push({ timestamp: ts, type: 'success', message: `Pushed to GitHub (${event.data?.commitSha?.slice(0, 7) || '...'})`, section: 'Deploy' })
      break
    case 'build_started':
      entries.push({ timestamp: ts, type: 'system', message: 'Build started...', section: 'Build' })
      break
    case 'build_log':
      entries.push({ timestamp: ts, type: 'info', message: event.data?.line || '', section: 'Build' })
      break
    case 'build_passed':
      entries.push({ timestamp: ts, type: 'success', message: 'Build passed ✓', section: 'Build' })
      break
    case 'build_failed':
      entries.push({ timestamp: ts, type: 'error', message: `Build failed: ${event.data?.error || 'Unknown error'}`, section: 'Build' })
      break
    case 'deploying':
      entries.push({ timestamp: ts, type: 'info', message: 'Deploying container...', section: 'Deploy' })
      break
    case 'deploy_complete':
      entries.push({ timestamp: ts, type: 'success', message: `Deploy complete → ${event.data?.url || ''}`, section: 'Deploy' })
      break
    case 'testing':
      entries.push({ timestamp: ts, type: 'info', message: 'Running Playwright tests...', section: 'Tests' })
      break
    case 'test_passed':
      entries.push({ timestamp: ts, type: 'success', message: 'All tests passed ✓', section: 'Tests' })
      break
    case 'test_failed':
      entries.push({ timestamp: ts, type: 'error', message: `Tests failed: ${event.data?.errors?.join(', ') || ''}`, section: 'Tests' })
      break
    case 'console_error':
      for (const err of (event.data?.errors || [])) {
        entries.push({ timestamp: ts, type: 'error', message: err, section: 'Console' })
      }
      break
    case 'auto_fix_attempt':
      entries.push({ timestamp: ts, type: 'warning', message: `Ralph Loop: fix attempt ${event.data?.attempt}/${event.data?.maxAttempts}`, section: 'Build' })
      break
    case 'ralph_loop_started':
      entries.push({ timestamp: ts, type: 'system', message: `Ralph Loop started (max ${event.data?.maxAttempts} attempts)`, section: 'Build' })
      break
    case 'ralph_loop_log':
      entries.push({ timestamp: ts, type: 'info', message: event.data?.message || '', section: 'Build' })
      break
    case 'ralph_loop_complete':
      if (event.data?.success) {
        entries.push({ timestamp: ts, type: 'success', message: `Ralph Loop: build fixed after ${event.data?.attempts} attempt(s)`, section: 'Build' })
      } else {
        entries.push({ timestamp: ts, type: 'error', message: `Ralph Loop: failed after ${event.data?.attempts} attempts`, section: 'Build' })
      }
      break
    case 'ralph_summary':
      if (event.data?.success) {
        entries.push({ timestamp: ts, type: 'success', message: `Auto-fix complete (${event.data?.attempts} fixes, ${event.data?.totalCredits?.toFixed(1)} credits)`, section: 'Build' })
      } else {
        entries.push({ timestamp: ts, type: 'error', message: `Auto-fix failed after ${event.data?.attempts} attempts`, section: 'Build' })
      }
      break
    case 'ralph_fix_files':
      entries.push({ timestamp: ts, type: 'success', message: 'Fixed files pushed — preview updated', section: 'Build' })
      break
    case 'git_error':
      entries.push({ timestamp: ts, type: 'error', message: `Git error: ${event.data?.error || 'Unknown'}`, section: 'Deploy' })
      break
    case 'error':
      entries.push({ timestamp: ts, type: 'error', message: event.data?.message || 'Unknown error', section: 'Build' })
      break
    case 'done':
      entries.push({ timestamp: ts, type: 'success', message: 'Pipeline complete', section: 'Build' })
      break
    default:
      entries.push({ timestamp: ts, type: 'info', message: `${event.event}: ${JSON.stringify(event.data || {})}`, section: 'Build' })
  }
  return entries
}

const TYPE_COLORS: Record<string, string> = {
  info: 'text-gray-300',
  success: 'text-green-400',
  error: 'text-red-400',
  warning: 'text-yellow-400',
  system: 'text-blue-400',
}

export function TerminalTab({ projectId, events }: TerminalTabProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  // Convert events to log entries
  useEffect(() => {
    if (events.length === 0) return
    const lastEvent = events[events.length - 1]
    const newEntries = eventToLogEntries(lastEvent)
    setLogs(prev => [...prev, ...newEntries])
  }, [events.length])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const clearLogs = () => setLogs([])

  // Group logs by section
  const logsBySection = new Map<string, LogEntry[]>()
  for (const log of logs) {
    if (!logsBySection.has(log.section)) logsBySection.set(log.section, [])
    logsBySection.get(log.section)!.push(log)
  }

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch { return '' }
  }

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          {SECTION_ORDER.map(section => {
            const count = logsBySection.get(section)?.length || 0
            const hasErrors = logsBySection.get(section)?.some(l => l.type === 'error')
            return (
              <button
                key={section}
                onClick={() => toggleSection(section)}
                className={`text-[10px] px-2 py-0.5 rounded ${
                  hasErrors ? 'text-red-400' : count > 0 ? 'text-gray-300' : 'text-gray-600'
                } hover:bg-gray-800`}
              >
                {section}
                {count > 0 && <span className="ml-1 text-gray-500">({count})</span>}
              </button>
            )
          })}
        </div>
        <button
          onClick={clearLogs}
          className="p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded"
          title="Clear logs"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Logs */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs">
        {logs.length === 0 ? (
          <div className="text-gray-600 text-center py-8">
            No logs yet. Build events will appear here.
          </div>
        ) : (
          SECTION_ORDER.map(section => {
            const sectionLogs = logsBySection.get(section)
            if (!sectionLogs || sectionLogs.length === 0) return null
            const isCollapsed = collapsedSections.has(section)

            return (
              <div key={section} className="mb-3">
                <button
                  onClick={() => toggleSection(section)}
                  className="flex items-center gap-1 text-gray-500 hover:text-gray-300 mb-1"
                >
                  {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  <span className="text-[10px] uppercase tracking-wider font-semibold">{section}</span>
                </button>
                {!isCollapsed && sectionLogs.map((log, i) => (
                  <div key={i} className="flex gap-2 py-px leading-4">
                    <span className="text-gray-600 flex-shrink-0 select-none">{formatTime(log.timestamp)}</span>
                    <span className={TYPE_COLORS[log.type] || 'text-gray-300'}>{log.message}</span>
                  </div>
                ))}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
