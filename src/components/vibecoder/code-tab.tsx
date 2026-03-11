'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  File, Folder, FolderOpen, ChevronRight, ChevronDown, Save, Loader2, X,
  Plus, Trash2, FilePlus, FolderPlus, MoreHorizontal
} from 'lucide-react'

// CodeMirror imports
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { bracketMatching, foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'

interface FileNode {
  path: string
  type: 'file' | 'dir'
  size?: number
}

interface OpenFile {
  path: string
  content: string
  sha: string
  isDirty: boolean
  originalContent: string
}

interface CodeTabProps {
  projectId: string
  mode: 'editor' | 'tree-only'
  onFileSelect?: (path: string) => void
}

// Language detection by file extension
function getLanguageExtension(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'ts': case 'tsx': return javascript({ jsx: true, typescript: true })
    case 'js': case 'jsx': return javascript({ jsx: true })
    case 'html': return html()
    case 'css': case 'scss': return css()
    case 'json': return json()
    case 'md': case 'mdx': return markdown()
    default: return javascript()
  }
}

// File icon component using Lucide icons with color
function FileIcon({ path }: { path: string }) {
  const name = path.split('/').pop()?.toLowerCase() || ''
  const ext = name.split('.').pop() || ''

  let color = 'text-gray-400'
  if (['ts', 'tsx'].includes(ext)) color = 'text-blue-400'
  else if (['js', 'jsx'].includes(ext)) color = 'text-yellow-400'
  else if (['css', 'scss'].includes(ext)) color = 'text-pink-400'
  else if (['html'].includes(ext)) color = 'text-orange-400'
  else if (['json'].includes(ext)) color = 'text-green-400'
  else if (['md', 'mdx'].includes(ext)) color = 'text-gray-300'
  else if (['prisma'].includes(ext)) color = 'text-indigo-400'
  else if (['sql'].includes(ext)) color = 'text-cyan-400'
  else if (['env'].includes(ext) || name.startsWith('.env')) color = 'text-yellow-600'
  else if (name === 'dockerfile' || name.startsWith('docker')) color = 'text-sky-400'
  else if (name === '.gitignore') color = 'text-gray-500'
  else if (['png', 'jpg', 'svg', 'ico', 'gif', 'webp'].includes(ext)) color = 'text-purple-400'

  return <File className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
}

function buildTree(files: FileNode[]): Map<string, FileNode[]> {
  const tree = new Map<string, FileNode[]>()
  for (const file of files) {
    const parts = file.path.split('/')
    const parent = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
    if (!tree.has(parent)) tree.set(parent, [])
    tree.get(parent)!.push(file)
  }
  return tree
}

// Context menu component
function ContextMenu({ x, y, items, onClose }: {
  x: number
  y: number
  items: { label: string; icon?: typeof Plus; danger?: boolean; onClick: () => void }[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 min-w-[160px]"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.onClick(); onClose() }}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 ${
            item.danger ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'
          }`}
        >
          {item.icon && <item.icon className="w-3.5 h-3.5" />}
          {item.label}
        </button>
      ))}
    </div>
  )
}

// Inline input for new file/folder creation
function InlineInput({ depth, onSubmit, onCancel, placeholder }: {
  depth: number
  onSubmit: (name: string) => void
  onCancel: () => void
  placeholder: string
}) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  return (
    <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 12 + 20}px` }}>
      <input
        ref={ref}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && value.trim()) onSubmit(value.trim())
          if (e.key === 'Escape') onCancel()
        }}
        onBlur={onCancel}
        className="flex-1 bg-brand-50 dark:bg-brand-900/20 border border-brand-300 dark:border-brand-700 rounded px-1.5 py-0.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
        placeholder={placeholder}
      />
    </div>
  )
}

