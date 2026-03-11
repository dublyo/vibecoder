'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Play, RefreshCw, CheckCircle2, XCircle, Hammer, Database, Package, Wrench, Search, Plus, ExternalLink } from 'lucide-react'

interface BuildTabProps {
  projectId: string
}

interface BuildCommand {
  id: string
  args: string
  label: string
  icon: typeof Database
  description: string
  category: 'database' | 'dependencies' | 'build'
}

const COMMAND_META: Record<string, { label: string; icon: typeof Database; description: string; category: 'database' | 'dependencies' | 'build' }> = {
  'prisma-generate': { label: 'Prisma Generate', icon: Database, description: 'Generate Prisma Client from schema', category: 'database' },
  'prisma-push': { label: 'Prisma Push', icon: Database, description: 'Push schema changes to database', category: 'database' },
  'prisma-migrate': { label: 'Prisma Migrate', icon: Database, description: 'Run pending database migrations', category: 'database' },
  'npm-init': { label: 'npm init', icon: Package, description: 'Initialize package.json (run first if missing)', category: 'dependencies' },
  'npm-install': { label: 'npm install', icon: Package, description: 'Install npm dependencies', category: 'dependencies' },
  'pnpm-install': { label: 'pnpm install', icon: Package, description: 'Install pnpm dependencies', category: 'dependencies' },
  'npm-build': { label: 'npm build', icon: Hammer, description: 'Build the project', category: 'build' },
  'check-deps': { label: 'Check deps', icon: Wrench, description: 'List installed dependencies', category: 'dependencies' },
}

const CATEGORY_LABELS: Record<string, string> = {
  database: 'Database',
  dependencies: 'Dependencies',
  build: 'Build',
}

interface NpmPackage {
  name: string
  version: string
  description: string
  score: number
  links: { npm: string; homepage: string }
}

