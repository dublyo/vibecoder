'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  MessageSquare, Plus, Settings, LogOut, Moon, Sun,
  Trash2, FolderOpen, X, Crown, Shield, Users as UsersIcon,
  Pencil, Check, Search, Share2,
} from './icons'

interface Conversation {
  id: string
  title: string
  updatedAt: string
  project?: { id: string; name: string; emoji: string } | null
  isShared?: boolean
  sharedByName?: string | null
  ownerName?: string | null
}

interface Project {
  id: string
  name: string
  emoji: string
}

interface SidebarProps {
  conversations: Conversation[]
  projects: Project[]
  activeConversationId: string | null
  user: { name: string; role: string; creditsBalance: number }
  onNewChat: () => void
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
  onRenameConversation: (id: string, title: string) => void
  onOpenSettings: () => void
  onLogout: () => void
  onNewProject: () => void
  isOpen: boolean
  onClose: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export function Sidebar({
  conversations,
  projects,
  activeConversationId,
  user,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onOpenSettings,
  onLogout,
  onNewProject,
  isOpen,
  onClose,
  collapsed = false,
}: SidebarProps) {
  const [darkMode, setDarkMode] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const toggleDarkMode = () => {
    setDarkMode(!darkMode)
    document.documentElement.classList.toggle('dark')
  }

  const roleIcon = user.role === 'owner' ? <Crown className="w-3 h-3" /> :
    user.role === 'admin' ? <Shield className="w-3 h-3" /> : <UsersIcon className="w-3 h-3" />

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          'fixed lg:relative z-40 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 flex flex-col',
          // Mobile: slide in/out
          isOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: always visible, but can collapse
          collapsed ? 'lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-r-0' : 'lg:translate-x-0 lg:w-72',
          'w-72'
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="VibeCoder" className="w-8 h-8 rounded-lg" />
              <span className="font-bold text-gray-900 dark:text-white">VibeCoder</span>
            </div>
            <button onClick={onClose} className="lg:hidden p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <button
            onClick={onNewChat}
            className="w-full py-2 px-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            <span>New Chat</span>
          </button>
          {/* Search */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 border-none rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-gray-700 dark:text-gray-300 placeholder-gray-500"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600">
                <X className="w-3 h-3 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        {/* Projects */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          {projects.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Projects</span>
                <button onClick={onNewProject} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                  <Plus className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="space-y-1">
                {projects.map((project) => (
                  <div key={project.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                    <span className="text-lg">{project.emoji}</span>
                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{project.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conversations */}
          <div>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2 block">
              Conversations
            </span>
            <div className="space-y-1">
              {conversations.filter(c => !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase())).map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => editingId !== conv.id && onSelectConversation(conv.id)}
                  className={cn(
                    'group p-2 rounded-lg cursor-pointer flex items-center justify-between',
                    activeConversationId === conv.id
                      ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    {editingId === conv.id ? (
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onRenameConversation(conv.id, editTitle)
                            setEditingId(null)
                          }
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        onBlur={() => {
                          if (editTitle.trim()) onRenameConversation(conv.id, editTitle)
                          setEditingId(null)
                        }}
                        className="text-sm w-full bg-transparent border border-brand-400 rounded px-1 py-0.5 outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <p className="text-sm truncate">{conv.title}</p>
                        {conv.isShared && (
                          <p className="text-[10px] text-brand-500 flex items-center gap-1 mt-0.5">
                            <Share2 className="w-2.5 h-2.5" />
                            Shared by {conv.sharedByName || conv.ownerName || 'admin'}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                    {editingId === conv.id ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onRenameConversation(conv.id, editTitle); setEditingId(null) }}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        <Check className="w-3.5 h-3.5 text-green-500" />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingId(conv.id); setEditTitle(conv.title) }}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        <Pencil className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteConversation(conv.id) }}
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                  </div>
                </div>
              ))}
              {conversations.filter(c => !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                  {searchQuery ? 'No matching chats' : 'No conversations yet'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              {roleIcon}
              <span>{user.name}</span>
            </div>
            <span className="ml-auto text-xs font-medium text-brand-600">
              {Math.round(user.creditsBalance)} credits
            </span>
          </div>
          <div className="flex items-center justify-between">
            <button onClick={toggleDarkMode} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={onOpenSettings} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <Settings className="w-4 h-4" />
            </button>
            <button onClick={onLogout} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
