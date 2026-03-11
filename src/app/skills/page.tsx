'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Pencil, Trash2, BookOpen, Search,
  Package, Globe, ExternalLink, Check, AlertCircle, Loader2,
  Download, Sparkles,
} from '@/components/icons'

interface Skill {
  id: string
  name: string
  slug: string
  description: string
  icon: string
  category: string | null
  source: string
  isPublic: boolean
  usageCount: number
  createdAt: string
  userId: string
}

type Tab = 'my-skills' | 'install' | 'create'

// Popular skills from skills.sh for quick install
const POPULAR_SKILLS = [
  { path: 'vercel-labs/agent-skills/react-best-practices', name: 'React Best Practices', desc: '40+ performance optimization rules', icon: '⚛️' },
  { path: 'vercel-labs/agent-skills/web-design-guidelines', name: 'Web Design Guidelines', desc: '100+ rules for accessibility, performance, UX', icon: '🎨' },
  { path: 'hanzoskill/remotion-best-practices', name: 'Remotion Best Practices', desc: 'Video creation in React', icon: '🎬' },
  { path: 'anthropics/skills/frontend-design', name: 'Frontend Design', desc: 'Frontend design patterns and guidelines', icon: '🖥️' },
  { path: 'vercel-labs/agent-skills/composition-patterns', name: 'Composition Patterns', desc: 'React patterns for scalable components', icon: '🧩' },
]

