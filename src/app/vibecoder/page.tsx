'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { IdeLayout } from '@/components/vibecoder/ide-layout'
import {
  Code2, CreditCard, Plus, Settings, LogOut, ChevronDown,
  ExternalLink, GitBranch, Clock, Sparkles, FolderOpen,
  Loader2, Trash2, CheckCircle2, AlertCircle, Zap, Globe
} from 'lucide-react'

interface VcProject {
  id: string
  name: string
  slug: string
  framework: string
  status: string
  subdomain: string
  githubRepo: string
  totalCreditsUsed: number
  messageCount: number
  lastDeployedAt: string | null
  createdAt: string
  _count?: { messages: number; deployments: number }
}

const FRAMEWORK_ICONS: Record<string, string> = {
  nextjs: '▲',
  nuxt: '💚',
  astro: '🚀',
  custom: '⚙️',
}

const FRAMEWORK_COLORS: Record<string, string> = {
  nextjs: 'from-gray-900 to-gray-700 dark:from-white dark:to-gray-300',
  nuxt: 'from-green-500 to-emerald-600',
  astro: 'from-purple-500 to-violet-600',
  custom: 'from-gray-500 to-gray-600',
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; animate?: boolean }> = {
  creating: { color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20', label: 'Creating', animate: true },
  active: { color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', label: 'Active' },
  building: { color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20', label: 'Building', animate: true },
  deploying: { color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20', label: 'Deploying', animate: true },
  error: { color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20', label: 'Error' },
  paused: { color: 'text-gray-500', bg: 'bg-gray-50 dark:bg-gray-800', label: 'Paused' },
}

function formatRelativeTime(date: string) {
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  return d.toLocaleDateString()
}

export default function VibecoderPageWrapper() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading VibeCoder...</p>
        </div>
      </div>
    }>
      <VibecoderPage />
    </Suspense>
  )
}

function VibecoderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [projects, setProjects] = useState<VcProject[]>([])
  const [activeProject, setActiveProject] = useState<VcProject | null>(null)
  const [view, setView] = useState<'dashboard' | 'ide'>('dashboard')
  const [loading, setLoading] = useState(true)
  const [credits, setCredits] = useState(0)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/vibecoder/projects')
      if (res.ok) {
        const data = await res.json()
        setProjects(data.projects)
        return data.projects
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err)
    } finally {
      setLoading(false)
    }
    return []
  }, [])

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        setCredits(data.user.creditsBalance)
        setUserName(data.user.name)
        setUserEmail(data.user.email)
      }
    } catch {}
  }, [])

  useEffect(() => {
    const init = async () => {
      const [projs] = await Promise.all([fetchProjects(), fetchUser()])
      // Check for ?project= query param to open specific project directly
      const projectId = searchParams.get('project')
      if (projectId && projs) {
        const p = projs.find((p: VcProject) => p.id === projectId)
        if (p) {
          setActiveProject(p)
          setView('ide')
        }
      }
    }
    init()
  }, [fetchProjects, fetchUser, searchParams])

  const handleOpenProject = (project: VcProject) => {
    setActiveProject(project)
    setView('ide')
    // Update URL without navigation
    window.history.replaceState(null, '', `/vibecoder?project=${project.id}`)
  }

  const handleBackToDashboard = () => {
    setView('dashboard')
    setActiveProject(null)
    window.history.replaceState(null, '', '/vibecoder')
  }

  const handleDeleteProject = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This will remove the GitHub repo and container.`)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/vibecoder/projects/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setProjects(prev => prev.filter(p => p.id !== id))
        if (activeProject?.id === id) {
          handleBackToDashboard()
        }
      }
    } catch {} finally {
      setDeletingId(null)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  // Loading state
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading VibeCoder...</p>
        </div>
      </div>
    )
  }

  // IDE View
  if (view === 'ide' && activeProject) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
        <header className="h-11 flex items-center justify-between px-3 border-b border-gray-200/80 dark:border-gray-800/80 bg-white dark:bg-gray-900 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            {/* Back to dashboard */}
            <button
              onClick={handleBackToDashboard}
              className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              title="Back to dashboard"
            >
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-sm shadow-brand-500/20">
                <Code2 className="w-3.5 h-3.5 text-white" />
              </div>
            </button>

            <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />

            {/* Project name + status */}
            <div className="flex items-center gap-2">
              <span className="text-sm">{FRAMEWORK_ICONS[activeProject.framework] || '📦'}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{activeProject.name}</span>
              <div className={`w-1.5 h-1.5 rounded-full ${
                activeProject.status === 'active' ? 'bg-emerald-500' :
                activeProject.status === 'building' ? 'bg-yellow-500 animate-pulse' :
                activeProject.status === 'error' ? 'bg-red-500' :
                'bg-gray-400'
              }`} />
            </div>

            {/* Quick switch */}
            {projects.length > 1 && (
              <>
                <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
                <select
                  value={activeProject.id}
                  onChange={(e) => {
                    const p = projects.find(p => p.id === e.target.value)
                    if (p) handleOpenProject(p)
                  }}
                  className="text-xs text-gray-500 bg-transparent border-none cursor-pointer focus:outline-none hover:text-gray-700 dark:hover:text-gray-300"
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Live URL */}
            {activeProject.subdomain && activeProject.status === 'active' && (
              <a
                href={`https://${activeProject.subdomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-brand-500 transition-colors"
              >
                <Globe className="w-3 h-3" />
                {activeProject.subdomain}
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}

            <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />

            {/* Credits */}
            <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded-md">
              <CreditCard className="w-3 h-3" />
              <span className="font-medium tabular-nums">{Math.round(credits).toLocaleString()}</span>
            </div>

            {/* Settings */}
            <button
              onClick={() => router.push('/settings')}
              className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
              title="Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        <IdeLayout project={activeProject} onProjectUpdate={fetchProjects} />
      </div>
    )
  }

  // Dashboard View
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Dashboard header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200/80 dark:border-gray-800/80">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-sm shadow-brand-500/20">
              <Code2 className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-bold text-base text-gray-900 dark:text-white tracking-tight">VibeCoder</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Credits badge */}
            <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-medium tabular-nums">{Math.round(credits).toLocaleString()}</span>
              <span className="text-gray-400">credits</span>
            </div>

            {/* Settings */}
            <button
              onClick={() => router.push('/settings')}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 pl-3 pr-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-white text-xs font-semibold">
                  {userName?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </button>

              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{userName}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{userEmail}</div>
                    </div>
                    <div className="p-1">
                      <button
                        onClick={() => { setShowUserMenu(false); router.push('/settings') }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                      >
                        <Settings className="w-4 h-4 text-gray-400" />
                        Settings
                      </button>
                      <button
                        onClick={() => { setShowUserMenu(false); handleLogout() }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Welcome + New project */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {projects.length === 0 ? 'Welcome to VibeCoder' : 'Your projects'}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {projects.length === 0
                ? 'Build web apps by chatting with AI. Create your first project to get started.'
                : `${projects.length} project${projects.length === 1 ? '' : 's'}`
              }
            </p>
          </div>
          <button
            onClick={() => router.push('/vibecoder/new')}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-xl transition-colors shadow-sm shadow-brand-500/20"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>

        {/* Empty state */}
        {projects.length === 0 && (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-brand-500/10 to-violet-600/10 border-2 border-dashed border-brand-300 dark:border-brand-700 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-brand-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No projects yet</h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-8">
              Create your first project to start building with AI. Describe what you want, and VibeCoder will generate the code, deploy it, and fix any errors automatically.
            </p>
            <button
              onClick={() => router.push('/vibecoder/new')}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-xl transition-colors shadow-sm shadow-brand-500/20"
            >
              <Plus className="w-4 h-4" />
              Create Your First Project
            </button>
          </div>
        )}

        {/* Project cards grid */}
        {projects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => {
              const statusConf = STATUS_CONFIG[project.status] || STATUS_CONFIG.active
              const isDeleting = deletingId === project.id

              return (
                <div
                  key={project.id}
                  className="group relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-lg transition-all cursor-pointer overflow-hidden"
                  onClick={() => !isDeleting && handleOpenProject(project)}
                >
                  {/* Framework color accent */}
                  <div className={`h-1 w-full bg-gradient-to-r ${FRAMEWORK_COLORS[project.framework] || FRAMEWORK_COLORS.custom}`} />

                  <div className="p-5">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">{FRAMEWORK_ICONS[project.framework] || '📦'}</span>
                        <div>
                          <h3 className="text-base font-semibold text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                            {project.name}
                          </h3>
                          <p className="text-xs text-gray-400 mt-0.5">{project.slug}</p>
                        </div>
                      </div>

                      {/* Status badge */}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full ${statusConf.bg} ${statusConf.color}`}>
                        {statusConf.animate && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                        {statusConf.label}
                      </span>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-xs text-gray-400 mb-4">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(project.lastDeployedAt || project.createdAt)}
                      </span>
                      {project._count && (
                        <>
                          <span className="flex items-center gap-1">
                            <GitBranch className="w-3 h-3" />
                            {project._count.deployments || 0} deploys
                          </span>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenProject(project)
                        }}
                        className="flex items-center gap-1.5 text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        Open IDE
                      </button>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {project.subdomain && project.status === 'active' && (
                          <a
                            href={`https://${project.subdomain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 text-gray-400 hover:text-brand-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all"
                            title="Open live site"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteProject(project.id, project.name)
                          }}
                          disabled={isDeleting}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all"
                          title="Delete project"
                        >
                          {isDeleting
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />
                          }
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* New project card */}
            <button
              onClick={() => router.push('/vibecoder/new')}
              className="flex flex-col items-center justify-center min-h-[180px] bg-white dark:bg-gray-900 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 hover:border-brand-400 dark:hover:border-brand-600 hover:bg-brand-50/50 dark:hover:bg-brand-900/5 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 group-hover:bg-brand-100 dark:group-hover:bg-brand-900/20 flex items-center justify-center mb-3 transition-colors">
                <Plus className="w-5 h-5 text-gray-400 group-hover:text-brand-500 transition-colors" />
              </div>
              <span className="text-sm font-medium text-gray-500 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                New Project
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
