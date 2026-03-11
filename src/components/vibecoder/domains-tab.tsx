'use client'

import { useState } from 'react'
import { Globe, Plus, ExternalLink, Shield, AlertCircle, CheckCircle2, Trash2, RefreshCw } from 'lucide-react'

interface DomainsTabProps {
  projectId: string
  projectSubdomain?: string
}

interface Domain {
  id: string
  domain: string
  status: 'pending' | 'active' | 'error'
  ssl: boolean
  primary: boolean
}

export function DomainsTab({ projectId, projectSubdomain }: DomainsTabProps) {
  const [domains, setDomains] = useState<Domain[]>([
    // Default subdomain is always present
    {
      id: 'default',
      domain: projectSubdomain || '',
      status: 'active',
      ssl: true,
      primary: true,
    },
  ])
  const [newDomain, setNewDomain] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const handleAddDomain = () => {
    if (!newDomain.trim()) return
    // Placeholder — will integrate with DNS/proxy API later
    const domain: Domain = {
      id: `custom-${Date.now()}`,
      domain: newDomain.trim().toLowerCase(),
      status: 'pending',
      ssl: false,
      primary: false,
    }
    setDomains(prev => [...prev, domain])
    setNewDomain('')
    setShowAdd(false)
  }

  const handleRemove = (id: string) => {
    if (id === 'default') return
    setDomains(prev => prev.filter(d => d.id !== id))
  }

  const statusBadge = (status: Domain['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="flex items-center gap-1 text-[10px] text-green-500 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> Active
          </span>
        )
      case 'pending':
        return (
          <span className="flex items-center gap-1 text-[10px] text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
            <RefreshCw className="w-3 h-3" /> Pending DNS
          </span>
        )
      case 'error':
        return (
          <span className="flex items-center gap-1 text-[10px] text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">
            <AlertCircle className="w-3 h-3" /> Error
          </span>
        )
    }
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <Globe className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Domains</span>
        <div className="flex-1" />
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Domain
        </button>
      </div>

      {/* Add domain form */}
      {showAdd && (
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1.5 block">
            Custom Domain
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="example.com"
              className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
              onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
            />
            <button
              onClick={handleAddDomain}
              disabled={!newDomain.trim()}
              className="px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              Add
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            Add a CNAME record pointing to <code className="text-brand-500">{projectSubdomain}</code>
          </p>
        </div>
      )}

      {/* Domain list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {domains.map((domain) => (
          <div
            key={domain.id}
            className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg"
          >
            <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-700 dark:text-gray-200 truncate">
                  {domain.domain}
                </span>
                {domain.primary && (
                  <span className="text-[10px] text-brand-500 bg-brand-50 dark:bg-brand-900/20 px-1.5 py-0.5 rounded">
                    Primary
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {domain.ssl && (
                  <span className="flex items-center gap-0.5 text-[10px] text-green-500">
                    <Shield className="w-3 h-3" /> SSL
                  </span>
                )}
              </div>
            </div>
            {statusBadge(domain.status)}
            <a
              href={`https://${domain.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            {domain.id !== 'default' && (
              <button
                onClick={() => handleRemove(domain.id)}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Info footer */}
      <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 bg-amber-50 dark:bg-amber-900/10">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-600 dark:text-amber-400">
            Custom domain management is coming soon. Currently, your project is accessible via the default subdomain.
          </p>
        </div>
      </div>
    </div>
  )
}