function FileTreeNode({
  node,
  tree,
  depth,
  expandedDirs,
  toggleDir,
  onFileClick,
  selectedFile,
  onContextMenu,
  creatingIn,
  creatingType,
  onCreateSubmit,
  onCreateCancel,
}: {
  node: FileNode
  tree: Map<string, FileNode[]>
  depth: number
  expandedDirs: Set<string>
  toggleDir: (path: string) => void
  onFileClick: (path: string) => void
  selectedFile: string | null
  onContextMenu: (e: React.MouseEvent, path: string, type: 'file' | 'dir') => void
  creatingIn: string | null
  creatingType: 'file' | 'dir' | null
  onCreateSubmit: (name: string) => void
  onCreateCancel: () => void
}) {
  const name = node.path.split('/').pop() || node.path
  const isExpanded = expandedDirs.has(node.path)
  const children = tree.get(node.path) || []

  if (node.type === 'dir') {
    return (
      <div>
        <button
          onClick={() => toggleDir(node.path)}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, node.path, 'dir') }}
          className={`flex items-center gap-1 w-full px-2 py-[3px] text-xs transition-colors ${
            'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isExpanded ? <ChevronDown className="w-3 h-3 flex-shrink-0 text-gray-400" /> : <ChevronRight className="w-3 h-3 flex-shrink-0 text-gray-400" />}
          {isExpanded
            ? <FolderOpen className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
            : <Folder className="w-3.5 h-3.5 text-yellow-500/70 flex-shrink-0" />
          }
          <span className="truncate font-medium">{name}</span>
          <span className="ml-auto text-[9px] text-gray-400 tabular-nums">{children.length}</span>
        </button>
        {isExpanded && (
          <>
            {creatingIn === node.path && creatingType && (
              <InlineInput
                depth={depth + 1}
                onSubmit={onCreateSubmit}
                onCancel={onCreateCancel}
                placeholder={creatingType === 'file' ? 'filename.tsx' : 'folder-name'}
              />
            )}
            {children
              .sort((a, b) => {
                if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
                return a.path.localeCompare(b.path)
              })
              .map(child => (
                <FileTreeNode
                  key={child.path}
                  node={child}
                  tree={tree}
                  depth={depth + 1}
                  expandedDirs={expandedDirs}
                  toggleDir={toggleDir}
                  onFileClick={onFileClick}
                  selectedFile={selectedFile}
                  onContextMenu={onContextMenu}
                  creatingIn={creatingIn}
                  creatingType={creatingType}
                  onCreateSubmit={onCreateSubmit}
                  onCreateCancel={onCreateCancel}
                />
              ))}
          </>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => onFileClick(node.path)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, node.path, 'file') }}
      className={`flex items-center gap-1.5 w-full px-2 py-[3px] text-xs truncate transition-colors ${
        selectedFile === node.path
          ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 font-medium'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      <FileIcon path={node.path} />
      <span className="truncate">{name}</span>
      {node.size !== undefined && node.size > 0 && (
        <span className="ml-auto text-[9px] text-gray-400 tabular-nums">
          {node.size < 1024 ? `${node.size}B` : `${(node.size / 1024).toFixed(1)}K`}
        </span>
      )}
    </button>
  )
}

// CodeMirror Editor component
function CodeMirrorEditor({
  content,
  filePath,
  onChange,
  onSave,
}: {
  content: string
  filePath: string
  onChange: (value: string) => void
  onSave: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const languageCompartment = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)

  onChangeRef.current = onChange
  onSaveRef.current = onSave

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return

    const lang = getLanguageExtension(filePath)
    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        highlightSelectionMatches(),
        foldGutter(),
        history(),
        languageCompartment.current.of(lang),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        oneDark,
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...closeBracketsKeymap,
          ...searchKeymap,
          indentWithTab,
          {
            key: 'Mod-s',
            run: () => { onSaveRef.current(); return true },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '12px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace' },
          '.cm-gutters': { backgroundColor: '#1a1b26', borderRight: '1px solid #2a2b3d' },
          '.cm-activeLineGutter': { backgroundColor: '#2a2b3d' },
        }),
        EditorState.tabSize.of(2),
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    return () => { view.destroy(); viewRef.current = null }
  }, [filePath]) // Re-create on file change

  // Update content when it changes externally (e.g., after save)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentContent = view.state.doc.toString()
    if (currentContent !== content) {
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: content },
      })
    }
  }, [content])

  return <div ref={containerRef} className="h-full w-full" />
}

