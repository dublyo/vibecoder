'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { ChatPanel } from './chat-panel'
import { BrowserTab } from './browser-tab'
import { CodeTab } from './code-tab'
import { TerminalTab } from './terminal-tab'
import { EnvTab } from './env-tab'
import { BuildTab } from './build-tab'
import { LogsTab } from './logs-tab'
import { GitTab } from './git-tab'
import { DbTab } from './db-tab'
import { DomainsTab } from './domains-tab'
import { FolderTree, Code2, Terminal, Globe, PanelLeftClose, Download, GripVertical, MessageSquare, Key, Hammer, ScrollText, GitBranch, Database, Globe2 } from 'lucide-react'

interface Project {
  id: string
  name: string
  slug: string
  framework: string
  status: string
  subdomain: string
  githubRepo: string
}

interface IdeLayoutProps {
  project: Project
  onProjectUpdate: () => void
}

type RightTab = 'browser' | 'code' | 'terminal' | 'env' | 'build' | 'logs' | 'git' | 'db' | 'domains'

export function IdeLayout({ project, onProjectUpdate }: IdeLayoutProps) {
  const [showFileTree, setShowFileTree] = useState(false)
  const [activeRightTab, setActiveRightTab] = useState<RightTab>('browser')
  const [deployEvents, setDeployEvents] = useState<any[]>([])
  const [generatedFiles, setGeneratedFiles] = useState<Record<string, string>>({})
  const [isDownloading, setIsDownloading] = useState(false)
  const [chatWidth, setChatWidth] = useState(42) // percentage
  const [isResizing, setIsResizing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load source files from GitHub on mount for Sandpack preview persistence
  useEffect(() => {
    const loadSourceFiles = async () => {
      try {
        const res = await fetch(`/api/vibecoder/projects/${project.id}/source`)
        if (res.ok) {
          const data = await res.json()
          if (data.files && Object.keys(data.files).length > 0) {
            setGeneratedFiles(data.files)
          }
        }
      } catch {}
    }
    loadSourceFiles()
  }, [project.id])

  const handleDownload = useCallback(async () => {
    setIsDownloading(true)
    try {
      const res = await fetch(`/api/vibecoder/projects/${project.id}/download`)
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const cd = res.headers.get('content-disposition') || ''
      const match = cd.match(/filename="?([^";\s]+)"?/)
      const filename = match ? match[1] : `${project.name.toLowerCase().replace(/\s+/g, '-')}.zip`
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/zip' }))
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 200)
    } catch (err) {
      console.error('Download error:', err)
    } finally {
      setIsDownloading(false)
    }
  }, [project.id, project.name])

  const handlePipelineEvent = useCallback((event: any) => {
    setDeployEvents(prev => [...prev, event])
  }, [])

  const handleFilesGenerated = useCallback((files: Record<string, string>) => {
    setGeneratedFiles(prev => ({ ...prev, ...files }))
  }, [])

  // Resize handler
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)

    const startX = e.clientX
    const startWidth = chatWidth

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const containerWidth = containerRef.current.getBoundingClientRect().width
      const fileTreeWidth = showFileTree ? 200 : 0 // approximate file tree width
      const availableWidth = containerWidth - fileTreeWidth
      const deltaX = e.clientX - startX
      const deltaPercent = (deltaX / availableWidth) * 100
      const newWidth = Math.min(60, Math.max(25, startWidth + deltaPercent))
      setChatWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [chatWidth, showFileTree])

  const rightTabButtons: { id: RightTab; icon: typeof Globe; label: string }[] = [
    { id: 'browser', icon: Globe, label: 'Preview' },
    { id: 'code', icon: Code2, label: 'Code' },
    { id: 'terminal', icon: Terminal, label: 'Terminal' },
    { id: 'env', icon: Key, label: 'Env' },
    { id: 'build', icon: Hammer, label: 'Build' },
    { id: 'logs', icon: ScrollText, label: 'Logs' },
    { id: 'git', icon: GitBranch, label: 'Git' },
    { id: 'db', icon: Database, label: 'DB' },
    { id: 'domains', icon: Globe2, label: 'Domains' },
  ]

  return (
    <div ref={containerRef} className="flex-1 flex overflow-hidden">
      {/* File Tree Sidebar */}
      {showFileTree && (
        <div className="w-[200px] flex-shrink-0 border-r border-gray-200/80 dark:border-gray-800/80 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
          <div className="h-9 px-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Explorer</span>
            <button
              onClick={() => setShowFileTree(false)}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            >
              <PanelLeftClose className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
          <CodeTab projectId={project.id} mode="tree-only" />
        </div>
      )}

      {/* Chat Panel */}
      <div
        className="flex flex-col overflow-hidden border-r border-gray-200/50 dark:border-gray-800/50"
        style={{ width: `${chatWidth}%`, flexShrink: 0 }}
      >
        {/* Chat toolbar */}
        <div className="h-9 flex items-center gap-1.5 px-2.5 border-b border-gray-100 dark:border-gray-800/50 bg-white dark:bg-gray-900 flex-shrink-0">
          <button
            onClick={() => setShowFileTree(!showFileTree)}
            className={`p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
              showFileTree ? 'text-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'text-gray-400'
            }`}
            title="Toggle file tree"
          >
            {showFileTree ? <PanelLeftClose className="w-3.5 h-3.5" /> : <FolderTree className="w-3.5 h-3.5" />}
          </button>
          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <MessageSquare className="w-3 h-3" />
            <span className="font-medium">Chat</span>
          </div>
          <div className="flex-1" />
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-600 disabled:opacity-40"
            title="Download project code"
          >
            <Download className={`w-3.5 h-3.5 ${isDownloading ? 'animate-pulse' : ''}`} />
          </button>
        </div>

        <ChatPanel
          projectId={project.id}
          projectName={project.name}
          onPipelineEvent={handlePipelineEvent}
          onFilesGenerated={handleFilesGenerated}
        />
      </div>

      {/* Resize Handle */}
      <div
        className={`w-1.5 flex-shrink-0 flex items-center justify-center cursor-col-resize group transition-colors ${
          isResizing ? 'bg-brand-500/30' : 'bg-transparent hover:bg-brand-500/20'
        }`}
        onMouseDown={handleMouseDown}
      >
        <GripVertical className="w-3 h-3 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Right panel tabs */}
        <div className="h-9 flex items-center gap-0.5 px-2.5 border-b border-gray-100 dark:border-gray-800/50 bg-white dark:bg-gray-900 flex-shrink-0">
          {rightTabButtons.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveRightTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all ${
                activeRightTab === id
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 font-medium shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Right panel content */}
        <div className="flex-1 overflow-hidden bg-white dark:bg-gray-950">
          {activeRightTab === 'browser' && (
            <BrowserTab
              projectUrl={`https://${project.subdomain}`}
              projectId={project.id}
              projectStatus={project.status}
              generatedFiles={generatedFiles}
            />
          )}
          {activeRightTab === 'code' && (
            <CodeTab projectId={project.id} mode="editor" />
          )}
          {activeRightTab === 'terminal' && (
            <TerminalTab projectId={project.id} events={deployEvents} />
          )}
          {activeRightTab === 'env' && (
            <EnvTab projectId={project.id} />
          )}
          {activeRightTab === 'build' && (
            <BuildTab projectId={project.id} />
          )}
          {activeRightTab === 'logs' && (
            <LogsTab projectId={project.id} />
          )}
          {activeRightTab === 'git' && (
            <GitTab projectId={project.id} />
          )}
          {activeRightTab === 'db' && (
            <DbTab projectId={project.id} />
          )}
          {activeRightTab === 'domains' && (
            <DomainsTab projectId={project.id} projectSubdomain={project.subdomain} />
          )}
        </div>
      </div>
    </div>
  )
}
