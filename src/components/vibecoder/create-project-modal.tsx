'use client'

import { useState } from 'react'
import { X, Loader2, ArrowRight } from 'lucide-react'

interface CreateProjectModalProps {
  onClose: () => void
  onCreated: (project: any) => void
}

type Tab = 'template' | 'import'
type Framework = 'nextjs' | 'nuxt' | 'astro'

const FRAMEWORKS: { id: Framework; name: string; icon: string; color: string }[] = [
  { id: 'nextjs', name: 'Next.js', icon: '▲', color: 'border-gray-900 dark:border-white' },
  { id: 'nuxt', name: 'Nuxt', icon: '💚', color: 'border-green-500' },
  { id: 'astro', name: 'Astro', icon: '🚀', color: 'border-purple-500' },
]

const TEMPLATES = [
  { id: 'saas', name: 'SaaS Starter', description: 'Auth, dashboard, billing', icon: '💼' },
  { id: 'blog', name: 'Blog', description: 'MDX blog with SEO', icon: '📝' },
  { id: 'dashboard', name: 'Dashboard', description: 'Admin panel with charts', icon: '📊' },
  { id: 'landing', name: 'Landing Page', description: 'Marketing site with CTA', icon: '🚀' },
  { id: 'portfolio', name: 'Portfolio', description: 'Personal website', icon: '🎨' },
  { id: 'ecommerce', name: 'E-Commerce', description: 'Product catalog & cart', icon: '🛒' },
]

export function CreateProjectModal({ onClose, onCreated }: CreateProjectModalProps) {
  const [tab, setTab] = useState<Tab>('template')
  const [name, setName] = useState('')
  const [framework, setFramework] = useState<Framework>('nextjs')
  const [template, setTemplate] = useState('saas')
  const [description, setDescription] = useState('')
  const [importRepo, setImportRepo] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Project name is required')
      return
    }

    setIsCreating(true)
    setError('')

    try {
      const body: any = {
        name: name.trim(),
        framework,
        description: description.trim() || undefined,
      }

      if (tab === 'template') {
        body.template = template
      } else {
        body.importRepo = importRepo.trim()
        if (!body.importRepo) {
          setError('GitHub repo URL is required')
          setIsCreating(false)
          return
        }
      }

      const res = await fetch('/api/vibecoder/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create project')
      }

      const data = await res.json()
      onCreated(data.project)
      onClose()

      // Reset form
      setName('')
      setDescription('')
      setImportRepo('')
      setTemplate('saas')
      setFramework('nextjs')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Project</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-800">
          <button
            onClick={() => setTab('template')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'template'
                ? 'text-brand-500 border-b-2 border-brand-500'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Create from Template
          </button>
          <button
            onClick={() => setTab('import')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'import'
                ? 'text-brand-500 border-b-2 border-brand-500'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Import Repository
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Project Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Project Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome App"
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              autoFocus
            />
          </div>

          {tab === 'template' ? (
            <>
              {/* Framework Selector */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  Framework
                </label>
                <div className="flex gap-2">
                  {FRAMEWORKS.map(fw => (
                    <button
                      key={fw.id}
                      onClick={() => setFramework(fw.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm transition-all ${
                        framework === fw.id
                          ? `${fw.color} bg-gray-50 dark:bg-gray-800`
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <span>{fw.icon}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{fw.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Template Selector */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  Template
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {TEMPLATES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTemplate(t.id)}
                      className={`text-left p-3 rounded-lg border-2 transition-all ${
                        template === t.id
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/10'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-xl mb-1">{t.icon}</div>
                      <div className="text-xs font-medium text-gray-900 dark:text-white">{t.name}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{t.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* Import tab */
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                GitHub Repository
              </label>
              <input
                type="text"
                value={importRepo}
                onChange={(e) => setImportRepo(e.target.value)}
                placeholder="user/repo or https://github.com/user/repo"
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              />
              <p className="text-[10px] text-gray-400 mt-1">Framework will be auto-detected from the repository</p>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what you want to build..."
              rows={2}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || !name.trim()}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                Create Project
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
