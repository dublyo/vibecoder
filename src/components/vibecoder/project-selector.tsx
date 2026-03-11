'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Plus, Circle, CheckCircle2, AlertCircle, Loader2, Clock, Trash2 } from 'lucide-react'

interface Project {
  id: string
  name: string
  slug: string
  framework: string
  status: string
  subdomain: string
  lastDeployedAt?: string | null
  createdAt: string
}

interface ProjectSelectorProps {
  projects: Project[]
  activeProjectId: string | null
  onSelect: (projectId: string) => void
  onCreateNew: () => void
  onDelete?: (projectId: string) => void
}

const FRAMEWORK_ICONS: Record<string, string> = {
  nextjs: '▲',
  nuxt: '💚',
  astro: '🚀',
  custom: '⚙️',
}

const STATUS_CONFIG: Record<string, { icon: typeof Circle; color: string; label: string }> = {
  creating: { icon: Loader2, color: 'text-blue-400', label: 'Creating' },
  active: { icon: CheckCircle2, color: 'text-green-400', label: 'Active' },
  building: { icon: Loader2, color: 'text-yellow-400', label: 'Building' },
  deploying: { icon: Loader2, color: 'text-purple-400', label: 'Deploying' },
  error: { icon: AlertCircle, color: 'text-red-400', label: 'Error' },
  paused: { icon: Circle, color: 'text-gray-400', label: 'Paused' },
}

export function ProjectSelector({ projects, activeProjectId, onSelect, onCreateNew, onDelete }: ProjectSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const activeProject = projects.find(p => p.id === activeProjectId)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const formatDate = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        {activeProject ? (
          <>
            <span className="text-sm">{FRAMEWORK_ICONS[activeProject.framework] || '📦'}</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white max-w-[160px] truncate">
              {activeProject.name}
            </span>
            {(() => {
              const config = STATUS_CONFIG[activeProject.status] || STATUS_CONFIG.active
              const Icon = config.icon
              const isAnimated = ['creating', 'building', 'deploying'].includes(activeProject.status)
              return <Icon className={`w-3.5 h-3.5 ${config.color} ${isAnimated ? 'animate-spin' : ''}`} />
            })()}
          </>
        ) : (
          <span className="text-sm text-gray-500">Select project</span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-100 dark:border-gray-800">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2">Projects</span>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {projects.map(project => {
              const config = STATUS_CONFIG[project.status] || STATUS_CONFIG.active
              const Icon = config.icon
              const isAnimated = ['creating', 'building', 'deploying'].includes(project.status)
              const isActive = project.id === activeProjectId

              return (
                <button
                  key={project.id}
                  onClick={() => { onSelect(project.id); setIsOpen(false) }}
                  className={`group w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                    isActive ? 'bg-brand-50 dark:bg-brand-900/10' : ''
                  }`}
                >
                  <span className="text-base">{FRAMEWORK_ICONS[project.framework] || '📦'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {project.name}
                      </span>
                      <Icon className={`w-3 h-3 ${config.color} flex-shrink-0 ${isAnimated ? 'animate-spin' : ''}`} />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                      <span>{project.slug}</span>
                      <span>•</span>
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {formatDate(project.lastDeployedAt || project.createdAt)}
                      </span>
                    </div>
                  </div>
                  {onDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Delete "${project.name}"? This will remove the GitHub repo and container.`)) {
                          onDelete(project.id)
                          setIsOpen(false)
                        }
                      }}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </button>
              )
            })}

            {projects.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-gray-400">
                No projects yet
              </div>
            )}
          </div>

          <div className="p-2 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={() => { onCreateNew(); setIsOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/10 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
