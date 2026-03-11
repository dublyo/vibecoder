'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Users as UsersIcon, CreditCard, Loader2, Check, Crown, Zap, Bot } from './icons'
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

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  user: { role: string }
}

export function SettingsModal({ isOpen, onClose, user }: SettingsModalProps) {
  const [tab, setTab] = useState<'general' | 'models' | 'members' | 'credits'>('general')
  const [members, setMembers] = useState<Array<{
    id: string; email: string; name: string; role: string;
    creditsBalance: number; creditsMonthlyLimit: number; isActive: boolean
  }>>([])
  const [loading, setLoading] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', password: '', role: 'member', creditsMonthlyLimit: 1000 })
  const [inviteMsg, setInviteMsg] = useState('')

  // Model settings state
  const [models, setModels] = useState<ModelInfo[]>([])
  const [prefs, setPrefs] = useState<ModelPreferences | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const isAdmin = user.role === 'owner' || user.role === 'admin'

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
    if (isOpen && tab === 'models' && models.length === 0) {
      loadModels()
    }
  }, [isOpen, tab, models.length, loadModels])

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

  if (!isOpen) return null

  const modelsByTier = {
    cheap: models.filter(m => m.tier === 'cheap'),
    mid: models.filter(m => m.tier === 'mid'),
    premium: models.filter(m => m.tier === 'premium'),
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h2>
          <div className="flex items-center gap-2">
            {saveMsg && <span className="text-xs text-green-600">{saveMsg}</span>}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button onClick={() => setTab('general')} className={cn('flex-1 py-3 text-sm font-medium', tab === 'general' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-gray-500')}>
            General
          </button>
          <button onClick={() => setTab('models')} className={cn('flex-1 py-3 text-sm font-medium', tab === 'models' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-gray-500')}>
            <Bot className="w-4 h-4 inline mr-1" /> Models
          </button>
          {isAdmin && (
            <>
              <button onClick={() => { setTab('members'); loadMembers() }} className={cn('flex-1 py-3 text-sm font-medium', tab === 'members' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-gray-500')}>
                <UsersIcon className="w-4 h-4 inline mr-1" /> Members
              </button>
              <button onClick={() => setTab('credits')} className={cn('flex-1 py-3 text-sm font-medium', tab === 'credits' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-gray-500')}>
                <CreditCard className="w-4 h-4 inline mr-1" /> Credits
              </button>
            </>
          )}
        </div>
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {tab === 'general' && (
            <div className="space-y-4">
              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl">
                <p className="font-medium text-gray-900 dark:text-white">About VibeCoder</p>
                <p className="text-sm text-gray-500 mt-1">
                  Autonomous LLM routing engine. Smart model selection for every message.
                </p>
              </div>
            </div>
          )}

          {tab === 'models' && (
            <div className="space-y-5">
              {loading || !prefs ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : (
                <>
                  {/* Maestro Selection */}
                  <div className="p-4 border-2 border-amber-200 dark:border-amber-800 rounded-xl bg-amber-50/50 dark:bg-amber-900/10">
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
                      <div key={tier} className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl">
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
              {saving && (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                </div>
              )}
            </div>
          )}

          {tab === 'members' && isAdmin && (
            <div className="space-y-4">
              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl">
                <h3 className="font-medium text-gray-900 dark:text-white mb-3">Invite New Member</h3>
                <div className="grid grid-cols-2 gap-3">
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
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : (
                <div className="space-y-2">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
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
              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl">
                <p className="font-medium text-gray-900 dark:text-white">Credit Rates</p>
                <p className="text-sm text-gray-500 mt-1 mb-3">1 credit = $0.001 USD equivalent</p>
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-3 font-medium text-gray-500 pb-1 border-b">
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
                    <div key={m.name} className="grid grid-cols-3 text-gray-700 dark:text-gray-300">
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
  )
}