export function CodeTab({ projectId, mode, onFileSelect }: CodeTabProps) {
  const [files, setFiles] = useState<FileNode[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [isLoadingTree, setIsLoadingTree] = useState(true)
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; type: 'file' | 'dir' } | null>(null)
  const [creatingIn, setCreatingIn] = useState<string | null>(null)
  const [creatingType, setCreatingType] = useState<'file' | 'dir' | null>(null)

  // Fetch file tree
  useEffect(() => {
    const fetchTree = async () => {
      setIsLoadingTree(true)
      try {
        const res = await fetch(`/api/vibecoder/projects/${projectId}/files`)
        if (res.ok) {
          const data = await res.json()
          setFiles(data.tree || [])
          const dirs = new Set<string>()
          ;(data.tree || []).forEach((f: FileNode) => {
            if (f.type === 'dir' && (f.path === 'src' || f.path === 'app' || f.path === 'src/app')) {
              dirs.add(f.path)
            }
          })
          setExpandedDirs(dirs)
        }
      } catch {} finally {
        setIsLoadingTree(false)
      }
    }
    fetchTree()
  }, [projectId])

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const openFile = useCallback(async (path: string) => {
    onFileSelect?.(path)
    if (mode === 'tree-only') return

    const existing = openFiles.find(f => f.path === path)
    if (existing) {
      setActiveFile(path)
      return
    }

    setIsLoadingFile(true)
    try {
      const res = await fetch(`/api/vibecoder/projects/${projectId}/files?path=${encodeURIComponent(path)}`)
      if (res.ok) {
        const data = await res.json()
        setOpenFiles(prev => [...prev, {
          path,
          content: data.content,
          sha: data.sha,
          isDirty: false,
          originalContent: data.content,
        }])
        setActiveFile(path)
      }
    } catch {} finally {
      setIsLoadingFile(false)
    }
  }, [projectId, mode, openFiles, onFileSelect])

  const closeFile = useCallback((path: string) => {
    setOpenFiles(prev => {
      const next = prev.filter(f => f.path !== path)
      if (activeFile === path) {
        setActiveFile(next.length > 0 ? next[next.length - 1].path : null)
      }
      return next
    })
  }, [activeFile])

  const updateFileContent = useCallback((path: string, content: string) => {
    setOpenFiles(prev => prev.map(f =>
      f.path === path
        ? { ...f, content, isDirty: content !== f.originalContent }
        : f
    ))
  }, [])

  const saveFile = useCallback(async (path: string) => {
    const file = openFiles.find(f => f.path === path)
    if (!file || !file.isDirty) return

    setIsSaving(true)
    setSaveStatus('Committing...')
    try {
      const res = await fetch(`/api/vibecoder/projects/${projectId}/files`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          content: file.content,
          sha: file.sha,
          commitMessage: `Update ${path.split('/').pop()}`,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setOpenFiles(prev => prev.map(f =>
          f.path === path
            ? { ...f, sha: data.commit?.sha || f.sha, isDirty: false, originalContent: f.content }
            : f
        ))
        setSaveStatus('Committed! Deploying...')
        // Auto-trigger deploy after save
        try {
          await fetch(`/api/vibecoder/projects/${projectId}/deploy`, { method: 'POST' })
          setSaveStatus('Deploy triggered!')
        } catch {
          setSaveStatus('Saved (deploy failed)')
        }
        setTimeout(() => setSaveStatus(''), 3000)
      } else {
        setSaveStatus('Save failed')
      }
    } catch {
      setSaveStatus('Save failed')
    } finally {
      setIsSaving(false)
    }
  }, [projectId, openFiles])

  // Create new file
  const createFile = useCallback(async (name: string) => {
    if (!creatingIn && creatingIn !== '') return
    const parentPath = creatingIn
    const fullPath = parentPath ? `${parentPath}/${name}` : name

    try {
      const res = await fetch(`/api/vibecoder/projects/${projectId}/files`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: fullPath,
          content: creatingType === 'dir' ? '' : getDefaultContent(name),
          sha: null,
          commitMessage: `Create ${name}`,
        }),
      })
      if (res.ok) {
        // Refresh file tree
        const treeRes = await fetch(`/api/vibecoder/projects/${projectId}/files`)
        if (treeRes.ok) {
          const data = await treeRes.json()
          setFiles(data.tree || [])
        }
        // Open the new file if it's a file
        if (creatingType === 'file') {
          openFile(fullPath)
        }
      }
    } catch {}
    setCreatingIn(null)
    setCreatingType(null)
  }, [projectId, creatingIn, creatingType, openFile])

  // Delete file
  const deleteFile = useCallback(async (path: string) => {
    if (!confirm(`Delete ${path}?`)) return
    try {
      const res = await fetch(`/api/vibecoder/projects/${projectId}/files?path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        closeFile(path)
        const treeRes = await fetch(`/api/vibecoder/projects/${projectId}/files`)
        if (treeRes.ok) {
          const data = await treeRes.json()
          setFiles(data.tree || [])
        }
      }
    } catch {}
  }, [projectId, closeFile])

  // Context menu handler
  const handleContextMenu = useCallback((e: React.MouseEvent, path: string, type: 'file' | 'dir') => {
    setContextMenu({ x: e.clientX, y: e.clientY, path, type })
  }, [])

  const tree = useMemo(() => buildTree(files), [files])
  const rootNodes = useMemo(() =>
    (tree.get('') || []).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.path.localeCompare(b.path)
    }),
    [tree]
  )

  const activeFileData = openFiles.find(f => f.path === activeFile)
  const fileCount = files.filter(f => f.type === 'file').length
  const dirCount = files.filter(f => f.type === 'dir').length

  if (isLoadingTree) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    )
  }

  // Tree-only mode for sidebar
  if (mode === 'tree-only') {
    return (
      <div className="py-1">
        {rootNodes.map(node => (
          <FileTreeNode
            key={node.path}
            node={node}
            tree={tree}
            depth={0}
            expandedDirs={expandedDirs}
            toggleDir={toggleDir}
            onFileClick={openFile}
            selectedFile={activeFile}
            onContextMenu={() => {}}
            creatingIn={null}
            creatingType={null}
            onCreateSubmit={() => {}}
            onCreateCancel={() => {}}
          />
        ))}
      </div>
    )
  }

  // Full editor mode
  return (
    <div className="h-full flex">
      {/* File tree sidebar */}
      <div className="w-56 border-r border-gray-200 dark:border-gray-800 overflow-y-auto bg-white dark:bg-gray-900 flex-shrink-0 scrollbar-thin">
        {/* Tree header */}
        <div className="px-2.5 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Explorer</span>
            <span className="text-[9px] text-gray-400 tabular-nums">
              {fileCount} files
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => { setCreatingIn(''); setCreatingType('file'); }}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              title="New File"
            >
              <FilePlus className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
            </button>
            <button
              onClick={() => { setCreatingIn(''); setCreatingType('dir'); }}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              title="New Folder"
            >
              <FolderPlus className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
            </button>
          </div>
        </div>

        {/* Creating at root level */}
        {creatingIn === '' && creatingType && (
          <InlineInput
            depth={0}
            onSubmit={createFile}
            onCancel={() => { setCreatingIn(null); setCreatingType(null) }}
            placeholder={creatingType === 'file' ? 'filename.tsx' : 'folder-name'}
          />
        )}

        {/* File tree */}
        <div className="py-0.5">
          {rootNodes.map(node => (
            <FileTreeNode
              key={node.path}
              node={node}
              tree={tree}
              depth={0}
              expandedDirs={expandedDirs}
              toggleDir={toggleDir}
              onFileClick={openFile}
              selectedFile={activeFile}
              onContextMenu={handleContextMenu}
              creatingIn={creatingIn}
              creatingType={creatingType}
              onCreateSubmit={createFile}
              onCreateCancel={() => { setCreatingIn(null); setCreatingType(null) }}
            />
          ))}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Open file tabs */}
        {openFiles.length > 0 && (
          <div className="flex items-center bg-gray-50 dark:bg-[#1a1b26] border-b border-gray-200 dark:border-gray-800 overflow-x-auto scrollbar-thin flex-shrink-0">
            {openFiles.map(f => {
              const name = f.path.split('/').pop() || f.path
              const isActive = activeFile === f.path
              return (
                <div
                  key={f.path}
                  onClick={() => setActiveFile(f.path)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r border-gray-200 dark:border-gray-800 flex-shrink-0 transition-colors ${
                    isActive
                      ? 'bg-white dark:bg-[#1e1f2e] text-gray-900 dark:text-white border-b-2 border-b-brand-500'
                      : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <FileIcon path={f.path} />
                  <span className="truncate max-w-[120px]">{name}</span>
                  {f.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />}
                  <button
                    onClick={(e) => { e.stopPropagation(); closeFile(f.path) }}
                    className="ml-1 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded opacity-50 hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )
            })}
            {/* Save status / breadcrumb */}
            <div className="ml-auto flex items-center gap-2 px-3 py-1.5">
              {activeFile && (
                <span className="text-[10px] text-gray-400 font-mono truncate max-w-[200px]">
                  {activeFile}
                </span>
              )}
              {saveStatus && (
                <span className="text-[10px] text-gray-400 flex items-center gap-1 flex-shrink-0">
                  {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                  {saveStatus}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Editor content */}
        {activeFileData ? (
          <div className="flex-1 overflow-hidden bg-[#1a1b26]">
            <CodeMirrorEditor
              key={activeFile!}
              content={activeFileData.content}
              filePath={activeFile!}
              onChange={(value) => updateFileContent(activeFile!, value)}
              onSave={() => saveFile(activeFile!)}
            />
          </div>
        ) : isLoadingFile ? (
          <div className="flex-1 flex items-center justify-center bg-gray-950">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 bg-gray-950">
            <div className="text-center">
              <File className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Select a file to edit</p>
              <p className="text-xs text-gray-600 mt-1">⌘S to save · Right-click for options</p>
            </div>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            ...(contextMenu.type === 'dir' ? [
              {
                label: 'New File',
                icon: FilePlus,
                onClick: () => {
                  setCreatingIn(contextMenu.path)
                  setCreatingType('file')
                  setExpandedDirs(prev => new Set(prev).add(contextMenu.path))
                },
              },
              {
                label: 'New Folder',
                icon: FolderPlus,
                onClick: () => {
                  setCreatingIn(contextMenu.path)
                  setCreatingType('dir')
                  setExpandedDirs(prev => new Set(prev).add(contextMenu.path))
                },
              },
            ] : []),
            {
              label: 'Delete',
              icon: Trash2,
              danger: true,
              onClick: () => deleteFile(contextMenu.path),
            },
          ]}
        />
      )}
    </div>
  )
}

function getDefaultContent(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'tsx': return `import React from 'react'\n\nexport default function Component() {\n  return (\n    <div>\n      <h1>New Component</h1>\n    </div>\n  )\n}\n`
    case 'ts': return `export {}\n`
    case 'css': return `/* ${filename} */\n`
    case 'json': return `{}\n`
    case 'md': return `# ${filename.replace(/\.md$/, '')}\n`
    default: return ''
  }
}
