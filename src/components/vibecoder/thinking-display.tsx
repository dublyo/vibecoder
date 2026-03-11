'use client'

import { Loader2, Check, FileCode, Search, Brain, GitCommit, Wrench, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

export interface ThinkingPhase {
  id: string
  label: string
  status: 'pending' | 'active' | 'complete'
  detail?: string
  durationMs?: number
  files?: { path: string; index: number; total: number }[]
}

interface ThinkingDisplayProps {
  phases: ThinkingPhase[]
  pipelineStatus?: string
}

const PHASE_ICONS: Record<string, typeof Brain> = {
  classifying: Search,
  selecting_files: FileCode,
  researching: Search,
  planning: Brain,
  generating: Wrench,
  committing: GitCommit,
  building: Loader2,
  fixing: Wrench,
}

export function ThinkingDisplay({ phases, pipelineStatus }: ThinkingDisplayProps) {
  const [expanded, setExpanded] = useState(true)

  if (phases.length === 0) {
    return (
      <div className="rounded-xl bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/50 px-3.5 py-2.5 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2.5 shadow-sm">
        <div className="relative">
          <div className="w-5 h-5 rounded-full bg-brand-500/10 dark:bg-brand-500/20 flex items-center justify-center">
            <Loader2 className="w-3 h-3 animate-spin text-brand-500" />
          </div>
          <div className="absolute inset-0 rounded-full bg-brand-500/20 animate-ping" />
        </div>
        <span className="text-xs font-medium">{pipelineStatus || 'Thinking...'}</span>
      </div>
    )
  }

  const activePhase = phases.find(p => p.status === 'active')
  const completedCount = phases.filter(p => p.status === 'complete').length

  return (
    <div className="rounded-xl bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/50 overflow-hidden shadow-sm">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
      >
        <div className="relative">
          <div className="w-5 h-5 rounded-full bg-brand-500/10 dark:bg-brand-500/20 flex items-center justify-center">
            {activePhase ? (
              <Loader2 className="w-3 h-3 animate-spin text-brand-500" />
            ) : (
              <Check className="w-3 h-3 text-emerald-500" />
            )}
          </div>
          {activePhase && <div className="absolute inset-0 rounded-full bg-brand-500/20 animate-ping" />}
        </div>
        <span className="font-medium text-gray-700 dark:text-gray-300 flex-1 text-left">
          {activePhase ? activePhase.label : 'Processing complete'}
        </span>
        <span className="text-[10px] text-gray-400 tabular-nums">{completedCount}/{phases.length}</span>
        {expanded ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
      </button>

      {/* Phase list */}
      {expanded && (
        <div className="px-3.5 pb-2.5 space-y-0.5 border-t border-gray-100 dark:border-gray-700/30 pt-2">
          {phases.map((phase) => {
            const Icon = PHASE_ICONS[phase.id] || Brain
            const isActive = phase.status === 'active'
            const isDone = phase.status === 'complete'

            return (
              <div key={phase.id} className="flex flex-col">
                <div className="flex items-center gap-2 py-1">
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    {isActive ? (
                      <div className="relative">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-500" />
                      </div>
                    ) : isDone ? (
                      <div className="w-4 h-4 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-emerald-500" />
                      </div>
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                    )}
                  </div>

                  <Icon className={`w-3 h-3 flex-shrink-0 ${
                    isActive ? 'text-brand-500' : isDone ? 'text-gray-400 dark:text-gray-500' : 'text-gray-300 dark:text-gray-600'
                  }`} />

                  <span className={`text-xs flex-1 ${
                    isActive ? 'text-gray-900 dark:text-white font-medium' :
                    isDone ? 'text-gray-500 dark:text-gray-400' :
                    'text-gray-400 dark:text-gray-500'
                  }`}>
                    {phase.label}
                  </span>

                  {isDone && phase.durationMs !== undefined && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
                      {phase.durationMs < 1000 ? `${phase.durationMs}ms` : `${(phase.durationMs / 1000).toFixed(1)}s`}
                    </span>
                  )}
                </div>

                {phase.detail && (
                  <div className="ml-7 text-[10px] text-gray-400 dark:text-gray-500 leading-tight pb-1 pl-3.5">
                    {phase.detail}
                  </div>
                )}

                {phase.files && phase.files.length > 0 && (
                  <div className="ml-7 pl-3.5 space-y-0.5 pb-1">
                    {phase.files.map((f) => (
                      <div key={f.path} className="flex items-center gap-1.5 text-[10px]">
                        <FileCode className="w-2.5 h-2.5 text-emerald-500 flex-shrink-0" />
                        <span className="text-gray-500 dark:text-gray-400 truncate font-mono">{f.path}</span>
                        <span className="text-gray-400 dark:text-gray-500 flex-shrink-0 tabular-nums">
                          {f.index + 1}/{f.total}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
