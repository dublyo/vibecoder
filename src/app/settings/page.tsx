'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Users as UsersIcon, CreditCard, Loader2, Check, Crown, Zap, Bot, Brain, Trash2, Pencil, X, Globe, Search, BookOpen, Headphones } from '@/components/icons'
import { cn } from '@/lib/utils'

interface ModelInfo {
  id: string
  label: string
  tier: string
  contextWindow: number
  inputCost: number
  outputCost: number
}

interface ModelPreferences {
  maestroModel: string
  preferredModels: { cheap: string[]; mid: string[]; premium: string[] }
  disabledModels: string[]
}

function formatContextWindow(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
  return `${(tokens / 1000).toFixed(0)}K`
}

const TIER_ICONS = {
  cheap: Zap,
  mid: Bot,
  premium: Crown,
} as const

const TIER_LABELS = {
  cheap: 'Budget',
  mid: 'Quality',
  premium: 'Maestro',
} as const

const TIER_COLORS = {
  cheap: 'text-green-600 bg-green-50 dark:bg-green-900/20',
  mid: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
  premium: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20',
} as const

type TabDef = { id: string; label: string; icon?: typeof Bot; adminOnly?: boolean }

const TABS: TabDef[] = [
  { id: 'general', label: 'General' },
  { id: 'models', label: 'Models', icon: Bot },
  { id: 'research', label: 'Web Research', icon: Globe },
  { id: 'openbook', label: 'OpenBook', icon: BookOpen },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'members', label: 'Members', icon: UsersIcon, adminOnly: true },
  { id: 'credits', label: 'Credits', icon: CreditCard, adminOnly: true },
]