export default function SkillsPage() {
  const router = useRouter()
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('my-skills')
  const [search, setSearch] = useState('')
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)

  // Create/Edit form state
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formIcon, setFormIcon] = useState('🔧')
  const [formCategory, setFormCategory] = useState('')
  const [formPublic, setFormPublic] = useState(false)
  const [saving, setSaving] = useState(false)

  // Install state
  const [installPath, setInstallPath] = useState('')
  const [installing, setInstalling] = useState<string | null>(null)
  const [installError, setInstallError] = useState('')
  const [installSuccess, setInstallSuccess] = useState('')

  const loadSkills = useCallback(async () => {
    const res = await fetch('/api/skills')
    if (res.ok) {
      const data = await res.json()
      setSkills(data.skills || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadSkills() }, [loadSkills])

  const resetForm = () => {
    setFormName('')
    setFormDesc('')
    setFormContent('')
    setFormIcon('🔧')
    setFormCategory('')
    setFormPublic(false)
    setEditingSkill(null)
  }

  const handleEdit = async (skill: Skill) => {
    const res = await fetch(`/api/skills/${skill.id}`)
    if (res.ok) {
      const data = await res.json()
      setFormName(data.skill.name)
      setFormDesc(data.skill.description)
      setFormContent(data.skill.content)
      setFormIcon(data.skill.icon)
      setFormCategory(data.skill.category || '')
      setFormPublic(data.skill.isPublic)
      setEditingSkill(data.skill)
      setTab('create')
    }
  }

  const handleSave = async () => {
    if (!formName || !formDesc || !formContent) return
    setSaving(true)

    const body = {
      name: formName,
      description: formDesc,
      content: formContent,
      icon: formIcon,
      category: formCategory || null,
      isPublic: formPublic,
    }

    if (editingSkill) {
      await fetch(`/api/skills/${editingSkill.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } else {
      await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    }

    setSaving(false)
    resetForm()
    setTab('my-skills')
    loadSkills()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this skill?')) return
    await fetch(`/api/skills/${id}`, { method: 'DELETE' })
    loadSkills()
  }

  const handleInstall = async (skillPath: string) => {
    if (!skillPath.trim()) return
    setInstalling(skillPath)
    setInstallError('')
    setInstallSuccess('')

    try {
      const res = await fetch('/api/skills/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillPath: skillPath.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setInstallError(data.error || 'Failed to install skill')
        return
      }

      setInstallSuccess(
        data.updated
          ? `Updated "${data.skill.name}" successfully!`
          : `Installed "${data.skill.name}" successfully!`
      )
      setInstallPath('')
      loadSkills()

      setTimeout(() => setInstallSuccess(''), 3000)
    } catch {
      setInstallError('Network error. Please try again.')
    } finally {
      setInstalling(null)
    }
  }

  const filtered = skills.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description.toLowerCase().includes(search.toLowerCase()) ||
    (s.category || '').toLowerCase().includes(search.toLowerCase())
  )

  const customSkills = filtered.filter(s => s.source === 'custom')
  const installedSkills = filtered.filter(s => s.source !== 'custom')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/vibecoder')} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Skills</h1>
                <p className="text-xs text-gray-500">Specialized behaviors for your AI</p>
              </div>
            </div>
            <a
              href="https://skills.sh"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <Globe className="w-3.5 h-3.5" />
              skills.sh
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/50 p-1 rounded-lg">
            {([
              { id: 'my-skills' as Tab, label: 'My Skills', count: skills.length },
              { id: 'install' as Tab, label: 'Install from skills.sh' },
              { id: 'create' as Tab, label: editingSkill ? 'Edit Skill' : 'Create Skill' },
            ]).map((t) => (
              <button
                key={t.id}
                onClick={() => { if (t.id !== 'create') resetForm(); setTab(t.id) }}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition ${
                  tab === t.id
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className="ml-1.5 text-xs text-gray-400">({t.count})</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* MY SKILLS TAB */}
        {tab === 'my-skills' && (
          <>
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search skills..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center">
                  <BookOpen className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                </div>
                <p className="text-gray-500 font-medium mb-1">
                  {search ? 'No skills match your search' : 'No skills yet'}
                </p>
                <p className="text-sm text-gray-400 mb-6">
                  {search ? 'Try a different search term' : 'Create your own or install from skills.sh'}
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setTab('create')}
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Create Skill
                  </button>
                  <button
                    onClick={() => setTab('install')}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg text-sm font-medium flex items-center gap-1.5"
                  >
                    <Package className="w-4 h-4" />
                    Install from skills.sh
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {installedSkills.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Package className="w-3.5 h-3.5" />
                      Installed from skills.sh ({installedSkills.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {installedSkills.map((skill) => (
                        <SkillCard key={skill.id} skill={skill} onEdit={handleEdit} onDelete={handleDelete} />
                      ))}
                    </div>
                  </div>
                )}

                {customSkills.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Pencil className="w-3.5 h-3.5" />
                      Custom Skills ({customSkills.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {customSkills.map((skill) => (
                        <SkillCard key={skill.id} skill={skill} onEdit={handleEdit} onDelete={handleDelete} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* INSTALL TAB */}
        {tab === 'install' && (
          <div className="space-y-8">
            {/* Install form */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                Install from skills.sh
              </h2>
              <p className="text-sm text-gray-500 mb-5">
                Enter a skill path in the format <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">owner/repo</code> or <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">owner/repo/skill-name</code>
              </p>

              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={installPath}
                    onChange={(e) => { setInstallPath(e.target.value); setInstallError(''); setInstallSuccess('') }}
                    placeholder="e.g. vercel-labs/agent-skills/react-best-practices"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none font-mono"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleInstall(installPath)
                    }}
                  />
                </div>
                <button
                  onClick={() => handleInstall(installPath)}
                  disabled={!installPath.trim() || !!installing}
                  className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-xl text-sm font-medium flex items-center gap-2 whitespace-nowrap"
                >
                  {installing === installPath ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Install
                </button>
              </div>

              {installError && (
                <div className="mt-3 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {installError}
                </div>
              )}
              {installSuccess && (
                <div className="mt-3 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  {installSuccess}
                </div>
              )}

              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500">
                  <span className="font-medium text-gray-600 dark:text-gray-400">CLI equivalent:</span>{' '}
                  <code className="font-mono text-brand-600">npx skills add {installPath || 'owner/repo'}</code>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Skills are fetched from GitHub repositories that contain a SKILL.md file with agent instructions.
                </p>
              </div>
            </div>

            {/* Popular skills */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Popular Skills
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {POPULAR_SKILLS.map((skill) => {
                  const isInstalled = skills.some(s =>
                    s.source === 'skills.sh' &&
                    (s.slug.includes(skill.path.split('/').pop() || '') || s.name.toLowerCase().includes(skill.name.toLowerCase()))
                  )
                  return (
                    <div
                      key={skill.path}
                      className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-md transition group"
                    >
                      <span className="text-2xl flex-shrink-0">{skill.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-white">{skill.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{skill.desc}</p>
                        <p className="text-[10px] text-gray-400 font-mono mt-1">{skill.path}</p>
                      </div>
                      <button
                        onClick={() => handleInstall(skill.path)}
                        disabled={!!installing}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          isInstalled
                            ? 'bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800'
                            : 'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-800 hover:bg-brand-100 dark:hover:bg-brand-900'
                        }`}
                      >
                        {installing === skill.path ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isInstalled ? (
                          <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Installed</span>
                        ) : (
                          'Install'
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 text-center">
                <a
                  href="https://skills.sh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
                >
                  Browse all skills on skills.sh
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* CREATE/EDIT TAB */}
        {tab === 'create' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                {editingSkill ? 'Edit Skill' : 'Create New Skill'}
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                {editingSkill ? 'Update your skill instructions' : 'Define a specialized system prompt for your AI'}
              </p>

              <div className="space-y-5">
                <div className="flex gap-3">
                  <div className="flex-shrink-0">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Icon</label>
                    <input
                      value={formIcon}
                      onChange={(e) => setFormIcon(e.target.value)}
                      className="w-14 h-10 px-2 text-center text-xl rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-brand-500 outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Name</label>
                    <input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Python Expert"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Category</label>
                    <input
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      placeholder="e.g. coding, writing, analysis"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={formPublic}
                      onChange={(e) => setFormPublic(e.target.checked)}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Public</span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Description</label>
                  <input
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    placeholder="Short description of what this skill does"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Skill Content <span className="text-gray-400">(System Prompt / SKILL.md)</span>
                  </label>
                  <textarea
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    rows={14}
                    placeholder={`You are an expert Python developer specializing in modern Python (3.12+).

When writing code:
- Always use type hints
- Follow PEP 8 conventions
- Include concise docstrings
- Prefer dataclasses over dicts for structured data
- Use pathlib for file operations
- Handle errors with specific exception types`}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-mono leading-relaxed focus:ring-2 focus:ring-brand-500 outline-none resize-y"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">
                    This content will be injected as a system prompt when using this skill in a Skilled Chat.
                  </p>
                </div>

                <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
                  <button
                    onClick={() => { resetForm(); setTab('my-skills') }}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !formName || !formDesc || !formContent}
                    className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {saving ? 'Saving...' : editingSkill ? 'Update Skill' : 'Create Skill'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// Skill Card Component
function SkillCard({ skill, onEdit, onDelete }: {
  skill: Skill
  onEdit: (s: Skill) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="group p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-gray-50 dark:bg-gray-700 flex items-center justify-center text-2xl">
          {skill.icon}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(skill)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5 text-gray-400" />
          </button>
          <button
            onClick={() => onDelete(skill.id)}
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
          </button>
        </div>
      </div>
      <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{skill.name}</h3>
      <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{skill.description}</p>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {skill.category && (
          <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full font-medium">
            {skill.category}
          </span>
        )}
        {skill.source !== 'custom' && (
          <span className="text-[10px] px-2 py-0.5 bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400 rounded-full font-medium">
            {skill.source}
          </span>
        )}
        <span className="text-[10px] text-gray-400 ml-auto">{skill.usageCount} uses</span>
      </div>
    </div>
  )
}
