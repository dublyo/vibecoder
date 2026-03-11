'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { RoutingBadge } from '@/components/routing-badge'
import { Menu, Loader2, Download, Settings, BarChart3, BookOpen, Terminal, Share2, X, Send, Check, AlertCircle } from '@/components/icons'

interface Conversation {
  id: string
  title: string
  updatedAt: string
  project?: { id: string; name: string; emoji: string } | null
  isShared?: boolean
  sharedByName?: string | null
  ownerName?: string | null
}

interface UserData {
  id: string
  email: string
  name: string
  role: string
  creditsBalance: number
  creditsMonthlyLimit: number
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<UserData | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string; emoji: string }[]>([])
  const [routingMode, setRoutingMode] = useState('auto')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareSelected, setShareSelected] = useState<string[]>([])
  const [shareMembers, setShareMembers] = useState<{ id: string; email: string; name: string }[]>([])
  const [shareLoading, setShareLoading] = useState(false)
  const [shareResult, setShareResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const downloadRef = useRef<HTMLDivElement>(null)

  // Extract active conversation ID from URL
  const activeConversationId = pathname.startsWith('/chat/') && pathname !== '/chat'
    ? pathname.split('/chat/')[1]
    : null

  // Load user
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => {
        if (!res.ok) { router.push('/login'); return null }
        return res.json()
      })
      .then(data => { if (data) setUser(data.user) })
  }, [router])

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/conversations')
    if (res.ok) {
      const data = await res.json()
      setConversations(data.conversations)
    }
  }, [])

  const loadProjects = useCallback(async () => {
    const res = await fetch('/api/projects')
    if (res.ok) {
      const data = await res.json()
      setProjects(data.projects)
    }
  }, [])

  useEffect(() => {
    if (user) {
      loadConversations()
      loadProjects()
    }
  }, [user, loadConversations, loadProjects])

  const refreshUser = useCallback(async () => {
    const res = await fetch('/api/auth/me')
    if (res.ok) {
      const data = await res.json()
      setUser(data.user)
    }
  }, [])

  const handleNewChat = () => {
    router.push('/chat')
  }

  const handleSelectConversation = (id: string) => {
    router.push(`/chat/${id}`)
  }

  const handleDeleteConversation = async (id: string) => {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
    if (activeConversationId === id) router.push('/chat')
    loadConversations()
  }

  const handleRenameConversation = async (id: string, title: string) => {
    if (!title.trim()) return
    await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
    })
    loadConversations()
  }

  // Close download dropdown on click outside
  useEffect(() => {
    if (!downloadOpen) return
    const handler = (e: MouseEvent) => {
      if (downloadRef.current && !downloadRef.current.contains(e.target as Node)) {
        setDownloadOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [downloadOpen])

  const handleDownloadChat = async (format: 'json' | 'text') => {
    setDownloadOpen(false)
    if (!activeConversationId) return
    const res = await fetch(`/api/conversations/${activeConversationId}/download?format=${format}`)
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chat.${format === 'json' ? 'json' : 'txt'}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const loadShareMembers = useCallback(async () => {
    const res = await fetch('/api/users')
    if (res.ok) {
      const data = await res.json()
      setShareMembers(
        data.users
          .filter((u: { id: string; isActive: boolean }) => u.isActive && u.id !== user?.id)
          .map((u: { id: string; email: string; name: string }) => ({ id: u.id, email: u.email, name: u.name }))
      )
    }
  }, [user?.id])

  const handleOpenShare = () => {
    setShareOpen(true)
    setShareResult(null)
    setShareSelected([])
    loadShareMembers()
  }

  const toggleShareMember = (email: string) => {
    setShareSelected(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    )
  }

  const handleShare = async () => {
    if (!activeConversationId || shareSelected.length === 0) return
    setShareLoading(true)
    setShareResult(null)
    try {
      const res = await fetch(`/api/conversations/${activeConversationId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: shareSelected }),
      })
      const data = await res.json()
      if (!res.ok) {
        setShareResult({ type: 'error', message: data.error || 'Failed to share' })
      } else {
        setShareResult({ type: 'success', message: `Sent to ${data.sent} member(s)` })
        setTimeout(() => { setShareOpen(false); setShareSelected([]); setShareResult(null) }, 2000)
      }
    } catch {
      setShareResult({ type: 'error', message: 'Failed to share' })
    }
    setShareLoading(false)
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    )
  }

  return (
    <div className="h-screen flex bg-gray-50 dark:bg-gray-900">
      <Sidebar
        conversations={conversations}
        projects={projects}
        activeConversationId={activeConversationId}
        user={user}
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onOpenSettings={() => router.push('/settings')}
        onLogout={handleLogout}
        onNewProject={() => {}}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            {/* Mobile: open overlay sidebar */}
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            {/* Desktop: toggle sidebar collapse */}
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="hidden lg:block p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <RoutingBadge mode={routingMode} onChangeMode={setRoutingMode} />
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {activeConversationId && (
              <>
                {(user.role === 'owner' || user.role === 'admin') && (
                  <button
                    onClick={handleOpenShare}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    title="Share chat via email"
                  >
                    <Share2 className="w-4 h-4 text-gray-500" />
                  </button>
                )}
                <div className="relative" ref={downloadRef}>
                  <button
                    onClick={() => setDownloadOpen(!downloadOpen)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    title="Download chat"
                  >
                    <Download className="w-4 h-4 text-gray-500" />
                  </button>
                  {downloadOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 min-w-[100px]">
                      <button onClick={() => handleDownloadChat('json')} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg">
                        JSON
                      </button>
                      <button onClick={() => handleDownloadChat('text')} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg">
                        Text
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
            <button
              onClick={() => router.push('/skills')}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Skills"
            >
              <BookOpen className="w-4 h-4 text-gray-500" />
            </button>
            <button
              onClick={() => router.push('/mcp')}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              title="MCP Servers"
            >
              <Terminal className="w-4 h-4 text-gray-500" />
            </button>
            <button
              onClick={() => router.push('/stats')}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Usage Stats"
            >
              <BarChart3 className="w-4 h-4 text-gray-500" />
            </button>
            <button
              onClick={() => router.push('/settings')}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Settings"
            >
              <Settings className="w-4 h-4 text-gray-500" />
            </button>
            <span className="font-medium text-brand-600">{Math.round(user.creditsBalance)} credits</span>
          </div>
        </header>

        <ChatContext.Provider value={{ routingMode, userName: user?.name?.split(' ')[0] || '', loadConversations, refreshUser, router }}>
          {children}
        </ChatContext.Provider>
      </div>

      {/* Share Modal */}
      {shareOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShareOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Share Conversation</h3>
              <button onClick={() => setShareOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Select members to share this conversation with via email.
            </p>
            {shareMembers.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No other members found</p>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-1 mb-4">
                {shareMembers.map(m => (
                  <label
                    key={m.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition ${
                      shareSelected.includes(m.email)
                        ? 'bg-brand-50 dark:bg-brand-900/20 border border-brand-300 dark:border-brand-700'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-transparent'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={shareSelected.includes(m.email)}
                      onChange={() => toggleShareMember(m.email)}
                      className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{m.email}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
            {shareResult && (
              <div className={`flex items-center gap-2 text-sm mb-4 ${shareResult.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                {shareResult.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{shareResult.message}</span>
              </div>
            )}
            <button
              onClick={handleShare}
              disabled={shareLoading || shareSelected.length === 0}
              className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
            >
              {shareLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {shareLoading ? 'Sending...' : `Share with ${shareSelected.length || ''} member${shareSelected.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Shared context for chat pages
import { createContext, useContext } from 'react'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'

interface ChatContextType {
  routingMode: string
  userName: string
  loadConversations: () => Promise<void>
  refreshUser: () => Promise<void>
  router: AppRouterInstance
}

export const ChatContext = createContext<ChatContextType>({
  routingMode: 'auto',
  userName: '',
  loadConversations: async () => {},
  refreshUser: async () => {},
  router: null as unknown as AppRouterInstance,
})

export function useChatContext() {
  return useContext(ChatContext)
}
