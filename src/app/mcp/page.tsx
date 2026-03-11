'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Terminal, Trash2, Search, Check, AlertCircle,
  Loader2, Globe, X, ExternalLink,
} from '@/components/icons'
import { cn } from '@/lib/utils'

interface McpServer {
  id: string
  name: string
  slug: string
  description: string
  icon: string
  url: string
  category: string
  isOfficial: boolean
  authType: string
  toolCount: number
}

interface McpInstallation {
  id: string
  serverId: string | null
  customUrl: string | null
  customName: string | null
  credentials: string | null
  isActive: boolean
  budgetLimit: number
  cachedTools: string | null
  server: McpServer | null
}

const CATEGORY_LABELS: Record<string, string> = {
  dev: 'Development',
  research: 'Research',
  data: 'Data',
  communication: 'Communication',
  general: 'General',
}

const CREDENTIAL_HINTS: Record<string, { label: string; placeholder: string; hint: string }> = {
  github: { label: 'Personal Access Token', placeholder: 'ghp_xxxxxxxxxxxx', hint: 'Generate at github.com → Settings → Developer settings → Personal access tokens' },
  websearch: { label: 'Serper API Key', placeholder: 'serper-api-key', hint: 'Get your key at serper.dev' },
  webfetch: { label: 'Access Token', placeholder: 'Bearer token or access key', hint: 'Provide the access token from your Web Fetch MCP provider' },
  database: { label: 'Database Connection String', placeholder: 'postgresql://user:pass@host:5432/db', hint: 'Full connection string to your database' },
  slack: { label: 'Bot Token', placeholder: 'xoxb-xxxxxxxxxxxx', hint: 'Create a Slack app at api.slack.com and get the Bot User OAuth Token' },
  git: { label: 'Access Token (optional)', placeholder: 'ghp_xxxx or gitlab token', hint: 'Only needed for private repos — leave empty for public repos' },
  memory: { label: 'No credentials needed', placeholder: '', hint: 'This server runs locally — no API key required' },
  'sequential-thinking': { label: 'No credentials needed', placeholder: '', hint: 'This server runs locally — no API key required' },
  time: { label: 'No credentials needed', placeholder: '', hint: 'This server runs locally — no API key required' },
  everything: { label: 'No credentials needed', placeholder: '', hint: 'Reference test server — no API key required' },
  'google-maps': { label: 'Google Maps API Key', placeholder: 'AIzaSy...', hint: 'Get your key from Google Cloud Console → APIs & Services → Credentials' },
  'brave-search': { label: 'Brave Search API Key', placeholder: 'BSA...', hint: 'Get your key at brave.com/search/api' },
  puppeteer: { label: 'No credentials needed', placeholder: '', hint: 'Runs a local browser — no API key required' },
  postgres: { label: 'Connection String', placeholder: 'postgresql://user:pass@host:5432/db', hint: 'Full PostgreSQL connection URL' },
  sentry: { label: 'Auth Token', placeholder: 'sntrys_xxxxxxxxxxxx', hint: 'Generate at sentry.io → Settings → Auth Tokens' },
  'google-drive': { label: 'OAuth Credentials JSON', placeholder: '{"client_id":"...","client_secret":"..."}', hint: 'Download credentials from Google Cloud Console → APIs → OAuth 2.0' },
  linear: { label: 'API Key', placeholder: 'lin_api_xxxxxxxxxxxx', hint: 'Generate at linear.app → Settings → API → Personal API keys' },
  filesystem: { label: 'No credentials needed', placeholder: '', hint: 'Runs locally — no API key required' },
  notion: { label: 'Integration Token', placeholder: 'ntn_xxxxxxxxxxxx', hint: 'Create an integration at notion.so/my-integrations and copy the Internal Integration Secret' },
  jira: { label: 'API Token', placeholder: 'your-email:api-token', hint: 'Generate at id.atlassian.com → Security → API tokens. Format: email:token' },
  confluence: { label: 'API Token', placeholder: 'your-email:api-token', hint: 'Same as Jira — generate at id.atlassian.com → Security → API tokens' },
  discord: { label: 'Bot Token', placeholder: 'MTk...xxxx', hint: 'Create a bot at discord.com/developers/applications and copy the Bot Token' },
  telegram: { label: 'Bot Token', placeholder: '123456:ABC-DEF...', hint: 'Get your token from @BotFather on Telegram' },
  'email-smtp': { label: 'SMTP Credentials', placeholder: 'smtp://user:pass@host:587', hint: 'SMTP connection URL with username and password' },
  stripe: { label: 'Secret Key', placeholder: 'sk_live_xxxxxxxxxxxx', hint: 'Find at dashboard.stripe.com → Developers → API keys' },
  shopify: { label: 'Admin API Token', placeholder: 'shpat_xxxxxxxxxxxx', hint: 'Create a custom app in Shopify admin → Settings → Apps → Develop apps' },
  figma: { label: 'Personal Access Token', placeholder: 'figd_xxxxxxxxxxxx', hint: 'Generate at figma.com → Settings → Personal Access Tokens' },
  aws: { label: 'Access Key ID + Secret', placeholder: 'AKIAXXXXXXXX:secret', hint: 'Create access keys in AWS IAM Console. Format: AccessKeyId:SecretAccessKey' },
  docker: { label: 'No credentials needed', placeholder: '', hint: 'Connects to local Docker daemon — no API key required' },
  kubernetes: { label: 'Kubeconfig Path or Token', placeholder: '~/.kube/config or bearer token', hint: 'Uses local kubeconfig by default, or provide a service account token' },
  mysql: { label: 'Connection String', placeholder: 'mysql://user:pass@host:3306/db', hint: 'Full MySQL connection URL' },
  mongodb: { label: 'Connection String', placeholder: 'mongodb+srv://user:pass@cluster.mongodb.net/db', hint: 'MongoDB connection URI from your Atlas dashboard or local instance' },
  redis: { label: 'Connection URL', placeholder: 'redis://user:pass@host:6379', hint: 'Redis connection URL — leave empty for localhost:6379' },
  twilio: { label: 'Account SID + Auth Token', placeholder: 'ACxxxx:auth_token', hint: 'Find at console.twilio.com → Account Info. Format: SID:AuthToken' },
  cloudflare: { label: 'API Token', placeholder: 'cf_xxxxxxxxxxxx', hint: 'Create at dash.cloudflare.com → My Profile → API Tokens' },
  youtube: { label: 'YouTube Data API Key', placeholder: 'AIzaSy...', hint: 'Enable YouTube Data API v3 in Google Cloud Console and create an API key' },
  twitter: { label: 'Bearer Token', placeholder: 'AAAAAAAAAAAAAxxxxxxxxxx', hint: 'Create an app at developer.twitter.com and get your Bearer Token' },
  vercel: { label: 'Access Token', placeholder: 'vercel_xxxxxxxxxxxx', hint: 'Generate at vercel.com → Settings → Tokens' },
  supabase: { label: 'Service Role Key', placeholder: 'eyJhbGciOi...', hint: 'Find at app.supabase.com → Project → Settings → API → service_role key' },
  openapi: { label: 'Auth Header (optional)', placeholder: 'Bearer token or API key', hint: 'Depends on the API spec — provide the auth header value if required' },
  hubspot: { label: 'Private App Token', placeholder: 'pat-xxxxxxxxxxxx', hint: 'Create at HubSpot → Settings → Integrations → Private Apps' },
  airtable: { label: 'Personal Access Token', placeholder: 'pat...xxxx', hint: 'Generate at airtable.com/create/tokens' },
  'google-calendar': { label: 'OAuth Credentials JSON', placeholder: '{"client_id":"...","client_secret":"..."}', hint: 'Download OAuth credentials from Google Cloud Console' },
  'google-sheets': { label: 'OAuth Credentials JSON', placeholder: '{"client_id":"...","client_secret":"..."}', hint: 'Download OAuth credentials from Google Cloud Console' },
}

