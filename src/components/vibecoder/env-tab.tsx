'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Eye, EyeOff, Save, RefreshCw, AlertCircle, Check, Key } from 'lucide-react'

interface EnvVar {
  key: string
  value: string
  isNew?: boolean
}

interface EnvTabProps {
  projectId: string
}

const COMMON_ENV_VARS = [
  { key: 'DATABASE_URL', hint: 'postgresql://user:pass@host:5432/db' },
  { key: 'REDIS_URL', hint: 'redis://:password@host:6379' },
  { key: 'API_KEY', hint: 'Your API key' },
  { key: 'JWT_SECRET', hint: 'Random secret string' },
  { key: 'NEXT_PUBLIC_API_URL', hint: 'https://api.example.com' },
  { key: 'SMTP_HOST', hint: 'smtp.gmail.com' },
  { key: 'S3_BUCKET', hint: 'my-bucket-name' },
  { key: 'OPENAI_API_KEY', hint: 'sk-...' },
]

export function EnvTab({ projectId }: EnvTabProps) {
  const [vars, setVars] = useState<EnvVar[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showValues, setShowValues] = useState<Set<number>>(new Set())
  const [hasChanges, setHasChanges] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const fetchEnvVars = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/vibecoder/projects/${projectId}/env`)
      if (!res.ok) throw new Error('Failed to load env vars')
      const data = await res.json()
      const entries = Object.entries(data.envVars || {}).map(([key, val]: [string, any]) => ({
        key,
        value: val.value || '',
      }))
      setVars(entries)
      setHasChanges(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchEnvVars() }, [fetchEnvVars])

  const saveEnvVars = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const envVars: Record<string, string> = {}
      for (const v of vars) {
        if (v.key.trim()) {
          envVars[v.key.trim()] = v.value
        }
      }
      const res = await fetch(`/api/vibecoder/projects/${projectId}/env`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envVars }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }
      setHasChanges(false)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      // Remove isNew flag
      setVars(prev => prev.map(v => ({ ...v, isNew: false })))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const addVar = (key = '', value = '') => {
    setVars(prev => [...prev, { key, value, isNew: true }])
    setHasChanges(true)
  }

  const removeVar = (index: number) => {
    setVars(prev => prev.filter((_, i) => i !== index))
    setHasChanges(true)
    setShowValues(prev => {
      const next = new Set(prev)
      next.delete(index)
      return next
    })
  }

  const updateVar = (index: number, field: 'key' | 'value', val: string) => {
    setVars(prev => prev.map((v, i) => i === index ? { ...v, [field]: val } : v))
    setHasChanges(true)
  }

  const toggleShow = (index: number) => {
    setShowValues(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const addSuggested = (key: string) => {
    if (!vars.some(v => v.key === key)) {
      addVar(key, '')
    }
    setShowSuggestions(false)
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading environment variables...
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            Environment Variables
          </span>
          <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
            {vars.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          >
            <Plus className="w-3 h-3" />
            Suggest
          </button>
          <button
            onClick={() => addVar()}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
          <button
            onClick={saveEnvVars}
            disabled={!hasChanges || saving}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded transition-all ${
              hasChanges
                ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
            }`}
          >
            {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </button>
        </div>
      </div>

      {/* Status messages */}
      {error && (
        <div className="mx-4 mt-2 flex items-center gap-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="mx-4 mt-2 flex items-center gap-2 text-xs text-green-600 bg-green-50 dark:bg-green-900/20 px-3 py-1.5 rounded">
          <Check className="w-3.5 h-3.5 flex-shrink-0" />
          Environment variables saved. Redeploy to apply changes.
        </div>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && (
        <div className="mx-4 mt-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 p-2">
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5 px-1">Common Variables</div>
          <div className="grid grid-cols-2 gap-1">
            {COMMON_ENV_VARS.filter(s => !vars.some(v => v.key === s.key)).map(s => (
              <button
                key={s.key}
                onClick={() => addSuggested(s.key)}
                className="flex items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-white dark:hover:bg-gray-800 rounded transition-colors"
              >
                <span className="font-mono text-brand-600 dark:text-brand-400">{s.key}</span>
                <span className="text-gray-400 text-[10px] truncate">{s.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Variables list */}
      <div className="flex-1 overflow-y-auto p-4">
        {vars.length === 0 ? (
          <div className="text-center py-12">
            <Key className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">No environment variables</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              Add variables like API keys, database URLs, and secrets.
              <br />
              They'll be injected into your deployed container.
            </p>
            <button
              onClick={() => addVar()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add Variable
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Column headers */}
            <div className="flex items-center gap-2 px-1 mb-1">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider w-[200px]">Key</span>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider flex-1">Value</span>
              <span className="w-16" />
            </div>

            {vars.map((v, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 group ${
                  v.isNew ? 'animate-in slide-in-from-top-1' : ''
                }`}
              >
                <input
                  type="text"
                  value={v.key}
                  onChange={e => updateVar(i, 'key', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                  placeholder="KEY_NAME"
                  className="w-[200px] px-2 py-1.5 text-xs font-mono bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 placeholder:text-gray-300 dark:placeholder:text-gray-600"
                  autoFocus={v.isNew}
                />
                <div className="flex-1 relative">
                  <input
                    type={showValues.has(i) ? 'text' : 'password'}
                    value={v.value}
                    onChange={e => updateVar(i, 'value', e.target.value)}
                    placeholder="value"
                    className="w-full px-2 py-1.5 pr-8 text-xs font-mono bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 placeholder:text-gray-300 dark:placeholder:text-gray-600"
                  />
                  <button
                    onClick={() => toggleShow(i)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    title={showValues.has(i) ? 'Hide value' : 'Show value'}
                  >
                    {showValues.has(i) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
                <button
                  onClick={() => removeVar(i)}
                  className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                  title="Remove variable"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Info footer */}
        {vars.length > 0 && (
          <div className="mt-6 px-3 py-2.5 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg">
            <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-relaxed">
              Environment variables are injected into your deployed container at runtime.
              After saving, redeploy your project to apply changes.
              Values are stored securely and never exposed in client-side code unless prefixed with <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">NEXT_PUBLIC_</code>.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