export function BuildTab({ projectId }: BuildTabProps) {
  const [commands, setCommands] = useState<BuildCommand[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)
  const [output, setOutput] = useState<string | null>(null)
  const [success, setSuccess] = useState<boolean | null>(null)
  const [lastCommand, setLastCommand] = useState<string | null>(null)
  const [dbProvisioned, setDbProvisioned] = useState<boolean | null>(null)
  const [npmQuery, setNpmQuery] = useState('')
  const [npmResults, setNpmResults] = useState<NpmPackage[]>([])
  const [npmSearching, setNpmSearching] = useState(false)
  const [npmInstalling, setNpmInstalling] = useState<string | null>(null)
  const outputRef = useRef<HTMLPreElement>(null)

  const fetchCommands = useCallback(async () => {
    try {
      const res = await fetch(`/api/vibecoder/projects/${projectId}/build`)
      if (res.ok) {
        const data = await res.json()
        setCommands(data.commands.map((cmd: any) => ({
          ...cmd,
          ...(COMMAND_META[cmd.id] || { label: cmd.id, icon: Wrench, description: cmd.args, category: 'build' }),
        })))
      }
    } catch {} finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchCommands() }, [fetchCommands])

  // Check database status
  useEffect(() => {
    fetch(`/api/vibecoder/projects/${projectId}/database`)
      .then(r => r.json())
      .then(d => setDbProvisioned(d.provisioned))
      .catch(() => {})
  }, [projectId])

  const provisionDatabase = async () => {
    setRunning('provision-db')
    setOutput(null)
    setSuccess(null)
    setLastCommand('provision-db')
    try {
      const res = await fetch(`/api/vibecoder/projects/${projectId}/database`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      setOutput(JSON.stringify(data, null, 2))
      setSuccess(!!data.success || !!data.databaseUrl)
      if (data.success || data.databaseUrl) setDbProvisioned(true)
    } catch (err: any) {
      setOutput(`Error: ${err.message}`)
      setSuccess(false)
    } finally {
      setRunning(null)
    }
  }

  const runCommand = async (commandId: string) => {
    setRunning(commandId)
    setOutput(null)
    setSuccess(null)
    setLastCommand(commandId)

    try {
      const res = await fetch(`/api/vibecoder/projects/${projectId}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: commandId }),
      })
      const data = await res.json()
      setOutput(data.output || data.error || 'No output')
      setSuccess(data.success ?? res.ok)
    } catch (err: any) {
      setOutput(`Error: ${err.message}`)
      setSuccess(false)
    } finally {
      setRunning(null)
    }
  }

  const searchNpm = async () => {
    if (!npmQuery.trim()) return
    setNpmSearching(true)
    setNpmResults([])
    try {
      const res = await fetch(`/api/vibecoder/projects/${projectId}/packages?q=${encodeURIComponent(npmQuery.trim())}`)
      if (res.ok) {
        const data = await res.json()
        setNpmResults(data.packages || [])
      }
    } catch {} finally {
      setNpmSearching(false)
    }
  }

  const installPackage = async (name: string, dev: boolean = false) => {
    setNpmInstalling(name)
    setOutput(null)
    setSuccess(null)
    setLastCommand(`install-${name}`)
    try {
      const res = await fetch(`/api/vibecoder/projects/${projectId}/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, dev }),
      })
      const data = await res.json()
      setOutput(data.output || data.error || 'Installed successfully')
      setSuccess(data.success ?? res.ok)
    } catch (err: any) {
      setOutput(`Error: ${err.message}`)
      setSuccess(false)
    } finally {
      setNpmInstalling(null)
    }
  }

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading build commands...
        </div>
      </div>
    )
  }

  // Group commands by category
  const grouped = commands.reduce((acc, cmd) => {
    const cat = cmd.category || 'build'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(cmd)
    return acc
  }, {} as Record<string, BuildCommand[]>)

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <Hammer className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Build Tools</span>
        {running && (
          <span className="flex items-center gap-1 text-[10px] text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Running...
          </span>
        )}
      </div>

      {/* Commands */}
      <div className="flex-shrink-0 p-4 space-y-4 border-b border-gray-100 dark:border-gray-800 overflow-y-auto max-h-[50%]">
        {/* Database Provisioning */}
        {dbProvisioned === false && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">No database yet</div>
            <p className="text-[10px] text-blue-500 dark:text-blue-400 mb-2">
              Provision a PostgreSQL database for this project. A DATABASE_URL env var will be auto-configured.
            </p>
            <button
              onClick={provisionDatabase}
              disabled={!!running}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {running === 'provision-db' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3" />}
              Provision Database
            </button>
          </div>
        )}
        {dbProvisioned === true && (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
            <span className="text-xs text-green-600 dark:text-green-400">Database provisioned — DATABASE_URL is set</span>
          </div>
        )}

        {Object.entries(grouped).map(([category, cmds]) => (
          <div key={category}>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5 px-1">
              {CATEGORY_LABELS[category] || category}
            </div>
            <div className="space-y-1">
              {cmds.map(cmd => {
                const Icon = cmd.icon
                const isRunning = running === cmd.id
                const wasLast = lastCommand === cmd.id && !running

                return (
                  <button
                    key={cmd.id}
                    onClick={() => runCommand(cmd.id)}
                    disabled={!!running}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-all ${
                      isRunning
                        ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                        : wasLast && success === true
                          ? 'bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800'
                          : wasLast && success === false
                            ? 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800'
                            : 'bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-brand-300 dark:hover:border-brand-700'
                    } disabled:opacity-50`}
                  >
                    <div className={`p-1.5 rounded ${
                      isRunning ? 'bg-amber-100 dark:bg-amber-900/30' :
                      wasLast && success === true ? 'bg-green-100 dark:bg-green-900/30' :
                      wasLast && success === false ? 'bg-red-100 dark:bg-red-900/30' :
                      'bg-gray-100 dark:bg-gray-800'
                    }`}>
                      {isRunning ? (
                        <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                      ) : wasLast && success === true ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      ) : wasLast && success === false ? (
                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                      ) : (
                        <Icon className="w-3.5 h-3.5 text-gray-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-200">{cmd.label}</div>
                      <div className="text-[10px] text-gray-400 truncate">{cmd.description}</div>
                    </div>
                    {!running && (
                      <Play className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* npm Package Search */}
      <div className="flex-shrink-0 p-4 border-b border-gray-100 dark:border-gray-800">
        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5 px-1">
          npm Packages
        </div>
        <div className="flex gap-2 mb-2">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
            <input
              type="text"
              value={npmQuery}
              onChange={(e) => setNpmQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchNpm()}
              placeholder="Search npm packages..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-gray-700 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <button
            onClick={searchNpm}
            disabled={npmSearching || !npmQuery.trim()}
            className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {npmSearching ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Search'}
          </button>
        </div>
        {npmResults.length > 0 && (
          <div className="max-h-40 overflow-y-auto space-y-1">
            {npmResults.map((pkg) => (
              <div
                key={pkg.name}
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-xs"
              >
                <Package className="w-3 h-3 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-700 dark:text-gray-200 truncate">{pkg.name}</div>
                  <div className="text-[10px] text-gray-400 truncate">{pkg.description}</div>
                </div>
                <span className="text-[10px] text-gray-400 flex-shrink-0">{pkg.version}</span>
                {pkg.links?.npm && (
                  <a href={pkg.links.npm} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button
                  onClick={() => installPackage(pkg.name)}
                  disabled={!!npmInstalling}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] bg-brand-600 text-white rounded hover:bg-brand-700 disabled:opacity-50 transition-colors flex-shrink-0"
                >
                  {npmInstalling === pkg.name ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Plus className="w-2.5 h-2.5" />}
                  Install
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Output */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-1.5 flex items-center gap-2 bg-gray-950 border-b border-gray-800 flex-shrink-0">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider">Output</span>
          {success !== null && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              success ? 'text-green-400 bg-green-900/30' : 'text-red-400 bg-red-900/30'
            }`}>
              {success ? 'Success' : 'Failed'}
            </span>
          )}
        </div>
        <pre
          ref={outputRef}
          className="flex-1 overflow-y-auto p-4 text-xs font-mono text-gray-300 bg-gray-950 whitespace-pre-wrap"
        >
          {running ? (
            <span className="text-amber-400">Running command... This may take a moment.</span>
          ) : output ? (
            output
          ) : (
            <span className="text-gray-600">Click a command above to run it. Output will appear here.</span>
          )}
        </pre>
      </div>
    </div>
  )
}