const ICON_MAP: Record<string, typeof Terminal> = {
  terminal: Terminal,
  'folder-open': Terminal,
  globe: Globe,
  database: Terminal,
  'message-square': Terminal,
  github: Terminal,
}

export default function McpMarketplacePage() {
  const router = useRouter()
  const [servers, setServers] = useState<McpServer[]>([])
  const [installations, setInstallations] = useState<McpInstallation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  // Custom URL modal
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [customUrl, setCustomUrl] = useState('')
  const [customName, setCustomName] = useState('')
  const [customCredentials, setCustomCredentials] = useState('')
  const [customTesting, setCustomTesting] = useState(false)
  const [customError, setCustomError] = useState('')

  // Config modal
  const [configInstId, setConfigInstId] = useState<string | null>(null)
  const [configCredentials, setConfigCredentials] = useState('')
  const [configBudget, setConfigBudget] = useState(5)
  const [configSaving, setConfigSaving] = useState(false)

  const [installing, setInstalling] = useState(false)

  // Inline notification
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, iRes] = await Promise.all([
        fetch('/api/mcp/servers'),
        fetch('/api/mcp/installations'),
      ])
      if (sRes.ok) {
        const sData = await sRes.json()
        setServers(sData.servers || [])
      }
      if (iRes.ok) {
        const iData = await iRes.json()
        setInstallations(iData.installations || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const installedServerIds = new Set(installations.map(i => i.serverId).filter(Boolean))

  const filteredServers = servers.filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) &&
        !s.description.toLowerCase().includes(search.toLowerCase())) return false
    if (categoryFilter !== 'all' && s.category !== categoryFilter) return false
    return true
  })

  const categories = [...new Set(servers.map(s => s.category))]

  // Install an official server
  const handleInstall = async (server: McpServer) => {
    setInstalling(true)
    try {
      const res = await fetch('/api/mcp/installations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId: server.id }),
      })
      if (res.ok) {
        showToast('success', `${server.name} installed!`)
        await loadData()
      }
    } finally {
      setInstalling(false)
    }
  }

  // Uninstall
  const handleUninstall = async (instId: string) => {
    const res = await fetch('/api/mcp/installations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: instId }),
    })
    if (res.ok) await loadData()
  }

  // Toggle active
  const handleToggle = async (instId: string, isActive: boolean) => {
    await fetch('/api/mcp/installations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: instId, isActive }),
    })
    await loadData()
  }

  // Save config
  const handleSaveConfig = async () => {
    if (!configInstId) return
    setConfigSaving(true)
    try {
      await fetch('/api/mcp/installations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: configInstId,
          budgetLimit: configBudget,
          ...(configCredentials ? { credentials: configCredentials } : {}),
        }),
      })
      setConfigInstId(null)
      await loadData()
    } finally {
      setConfigSaving(false)
    }
  }

  // Add custom server
  const handleAddCustom = async () => {
    if (!customUrl.trim()) return
    setCustomTesting(true)
    setCustomError('')
    try {
      const res = await fetch('/api/mcp/installations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customUrl: customUrl.trim(),
          customName: customName.trim() || 'Custom Server',
          credentials: customCredentials || undefined,
        }),
      })
      if (res.ok) {
        setShowCustomModal(false)
        setCustomUrl('')
        setCustomName('')
        setCustomCredentials('')
        await loadData()
      } else {
        const data = await res.json()
        setCustomError(data.error || 'Failed to add server')
      }
    } catch {
      setCustomError('Network error')
    } finally {
      setCustomTesting(false)
    }
  }

  // Test connection
  const handleTestConnection = async (instId: string) => {
    const res = await fetch('/api/mcp/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installationId: instId }),
    })
    const data = await res.json()
    if (data.connected) {
      showToast('success', `Connected! ${data.toolCount} tools available.`)
      await loadData()
    } else {
      showToast('error', `Connection failed: ${data.error}`)
    }
  }

  const configInst = installations.find(i => i.id === configInstId)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Inline toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${
          toast.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
        }`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/vibecoder')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">MCP Marketplace</h1>
              <p className="text-sm text-gray-500">Connect AI tools to your chat</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://dublyo.com/dashboard/mcp"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 border border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-400 rounded-lg hover:bg-cyan-50 dark:hover:bg-cyan-900/20 text-sm font-medium"
            >
              <ExternalLink className="w-4 h-4" />
              Get MCP Servers
            </a>
            <button
              onClick={() => setShowCustomModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Custom Server
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-8">
        {/* Your Servers */}
        {installations.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Your Servers ({installations.filter(i => i.isActive).length} active)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {installations.map(inst => {
                const name = inst.server?.name || inst.customName || 'Custom'
                const desc = inst.server?.description || inst.customUrl || ''
                const icon = inst.server?.icon || 'terminal'
                const IconComp = ICON_MAP[icon] || Terminal
                const toolCount = inst.cachedTools ? JSON.parse(inst.cachedTools).length : (inst.server?.toolCount || 0)

                return (
                  <div key={inst.id} className={cn(
                    'p-4 rounded-xl border-2 bg-white dark:bg-gray-800 transition',
                    inst.isActive
                      ? 'border-cyan-300 dark:border-cyan-700'
                      : 'border-gray-200 dark:border-gray-700 opacity-60'
                  )}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                        <IconComp className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleToggle(inst.id, !inst.isActive)}
                          className={cn(
                            'px-2 py-1 rounded text-xs font-medium',
                            inst.isActive
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                          )}
                        >
                          {inst.isActive ? 'Active' : 'Paused'}
                        </button>
                      </div>
                    </div>
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">{name}</p>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{desc}</p>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                      <span className="text-xs text-gray-400">{toolCount} tools</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleTestConnection(inst.id)}
                          className="text-xs text-cyan-600 hover:text-cyan-700 font-medium"
                        >
                          Test
                        </button>
                        <button
                          onClick={() => {
                            setConfigInstId(inst.id)
                            setConfigCredentials('')
                            setConfigBudget(inst.budgetLimit)
                          }}
                          className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                        >
                          Config
                        </button>
                        <button
                          onClick={() => handleUninstall(inst.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Browse Marketplace */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Browse Marketplace</h2>

          {/* Search + Filter */}
          <div className="flex gap-3 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search servers..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              />
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setCategoryFilter('all')}
                className={cn(
                  'px-3 py-2 rounded-lg text-xs font-medium',
                  categoryFilter === 'all'
                    ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                )}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-xs font-medium',
                    categoryFilter === cat
                      ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  )}
                >
                  {CATEGORY_LABELS[cat] || cat}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredServers.map(server => {
                const isInstalled = installedServerIds.has(server.id)
                const IconComp = ICON_MAP[server.icon] || Terminal
                return (
                  <div key={server.id} className="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                        <IconComp className="w-5 h-5 text-white" />
                      </div>
                      {server.isOfficial && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400">
                          Official
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">{server.name}</p>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{server.description}</p>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                      <span className="text-xs text-gray-400">{server.toolCount} tools</span>
                      {isInstalled ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                          <Check className="w-3.5 h-3.5" />
                          Installed
                        </span>
                      ) : (
                        <button
                          onClick={() => handleInstall(server)}
                          className="px-3 py-1.5 bg-cyan-600 text-white rounded-lg text-xs font-medium hover:bg-cyan-700"
                        >
                          Install
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* Config Modal */}
      {configInstId && configInst && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Configure {configInst.server?.name || configInst.customName || 'Server'}
              </h3>
              <button onClick={() => setConfigInstId(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Budget Limit (credits per turn)
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={configBudget}
                  onChange={e => setConfigBudget(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">Max credits the agentic loop can spend per message</p>
              </div>

              {(() => {
                const slug = configInst.server?.slug || ''
                const cred = CREDENTIAL_HINTS[slug]
                const needsCreds = cred && cred.placeholder !== ''
                return (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {cred?.label || 'Credentials'}
                    </label>
                    {needsCreds ? (
                      <>
                        <input
                          type="password"
                          value={configCredentials}
                          onChange={e => setConfigCredentials(e.target.value)}
                          placeholder={cred.placeholder}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                        />
                        <p className="text-xs text-gray-400 mt-1">{cred.hint}</p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1">{cred?.hint || 'No credentials required'}</p>
                    )}
                  </div>
                )
              })()}

              {configInst.cachedTools && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Available Tools
                  </label>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {(JSON.parse(configInst.cachedTools) as { name: string; description?: string }[]).map(t => (
                      <div key={t.name} className="text-xs px-2 py-1 bg-gray-50 dark:bg-gray-900 rounded">
                        <span className="font-mono font-medium">{t.name}</span>
                        {t.description && <span className="text-gray-400 ml-2">{t.description}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setConfigInstId(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={configSaving}
                className="flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 disabled:opacity-50"
              >
                {configSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Server Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add Custom Server</h3>
              <button onClick={() => setShowCustomModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Server URL
                </label>
                <input
                  type="url"
                  value={customUrl}
                  onChange={e => setCustomUrl(e.target.value)}
                  placeholder="https://my-server.com/mcp"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="My Custom Server"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Credentials (optional)
                </label>
                <input
                  type="password"
                  value={customCredentials}
                  onChange={e => setCustomCredentials(e.target.value)}
                  placeholder="API key or Bearer token"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                />
              </div>
              {customError && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  {customError}
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowCustomModal(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustom}
                disabled={customTesting || !customUrl.trim()}
                className="flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 disabled:opacity-50"
              >
                {customTesting ? 'Adding...' : 'Add Server'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