export default function SettingsPage() {
  const router = useRouter()
  const [tab, setTab] = useState('general')
  const [user, setUser] = useState<{ name: string; email: string; role: string } | null>(null)
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [passwordMsg, setPasswordMsg] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [members, setMembers] = useState<Array<{
    id: string; email: string; name: string; role: string
    creditsBalance: number; creditsMonthlyLimit: number; isActive: boolean
  }>>([])
  const [loading, setLoading] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', password: '', role: 'member', creditsMonthlyLimit: 1000 })
  const [inviteMsg, setInviteMsg] = useState('')

  const [models, setModels] = useState<ModelInfo[]>([])
  const [prefs, setPrefs] = useState<ModelPreferences | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Memory state
  const [memories, setMemories] = useState<Array<{
    id: string; type: string; category: string; content: string
    confidence: number; accessCount: number; createdAt: string; updatedAt: string
  }>>([])
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null)
  const [editMemoryContent, setEditMemoryContent] = useState('')

  // Research settings state
  const [researchSettings, setResearchSettings] = useState<{
    serperApiKey: string; serperKeySet: boolean; defaultDepth: string
    cheapModel: string; maestroModel: string
  } | null>(null)
  const [researchLoading, setResearchLoading] = useState(false)
  const [researchMsg, setResearchMsg] = useState('')
  const [serperKeyInput, setSerperKeyInput] = useState('')
  const [showSerperKey, setShowSerperKey] = useState(false)

  // OpenBook settings state
  const [obSettings, setObSettings] = useState<{
    cheapModel: string; maestroModel: string; embeddingModel: string
    ttsProvider: string; ttsApiKey: string; ttsKeySet: boolean
    ttsGoogleApiKey: string; ttsGoogleKeySet: boolean
    defaultAudience: string; flashcardCount: string
  } | null>(null)
  const [obLoading, setObLoading] = useState(false)
  const [obMsg, setObMsg] = useState('')
  const [ttsKeyInput, setTtsKeyInput] = useState('')
  const [showTtsKey, setShowTtsKey] = useState(false)
  const [ttsGoogleKeyInput, setTtsGoogleKeyInput] = useState('')
  const [showTtsGoogleKey, setShowTtsGoogleKey] = useState(false)

  const isAdmin = user?.role === 'owner' || user?.role === 'admin'

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => {
        if (!res.ok) { router.push('/login'); return null }
        return res.json()
      })
      .then(data => { if (data) setUser(data.user) })
  }, [router])

  const loadModels = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/settings/models')
    if (res.ok) {
      const data = await res.json()
      setModels(data.models)
      setPrefs(data.preferences)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'models' && models.length === 0) {
      loadModels()
    }
  }, [tab, models.length, loadModels])

  const savePrefs = async (updated: ModelPreferences) => {
    setSaving(true)
    setSaveMsg('')
    const res = await fetch('/api/settings/models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
    if (res.ok) {
      const data = await res.json()
      setPrefs(data.preferences)
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(''), 2000)
    } else {
      setSaveMsg('Error saving')
    }
    setSaving(false)
  }

  const loadMembers = async () => {
    if (!isAdmin) return
    setLoading(true)
    const res = await fetch('/api/users')
    if (res.ok) {
      const data = await res.json()
      setMembers(data.users)
    }
    setLoading(false)
  }

  const inviteUser = async () => {
    setInviteMsg('')
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inviteForm),
    })
    if (res.ok) {
      setInviteMsg('User invited successfully!')
      setInviteForm({ email: '', name: '', password: '', role: 'member', creditsMonthlyLimit: 1000 })
      loadMembers()
    } else {
      const data = await res.json()
      setInviteMsg(`Error: ${JSON.stringify(data.error)}`)
    }
  }

  // Research settings functions
  const loadResearchSettings = async () => {
    setResearchLoading(true)
    const res = await fetch('/api/settings/research')
    if (res.ok) {
      const data = await res.json()
      setResearchSettings(data)
    }
    setResearchLoading(false)
  }

  const saveResearchSettings = async (updates: Record<string, string>) => {
    setResearchMsg('')
    setSaving(true)
    const res = await fetch('/api/settings/research', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.serperBalance !== undefined) {
        setResearchMsg(`Saved! Serper balance: ${data.serperBalance} credits`)
      } else if (data.warning) {
        setResearchMsg(data.warning)
      } else if (data.error) {
        setResearchMsg(`Error: ${data.error}`)
      } else {
        setResearchMsg('Saved')
      }
      loadResearchSettings()
    } else {
      setResearchMsg('Error saving')
    }
    setSaving(false)
    setTimeout(() => setResearchMsg(''), 4000)
  }

  useEffect(() => {
    if (tab === 'research' && !researchSettings) loadResearchSettings()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // OpenBook settings functions
  const loadOpenBookSettings = async () => {
    setObLoading(true)
    const res = await fetch('/api/openbook/settings')
    if (res.ok) {
      const data = await res.json()
      setObSettings(data)
    }
    setObLoading(false)
  }

  const saveOpenBookSettings = async (updates: Record<string, string>) => {
    setObMsg('')
    setSaving(true)
    const res = await fetch('/api/openbook/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.warning) {
        setObMsg(data.warning)
      } else if (data.ttsValidated) {
        setObMsg('Saved! TTS key validated successfully.')
      } else {
        setObMsg('Saved')
      }
      loadOpenBookSettings()
    } else {
      setObMsg('Error saving')
    }
    setSaving(false)
    setTimeout(() => setObMsg(''), 4000)
  }

  useEffect(() => {
    if (tab === 'openbook' && !obSettings) loadOpenBookSettings()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // Memory functions
  const loadMemories = async () => {
    setMemoryLoading(true)
    const res = await fetch('/api/memory')
    if (res.ok) {
      const data = await res.json()
      setMemories(data.memories)
    }
    setMemoryLoading(false)
  }

  const deleteMemoryItem = async (id: string) => {
    const res = await fetch('/api/memory', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setMemories(prev => prev.filter(m => m.id !== id))
  }

  const deleteAllMemoriesAction = async () => {
    if (!confirm('Delete all memories? This cannot be undone.')) return
    const res = await fetch('/api/memory', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
    if (res.ok) setMemories([])
  }

  const saveMemoryEdit = async (id: string) => {
    const res = await fetch('/api/memory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, content: editMemoryContent }),
    })
    if (res.ok) {
      setMemories(prev => prev.map(m => m.id === id ? { ...m, content: editMemoryContent } : m))
      setEditingMemoryId(null)
    }
  }

  useEffect(() => {
    if (tab === 'memory' && memories.length === 0) loadMemories()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const toggleDisabledModel = (modelId: string) => {
    if (!prefs) return
    const disabled = new Set(prefs.disabledModels)
    if (disabled.has(modelId)) {
      disabled.delete(modelId)
    } else {
      disabled.add(modelId)
    }
    const updated = { ...prefs, disabledModels: Array.from(disabled) }
    setPrefs(updated)
    savePrefs(updated)
  }

  const setMaestro = (modelId: string) => {
    if (!prefs) return
    const updated = { ...prefs, maestroModel: modelId }
    setPrefs(updated)
    savePrefs(updated)
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    )
  }

  const modelsByTier = {
    cheap: models.filter(m => m.tier === 'cheap'),
    mid: models.filter(m => m.tier === 'mid'),
    premium: models.filter(m => m.tier === 'premium'),
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-4">
          <button
            onClick={() => router.push('/vibecoder')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Settings</h1>
          {saveMsg && <span className="ml-auto text-sm text-green-600">{saveMsg}</span>}
          {saving && <Loader2 className="ml-auto w-4 h-4 animate-spin text-gray-400" />}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Side nav */}
          <nav className="w-48 shrink-0 hidden sm:block">
            <div className="sticky top-20 space-y-1">
              {TABS.filter(t => !t.adminOnly || isAdmin).map((t) => {
                const Icon = 'icon' in t ? t.icon : null
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTab(t.id)
                      if (t.id === 'members') loadMembers()
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left',
                      tab === t.id
                        ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    )}
                  >
                    {Icon && <Icon className="w-4 h-4" />}
                    {t.label}
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Mobile tabs */}
          <div className="sm:hidden flex border-b border-gray-200 dark:border-gray-700 mb-4 w-full overflow-x-auto">
            {TABS.filter(t => !t.adminOnly || isAdmin).map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id)
                  if (t.id === 'members') loadMembers()
                }}
                className={cn(
                  'px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2',
                  tab === t.id
                    ? 'border-brand-500 text-brand-600'
                    : 'border-transparent text-gray-500'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {tab === 'general' && (
              <div className="space-y-4">
                <div className="p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">About VibeCoder</h2>
                  <p className="text-sm text-gray-500">
                    Autonomous LLM routing engine. Smart model selection for every message.
                    Uses cheap models first, escalates to maestro only when needed.
                  </p>
                </div>

                {/* Profile */}
                {user && (
                  <div className="p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Profile</h2>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                        <p className="text-sm text-gray-900 dark:text-white">{user.name}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                        <p className="text-sm text-gray-900 dark:text-white">{user.email}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
                        <p className="text-sm text-gray-900 dark:text-white capitalize">{user.role}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Change Password */}
                <div className="p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Change Password</h2>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault()
                      setPasswordMsg('')
                      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
                        setPasswordMsg('Passwords do not match')
                        return
                      }
                      if (passwordForm.newPassword.length < 6) {
                        setPasswordMsg('New password must be at least 6 characters')
                        return
                      }
                      setPasswordSaving(true)
                      try {
                        const res = await fetch('/api/auth/change-password', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            currentPassword: passwordForm.currentPassword,
                            newPassword: passwordForm.newPassword,
                          }),
                        })
                        const data = await res.json()
                        if (!res.ok) {
                          setPasswordMsg(data.error || 'Failed to change password')
                        } else {
                          setPasswordMsg('Password changed successfully')
                          setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
                        }
                      } catch {
                        setPasswordMsg('Something went wrong')
                      } finally {
                        setPasswordSaving(false)
                      }
                    }}
                    className="space-y-3"
                  >
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Current Password</label>
                      <input
                        type="password"
                        value={passwordForm.currentPassword}
                        onChange={e => setPasswordForm(p => ({ ...p, currentPassword: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">New Password</label>
                      <input
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={e => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
                        required
                        minLength={6}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Confirm New Password</label>
                      <input
                        type="password"
                        value={passwordForm.confirmPassword}
                        onChange={e => setPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
                        required
                        minLength={6}
                      />
                    </div>
                    {passwordMsg && (
                      <p className={`text-xs ${passwordMsg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                        {passwordMsg}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={passwordSaving}
                      className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                    >
                      {passwordSaving ? 'Saving...' : 'Update Password'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {tab === 'models' && (
              <div className="space-y-5">
                {loading || !prefs ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
                ) : (
                  <>
                    {/* Maestro Selection */}
                    <div className="p-5 border-2 border-amber-200 dark:border-amber-800 rounded-xl bg-amber-50/50 dark:bg-amber-900/10">
                      <div className="flex items-center gap-2 mb-3">
                        <Crown className="w-5 h-5 text-amber-600" />
                        <h3 className="font-semibold text-gray-900 dark:text-white">Maestro Model</h3>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        The maestro handles complex tasks and escalations. Choose your most capable model.
                      </p>
                      <div className="space-y-2">
                        {[...modelsByTier.premium, ...modelsByTier.mid.filter(m => m.inputCost >= 2)].map((m) => (
                          <button
                            key={m.id}
                            onClick={() => setMaestro(m.id)}
                            className={cn(
                              'w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all',
                              prefs.maestroModel === m.id
                                ? 'border-amber-400 bg-amber-100 dark:bg-amber-900/30'
                                : 'border-gray-200 dark:border-gray-700 hover:border-amber-300',
                            )}
                          >
                            <div>
                              <span className="text-sm font-medium text-gray-900 dark:text-white">{m.label}</span>
                              <span className="ml-2 text-xs text-gray-500">{formatContextWindow(m.contextWindow)} context</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">${m.inputCost}/${m.outputCost} per 1K</span>
                              {prefs.maestroModel === m.id && <Check className="w-4 h-4 text-amber-600" />}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Model Tiers */}
                    {(['cheap', 'mid', 'premium'] as const).map((tier) => {
                      const TierIcon = TIER_ICONS[tier]
                      return (
                        <div key={tier} className="p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn('p-1 rounded', TIER_COLORS[tier])}>
                              <TierIcon className="w-4 h-4" />
                            </span>
                            <h3 className="font-semibold text-gray-900 dark:text-white">{TIER_LABELS[tier]} Tier</h3>
                            <span className="text-xs text-gray-400 ml-auto">{modelsByTier[tier].length} models</span>
                          </div>
                          <p className="text-xs text-gray-500 mb-3">
                            {tier === 'cheap' && 'Fast, affordable models for simple tasks and greetings.'}
                            {tier === 'mid' && 'Quality models for coding, analysis, and writing.'}
                            {tier === 'premium' && 'Best models for complex tasks. Used sparingly.'}
                          </p>
                          <div className="space-y-1">
                            {modelsByTier[tier].map((m) => {
                              const isDisabled = prefs.disabledModels.includes(m.id)
                              const isMaestro = prefs.maestroModel === m.id
                              return (
                                <div
                                  key={m.id}
                                  className={cn(
                                    'flex items-center justify-between p-2.5 rounded-lg transition-all',
                                    isDisabled ? 'opacity-40' : '',
                                    isMaestro ? 'bg-amber-50 dark:bg-amber-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                                  )}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    {isAdmin && (
                                      <button
                                        onClick={() => toggleDisabledModel(m.id)}
                                        className={cn(
                                          'w-5 h-5 rounded border flex items-center justify-center shrink-0',
                                          isDisabled
                                            ? 'border-gray-300 dark:border-gray-600'
                                            : 'border-brand-500 bg-brand-500',
                                        )}
                                      >
                                        {!isDisabled && <Check className="w-3 h-3 text-white" />}
                                      </button>
                                    )}
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.label}</span>
                                        {isMaestro && <Crown className="w-3 h-3 text-amber-500 shrink-0" />}
                                      </div>
                                      <span className="text-xs text-gray-400 truncate block">{m.id}</span>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0 ml-3">
                                    <div className="text-xs text-gray-500">${m.inputCost} / ${m.outputCost}</div>
                                    <div className="text-xs text-gray-400">{formatContextWindow(m.contextWindow)} ctx</div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            )}

            {tab === 'research' && (
              <div className="space-y-4">
                {researchLoading || !researchSettings ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
                ) : (
                  <>
                    {/* Serper API Key */}
                    <div className="p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                      <div className="flex items-center gap-2 mb-3">
                        <Search className="w-5 h-5 text-cyan-600" />
                        <h3 className="font-semibold text-gray-900 dark:text-white">Serper API Key</h3>
                        {researchSettings.serperKeySet && (
                          <span className="ml-auto text-xs px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">Active</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        Get your API key from <a href="https://serper.dev" target="_blank" rel="noopener noreferrer" className="text-cyan-600 underline">serper.dev</a>.
                        Web Research requires a valid Serper key with available credits.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type={showSerperKey ? 'text' : 'password'}
                          placeholder={researchSettings.serperKeySet ? researchSettings.serperApiKey : 'Enter Serper API key...'}
                          value={serperKeyInput}
                          onChange={(e) => setSerperKeyInput(e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                        />
                        <button
                          onClick={() => setShowSerperKey(!showSerperKey)}
                          className="px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          {showSerperKey ? 'Hide' : 'Show'}
                        </button>
                        <button
                          onClick={() => {
                            if (serperKeyInput.trim()) {
                              saveResearchSettings({ serperApiKey: serperKeyInput.trim() })
                              setSerperKeyInput('')
                            }
                          }}
                          disabled={!serperKeyInput.trim() || saving}
                          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                        >
                          Save Key
                        </button>
                      </div>
                      {researchMsg && <p className="text-xs mt-2 text-gray-600 dark:text-gray-400">{researchMsg}</p>}
                    </div>

                    {/* Research Depth */}
                    <div className="p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                      <div className="flex items-center gap-2 mb-3">
                        <Globe className="w-5 h-5 text-cyan-600" />
                        <h3 className="font-semibold text-gray-900 dark:text-white">Research Depth</h3>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        Controls how many search keywords are generated per query. More keywords = broader research but more API calls.
                      </p>
                      <div className="space-y-2">
                        {[
                          { value: 'standard', label: 'Standard', desc: '5 keywords, ~50 results, faster (~2-4 min)' },
                          { value: 'extensive', label: 'Extensive', desc: '10 keywords, ~100 results, deeper (~5-10 min)' },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => saveResearchSettings({ defaultDepth: opt.value })}
                            className={cn(
                              'w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all',
                              researchSettings.defaultDepth === opt.value
                                ? 'border-cyan-400 bg-cyan-50 dark:bg-cyan-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:border-cyan-300',
                            )}
                          >
                            <div>
                              <span className="text-sm font-medium text-gray-900 dark:text-white">{opt.label}</span>
                              <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                            </div>
                            {researchSettings.defaultDepth === opt.value && <Check className="w-4 h-4 text-cyan-600" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Model Selection */}
                    <div className="p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Models</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1.5">
                            Cheap Model <span className="text-gray-400">(keywords extraction + page summaries)</span>
                          </label>
                          <select
                            value={researchSettings.cheapModel}
                            onChange={(e) => saveResearchSettings({ cheapModel: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                          >
                            <option value="qwen/qwen3.5-flash-02-23">Qwen 3.5 Flash ($0.10/$0.40)</option>
                            <option value="qwen/qwen3-coder-next">Qwen 3 Coder Next ($0.12/$0.75)</option>
                            <option value="meta-llama/llama-4-scout">Llama 4 Scout ($0.15/$0.60)</option>
                            <option value="qwen/qwen3.5-35b-a3b">Qwen 3.5 35B ($0.16/$1.30)</option>
                            <option value="deepseek/deepseek-chat-v3-0324">DeepSeek V3 ($0.27/$1.10)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1.5">
                            Maestro Model <span className="text-gray-400">(final research report synthesis)</span>
                          </label>
                          <select
                            value={researchSettings.maestroModel}
                            onChange={(e) => saveResearchSettings({ maestroModel: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                          >
                            <option value="anthropic/claude-sonnet-4.6">Claude Sonnet 4.6 ($3.00/$15.00)</option>
                            <option value="openai/gpt-5.4">GPT-5.4 ($2.50/$15.00)</option>
                            <option value="openai/gpt-5.3-chat">GPT-5.3 Chat ($1.75/$14.00)</option>
                            <option value="deepseek/deepseek-r1">DeepSeek R1 ($0.55/$2.19)</option>
                            <option value="qwen/qwen3.5-397b-a17b">Qwen 3.5 397B ($0.39/$2.34)</option>
                            <option value="anthropic/claude-opus-4.6">Claude Opus 4.6 ($5.00/$25.00)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-4 bg-cyan-50 dark:bg-cyan-950/30 rounded-xl border border-cyan-200 dark:border-cyan-800">
                      <p className="text-xs text-cyan-800 dark:text-cyan-200">
                        <strong>How it works:</strong> Your query is analyzed by the cheap model to extract search keywords.
                        Each keyword triggers a Serper search (~1 credit each). Results are deduplicated by URL frequency,
                        pages are crawled and summarized by the cheap model, then the maestro synthesizes a final cited report.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === 'openbook' && (
              <div className="space-y-4">
                {obLoading || !obSettings ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
                ) : (
                  <>
                    {/* Embedding Model */}
                    <div className="p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                      <div className="flex items-center gap-2 mb-3">
                        <BookOpen className="w-5 h-5 text-violet-600" />
                        <h3 className="font-semibold text-gray-900 dark:text-white">Embedding Model</h3>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        Used for vectorizing source chunks. Changing this will not re-embed existing sources.
                      </p>
                      <select
                        value={obSettings.embeddingModel}
                        onChange={(e) => saveOpenBookSettings({ embeddingModel: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                      >
                        <option value="openai/text-embedding-3-small">OpenAI text-embedding-3-small (1536d, $0.02/1M)</option>
                        <option value="openai/text-embedding-3-large">OpenAI text-embedding-3-large (3072d, $0.13/1M)</option>
                        <option value="openai/text-embedding-ada-002">OpenAI ada-002 (1536d, $0.10/1M)</option>
                        <option value="google/gemini-embedding-exp">Google Gemini Embedding (3072d, free preview)</option>
                        <option value="cohere/embed-english-v3.0">Cohere Embed v3 English (1024d, $0.10/1M)</option>
                        <option value="cohere/embed-multilingual-v3.0">Cohere Embed v3 Multilingual (1024d, $0.10/1M)</option>
                      </select>
                    </div>

                    {/* TTS (Text-to-Speech) */}
                    <div className="p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                      <div className="flex items-center gap-2 mb-3">
                        <Headphones className="w-5 h-5 text-rose-500" />
                        <h3 className="font-semibold text-gray-900 dark:text-white">Text-to-Speech (Podcast)</h3>
                        {(obSettings.ttsKeySet || obSettings.ttsGoogleKeySet) && (
                          <span className="ml-auto text-xs px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">Key Set</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        Bring your own API key for podcast audio generation. Supports OpenAI and Google Gemini TTS.
                      </p>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1.5">TTS Provider</label>
                          <select
                            value={obSettings.ttsProvider}
                            onChange={(e) => saveOpenBookSettings({ ttsProvider: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                          >
                            <option value="">None (script only, no audio)</option>
                            <option value="openai">OpenAI TTS (gpt-4o-mini-tts)</option>
                            <option value="google">Google Gemini TTS (gemini-2.5-flash-preview-tts)</option>
                          </select>
                        </div>
                        {obSettings.ttsProvider === 'openai' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">OpenAI API Key</label>
                            <div className="flex gap-2">
                              <input
                                type={showTtsKey ? 'text' : 'password'}
                                placeholder={obSettings.ttsKeySet ? obSettings.ttsApiKey : 'Enter OpenAI API key...'}
                                value={ttsKeyInput}
                                onChange={(e) => setTtsKeyInput(e.target.value)}
                                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                              />
                              <button
                                onClick={() => setShowTtsKey(!showTtsKey)}
                                className="px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                              >
                                {showTtsKey ? 'Hide' : 'Show'}
                              </button>
                              <button
                                onClick={() => {
                                  if (ttsKeyInput.trim()) {
                                    saveOpenBookSettings({ ttsApiKey: ttsKeyInput.trim(), ttsProvider: 'openai' })
                                    setTtsKeyInput('')
                                  }
                                }}
                                disabled={!ttsKeyInput.trim() || saving}
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                              >
                                Save Key
                              </button>
                            </div>
                          </div>
                        )}
                        {obSettings.ttsProvider === 'google' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">Google AI API Key</label>
                            <div className="flex gap-2">
                              <input
                                type={showTtsGoogleKey ? 'text' : 'password'}
                                placeholder={obSettings.ttsGoogleKeySet ? obSettings.ttsGoogleApiKey : 'Enter Google AI API key...'}
                                value={ttsGoogleKeyInput}
                                onChange={(e) => setTtsGoogleKeyInput(e.target.value)}
                                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                              />
                              <button
                                onClick={() => setShowTtsGoogleKey(!showTtsGoogleKey)}
                                className="px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                              >
                                {showTtsGoogleKey ? 'Hide' : 'Show'}
                              </button>
                              <button
                                onClick={() => {
                                  if (ttsGoogleKeyInput.trim()) {
                                    saveOpenBookSettings({ ttsGoogleApiKey: ttsGoogleKeyInput.trim(), ttsProvider: 'google' })
                                    setTtsGoogleKeyInput('')
                                  }
                                }}
                                disabled={!ttsGoogleKeyInput.trim() || saving}
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                              >
                                Save Key
                              </button>
                            </div>
                            <p className="text-xs text-gray-400 mt-1.5">
                              30 voices available including Kore, Puck, Zephyr, Charon. Supports 70+ languages.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* LLM Model Overrides */}
                    <div className="p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-3">LLM Models</h3>
                      <p className="text-xs text-gray-500 mb-3">
                        Override the models used for OpenBook generation tasks. Leave empty to use system defaults.
                      </p>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1.5">
                            Cheap Model <span className="text-gray-400">(chunking, flashcards, summaries)</span>
                          </label>
                          <select
                            value={obSettings.cheapModel}
                            onChange={(e) => saveOpenBookSettings({ cheapModel: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                          >
                            <option value="">System default</option>
                            <option value="qwen/qwen3.5-flash-02-23">Qwen 3.5 Flash ($0.10/$0.40)</option>
                            <option value="meta-llama/llama-4-scout">Llama 4 Scout ($0.15/$0.60)</option>
                            <option value="deepseek/deepseek-chat-v3-0324">DeepSeek V3 ($0.27/$1.10)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1.5">
                            Maestro Model <span className="text-gray-400">(study guides, podcast scripts)</span>
                          </label>
                          <select
                            value={obSettings.maestroModel}
                            onChange={(e) => saveOpenBookSettings({ maestroModel: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                          >
                            <option value="">System default</option>
                            <option value="anthropic/claude-sonnet-4.6">Claude Sonnet 4.6 ($3.00/$15.00)</option>
                            <option value="openai/gpt-5.4">GPT-5.4 ($2.50/$15.00)</option>
                            <option value="deepseek/deepseek-r1">DeepSeek R1 ($0.55/$2.19)</option>
                            <option value="anthropic/claude-opus-4.6">Claude Opus 4.6 ($5.00/$25.00)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Defaults */}
                    <div className="p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Defaults</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1.5">Default Audience Level</label>
                          <select
                            value={obSettings.defaultAudience}
                            onChange={(e) => saveOpenBookSettings({ defaultAudience: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                          >
                            <option value="beginner">Beginner — Simple language, analogies, no jargon</option>
                            <option value="undergraduate">Undergraduate — Clear explanations, some technical terms</option>
                            <option value="expert">Expert — Full technical depth, assumes domain knowledge</option>
                            <option value="executive">Executive — High-level insights, strategic implications</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1.5">Flashcard Count</label>
                          <input
                            type="number"
                            min={5}
                            max={100}
                            value={obSettings.flashcardCount}
                            onChange={(e) => saveOpenBookSettings({ flashcardCount: e.target.value })}
                            className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                          />
                          <p className="text-xs text-gray-400 mt-1">Number of flashcards to generate per source (5–100)</p>
                        </div>
                      </div>
                    </div>

                    {obMsg && (
                      <div className="p-3 bg-violet-50 dark:bg-violet-950/30 rounded-xl border border-violet-200 dark:border-violet-800">
                        <p className="text-xs text-violet-700 dark:text-violet-300">{obMsg}</p>
                      </div>
                    )}

                    {/* Info */}
                    <div className="p-4 bg-violet-50 dark:bg-violet-950/30 rounded-xl border border-violet-200 dark:border-violet-800">
                      <p className="text-xs text-violet-800 dark:text-violet-200">
                        <strong>OpenBook</strong> transforms your documents into interactive study materials —
                        summaries, flashcards, study guides, podcasts, and mind maps. Upload PDFs, paste text,
                        or add URLs as sources, then generate artifacts powered by AI.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === 'memory' && (
              <div className="space-y-4">
                <div className="p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-purple-600" />
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Memory</h2>
                    </div>
                    {memories.length > 0 && (
                      <button
                        onClick={deleteAllMemoriesAction}
                        className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Clear All
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mb-4">
                    VibeCoder learns about you from conversations and uses this context to personalize responses.
                    Memories are automatically extracted and injected into every chat.
                  </p>

                  {memoryLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
                  ) : memories.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <Brain className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No memories yet. Start chatting and VibeCoder will learn about you.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(
                        memories.reduce<Record<string, typeof memories>>((acc, m) => {
                          const cat = m.category || 'general'
                          if (!acc[cat]) acc[cat] = []
                          acc[cat].push(m)
                          return acc
                        }, {})
                      ).map(([category, items]) => (
                        <div key={category}>
                          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 mt-3">
                            {category.replace(/_/g, ' ')}
                          </h4>
                          {items.map((m) => (
                            <div
                              key={m.id}
                              className="group flex items-start gap-2 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
                            >
                              {editingMemoryId === m.id ? (
                                <div className="flex-1 flex items-center gap-2">
                                  <input
                                    autoFocus
                                    value={editMemoryContent}
                                    onChange={(e) => setEditMemoryContent(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveMemoryEdit(m.id)
                                      if (e.key === 'Escape') setEditingMemoryId(null)
                                    }}
                                    className="flex-1 text-sm bg-transparent border border-brand-400 rounded px-2 py-1 outline-none"
                                  />
                                  <button onClick={() => saveMemoryEdit(m.id)} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600">
                                    <Check className="w-3.5 h-3.5 text-green-500" />
                                  </button>
                                  <button onClick={() => setEditingMemoryId(null)} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600">
                                    <X className="w-3.5 h-3.5 text-gray-400" />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-700 dark:text-gray-300">{m.content}</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">
                                      {m.type} &middot; confidence {Math.round(m.confidence * 100)}% &middot; used {m.accessCount}x
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                                    <button
                                      onClick={() => { setEditingMemoryId(m.id); setEditMemoryContent(m.content) }}
                                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                                    >
                                      <Pencil className="w-3.5 h-3.5 text-gray-500" />
                                    </button>
                                    <button
                                      onClick={() => deleteMemoryItem(m.id)}
                                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-gray-500" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-400">
                      {memories.length} {memories.length === 1 ? 'memory' : 'memories'} stored.
                      Memories are extracted automatically after each conversation turn.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {tab === 'members' && isAdmin && (
              <div className="space-y-4">
                <div className="p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Invite New Member</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text" placeholder="Name" value={inviteForm.name}
                      onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                    />
                    <input
                      type="email" placeholder="Email" value={inviteForm.email}
                      onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                    />
                    <input
                      type="password" placeholder="Password" value={inviteForm.password}
                      onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                    />
                    <select
                      value={inviteForm.role}
                      onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                    >
                      <option value="member">Member</option>
                      {user.role === 'owner' && <option value="admin">Admin</option>}
                    </select>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <input
                      type="number" placeholder="Monthly credits" value={inviteForm.creditsMonthlyLimit}
                      onChange={(e) => setInviteForm({ ...inviteForm, creditsMonthlyLimit: parseInt(e.target.value) || 0 })}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm w-40"
                    />
                    <button onClick={inviteUser} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium">
                      Invite
                    </button>
                  </div>
                  {inviteMsg && <p className="text-sm mt-2 text-gray-600 dark:text-gray-400">{inviteMsg}</p>}
                </div>

                {loading ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
                ) : (
                  <div className="space-y-2">
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{m.name}</p>
                          <p className="text-xs text-gray-500">{m.email} — {m.role}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-brand-600">{Math.round(m.creditsBalance)} credits</p>
                          <p className="text-xs text-gray-500">limit: {m.creditsMonthlyLimit}/mo</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'credits' && (
              <div className="space-y-4">
                <div className="p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Credit Rates</h2>
                  <p className="text-sm text-gray-500 mb-4">1 credit = $0.001 USD equivalent</p>
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-3 font-medium text-gray-500 pb-2 border-b border-gray-200 dark:border-gray-700">
                      <span>Model</span>
                      <span>Input/1K</span>
                      <span>Output/1K</span>
                    </div>
                    {[
                      { name: 'Gemini Flash 2.0', input: 0.1, output: 0.4 },
                      { name: 'Llama 4 Scout', input: 0.15, output: 0.6 },
                      { name: 'DeepSeek V3', input: 0.27, output: 1.1 },
                      { name: 'Gemini 2.5 Pro', input: 1.25, output: 10.0 },
                      { name: 'Claude Sonnet 4', input: 3.0, output: 15.0 },
                      { name: 'Claude Opus 4', input: 15.0, output: 75.0 },
                    ].map((m) => (
                      <div key={m.name} className="grid grid-cols-3 text-gray-700 dark:text-gray-300 py-1">
                        <span>{m.name}</span>
                        <span>{m.input}</span>
                        <span>{m.output}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
