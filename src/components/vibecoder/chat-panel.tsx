'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Sparkles, Bug, Play, Rocket, FileCode2, ChevronDown, ChevronRight, Check, Zap, Bot, User, Brain } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ThinkingDisplay, type ThinkingPhase } from './thinking-display'

/** Strip large code blocks from AI response, returning just the explanation */
function stripFileBlocks(text: string): string {
  // Remove ```file:path/to/file\n...\n``` blocks
  let cleaned = text.replace(/```(?:file:)?[\w\/\.\-]+\n[\s\S]*?```/g, '')
  // Also remove large generic code blocks (>500 chars) that are likely full file dumps
  cleaned = cleaned.replace(/```(?:tsx?|jsx?|html|css|json|js|ts)?\n([\s\S]{500,}?)```/g, '')
  // Remove consecutive blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  cleaned = cleaned.trim()
  // If the cleaned text is still very long (>1500 chars), it likely contains
  // inline code dumps — truncate to keep chat readable
  if (cleaned.length > 1500) {
    // Find a good cutoff point (end of a sentence/paragraph)
    const cutoff = cleaned.lastIndexOf('\n', 1200)
    cleaned = cleaned.substring(0, cutoff > 600 ? cutoff : 1200) + '\n\n*...code changes applied*'
  }
  return cleaned
}

/** Extract file paths from filesChanged JSON string */
function parseFilesChanged(filesChanged?: string): string[] {
  if (!filesChanged) return []
  try { return JSON.parse(filesChanged) } catch { return [] }
}

interface Message {
  id: string
  role: string
  content: string
  tierUsed?: string
  modelUsed?: string
  creditsCost?: number
  filesChanged?: string
  createdAt: string
}

interface ChatPanelProps {
  projectId: string
  projectName: string
  onPipelineEvent: (event: any) => void
  onFilesGenerated?: (files: Record<string, string>) => void
}

/** Compact card showing which files were changed */
function FileChangesCard({ files, tier, model, credits }: {
  files: string[]
  tier?: string
  model?: string
  credits?: number
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-lg border border-emerald-200/50 dark:border-emerald-800/30 bg-emerald-50/50 dark:bg-emerald-950/20 overflow-hidden text-xs mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/20 transition-colors"
      >
        <div className="w-5 h-5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
        </div>
        <span className="font-medium text-emerald-700 dark:text-emerald-300">{files.length} file{files.length !== 1 ? 's' : ''} updated</span>
        <div className="flex-1" />
        {tier && (
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${
            tier === 'maestro'
              ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
              : 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400'
          }`}>
            {tier}
          </span>
        )}
        {credits !== undefined && credits > 0 && (
          <span className="flex items-center gap-0.5 text-gray-400 dark:text-gray-500 tabular-nums">
            <Zap className="w-3 h-3" />
            {credits.toFixed(1)}
          </span>
        )}
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
      </button>
      {expanded && (
        <div className="border-t border-emerald-200/30 dark:border-emerald-800/20 px-3 py-2 space-y-1">
          {files.map((f) => (
            <div key={f} className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
              <FileCode2 className="w-3 h-3 text-brand-500 flex-shrink-0" />
              <span className="truncate font-mono text-[11px]">{f}</span>
            </div>
          ))}
          {model && (
            <div className="pt-1 mt-1 border-t border-emerald-200/30 dark:border-emerald-800/20 text-gray-400 dark:text-gray-500 text-[10px]">
              Model: {model.split('/')[1]}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const PHASE_LABELS: Record<string, string> = {
  classifying: 'Analyzing request',
  selecting_files: 'Selecting relevant files',
  code_research: 'Analyzing existing codebase',
  researching: 'Researching best practices',
  planning: 'Planning changes',
  generating: 'Generating code',
  committing: 'Committing to GitHub',
  building: 'Verifying build',
  fixing: 'Fixing errors',
}

export function ChatPanel({ projectId, projectName, onPipelineEvent, onFilesGenerated }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [pipelineStatus, setPipelineStatus] = useState('')
  const [thinkingPhases, setThinkingPhases] = useState<ThinkingPhase[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Fetch messages on project change
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/vibecoder/projects/${projectId}`)
        if (res.ok) {
          const data = await res.json()
          setMessages(data.recentMessages || [])
        }
      } catch {}
    }
    fetchMessages()
    setInput('')
    setStreamingContent('')
  }, [projectId])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent, thinkingPhases])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return

    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsStreaming(true)
    setStreamingContent('')
    setPipelineStatus('Classifying...')
    setThinkingPhases([])

    try {
      const res = await fetch(`/api/vibecoder/projects/${projectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to send message')
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            onPipelineEvent(event)

            switch (event.event) {
              // ── New granular phase events ──
              case 'phase_start': {
                const phaseId = event.data.phase
                setThinkingPhases(prev => {
                  // Mark previous active phases as complete
                  const updated = prev.map(p => p.status === 'active' ? { ...p, status: 'complete' as const } : p)
                  // Add new active phase
                  return [...updated, {
                    id: phaseId,
                    label: event.data.description || PHASE_LABELS[phaseId] || phaseId,
                    status: 'active' as const,
                  }]
                })
                break
              }
              case 'phase_complete': {
                const phaseId = event.data.phase
                setThinkingPhases(prev =>
                  prev.map(p => p.id === phaseId ? { ...p, status: 'complete' as const, durationMs: event.data.durationMs } : p)
                )
                break
              }
              case 'thinking_detail': {
                const phaseId = event.data.phase
                setThinkingPhases(prev =>
                  prev.map(p => p.id === phaseId ? { ...p, detail: event.data.detail } : p)
                )
                break
              }
              case 'file_generated': {
                // Incrementally update preview as each file arrives
                if (onFilesGenerated) {
                  onFilesGenerated({ [event.data.path]: event.data.content })
                }
                // Add file to the generating phase
                setThinkingPhases(prev =>
                  prev.map(p => p.id === 'generating' ? {
                    ...p,
                    files: [...(p.files || []), { path: event.data.path, index: event.data.index, total: event.data.total }],
                  } : p)
                )
                break
              }

              // ── Existing events (kept for backward compat) ──
              case 'ai_classifying':
                setPipelineStatus('Classifying complexity...')
                break
              case 'ai_classified':
                setPipelineStatus(`Using ${event.data.tier} pipeline`)
                break
              case 'ai_thinking':
                setPipelineStatus(event.data.phase === 'maestro_planning'
                  ? 'Maestro planning...'
                  : event.data.phase === 'maestro_executing'
                  ? 'Maestro implementing...'
                  : 'Thinking...')
                break
              case 'ai_complete':
                setPipelineStatus(`Done — ${event.data.filesChanged?.length || 0} files changed`)
                break
              case 'git_committing':
                setPipelineStatus('Committing to GitHub...')
                break
              case 'git_pushed':
                setPipelineStatus('Pushed to GitHub')
                break
              case 'done':
                setStreamingContent('')
                setMessages(prev => [...prev, {
                  id: event.data.messageId,
                  role: 'assistant',
                  content: event.data.response,
                  tierUsed: event.data.tier,
                  modelUsed: event.data.model,
                  creditsCost: event.data.creditsCost,
                  filesChanged: JSON.stringify(event.data.filesChanged),
                  createdAt: new Date().toISOString(),
                }])
                // Final file contents (full set) for preview
                if (event.data.fileContents && onFilesGenerated) {
                  onFilesGenerated(event.data.fileContents)
                }
                break
              case 'ralph_loop_started':
                setPipelineStatus('Ralph Loop: monitoring build...')
                setThinkingPhases(prev => [...prev, { id: 'building', label: 'Verifying build...', status: 'active' }])
                break
              case 'auto_fix_attempt':
                setPipelineStatus(`Ralph Loop: fix attempt ${event.data.attempt}/${event.data.maxAttempts}`)
                setThinkingPhases(prev => {
                  const updated = prev.map(p => p.status === 'active' ? { ...p, status: 'complete' as const } : p)
                  return [...updated, { id: `fixing-${event.data.attempt}`, label: `Fix attempt ${event.data.attempt}/${event.data.maxAttempts}`, status: 'active' as const }]
                })
                break
              case 'ralph_loop_complete':
                if (event.data.success) {
                  setPipelineStatus(`Build fixed after ${event.data.attempts} attempt(s)`)
                } else {
                  setPipelineStatus('')
                }
                setThinkingPhases(prev => prev.map(p => p.status === 'active' ? { ...p, status: 'complete' as const } : p))
                break
              case 'ralph_fix_files':
                if (event.data.fileContents && onFilesGenerated) {
                  onFilesGenerated(event.data.fileContents)
                }
                break
              case 'build_started':
                setPipelineStatus('Building...')
                break
              case 'build_passed':
                setPipelineStatus('Build passed')
                break
              case 'build_failed':
                setPipelineStatus('Build failed — attempting fix...')
                break
              case 'plan_generated':
                // Insert plan as a special message in the chat
                setMessages(prev => [...prev, {
                  id: `plan-${Date.now()}`,
                  role: 'plan',
                  content: event.data.plan,
                  createdAt: new Date().toISOString(),
                }])
                break
              case 'error':
                setMessages(prev => [...prev, {
                  id: `err-${Date.now()}`,
                  role: 'error',
                  content: event.data.message,
                  createdAt: new Date().toISOString(),
                }])
                break
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'error',
        content: err.message || 'Something went wrong',
        createdAt: new Date().toISOString(),
      }])
    } finally {
      setIsStreaming(false)
      setPipelineStatus('')
      setThinkingPhases([])
    }
  }, [projectId, isStreaming, onPipelineEvent, onFilesGenerated])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleDeploy = useCallback(async () => {
    if (isStreaming) return
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: 'Deploy project',
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setIsStreaming(true)
    try {
      const res = await fetch(`/api/vibecoder/projects/${projectId}/deploy`, { method: 'POST' })
      const data = await res.json()
      const aiMsg: Message = {
        id: `deploy-${Date.now()}`,
        role: 'assistant',
        content: res.ok
          ? `Deployment triggered! ${data.message || 'GitHub Actions will build and deploy your project.'}`
          : `Deploy failed: ${data.error || 'Unknown error'}`,
        createdAt: new Date().toISOString(),
      }
      setMessages(prev => [...prev, aiMsg])
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'error',
        content: `Deploy error: ${err.message}`,
        createdAt: new Date().toISOString(),
      }])
    } finally {
      setIsStreaming(false)
    }
  }, [projectId, isStreaming])

  const quickActions = [
    { label: 'Polish', icon: Sparkles, prompt: 'Review the codebase and improve code quality, fix anti-patterns, optimize performance' },
    { label: 'Fix', icon: Bug, prompt: 'Check for console errors and runtime issues, then fix them. IMPORTANT: Ignore errors from the Sandpack browser preview related to next-auth, openid-client, crypto, or Node.js server-only modules — those are Sandpack limitations (browser sandbox cannot run server-side code) and are NOT real bugs. Focus only on actual code bugs, UI issues, and build errors.' },
    { label: 'Test', icon: Play, prompt: 'Run Playwright tests on the live site and report results' },
    { label: 'Deploy', icon: Rocket, prompt: '__deploy__' },
  ]

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full py-12 px-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center mb-4 shadow-lg shadow-brand-500/20">
              <Bot className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
              {projectName}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 text-center max-w-[240px]">
              Describe what you want to build and AI will write the code.
            </p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-[280px]">
              {quickActions.map(({ label, icon: Icon, prompt }) => (
                <button
                  key={label}
                  onClick={() => prompt === '__deploy__' ? handleDeploy() : sendMessage(prompt)}
                  className="flex items-center gap-2 px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-sm transition-all"
                >
                  <Icon className="w-3.5 h-3.5 text-brand-500" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} animate-in`}>
            {/* Avatar */}
            {msg.role === 'user' ? (
              <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                <User className="w-3.5 h-3.5 text-white" />
              </div>
            ) : msg.role === 'error' ? null : msg.role === 'plan' ? (
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Brain className="w-3.5 h-3.5 text-white" />
              </div>
            ) : (
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 dark:from-gray-600 dark:to-gray-800 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
            )}

            {/* Message content */}
            {msg.role === 'user' ? (
              <div className="max-w-[80%] rounded-2xl rounded-tr-md px-3.5 py-2.5 text-sm bg-brand-500 text-white shadow-sm">
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </div>
            ) : msg.role === 'error' ? (
              <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 ml-9">
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            ) : msg.role === 'plan' ? (
              <div className="max-w-[90%] min-w-0">
                <div className="rounded-2xl rounded-tl-md px-4 py-3 text-sm bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 border border-violet-200 dark:border-violet-800/50 shadow-sm">
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-violet-200 dark:border-violet-800/30">
                    <div className="w-6 h-6 rounded-lg bg-violet-500 flex items-center justify-center">
                      <Brain className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">Project Plan</span>
                    <span className="text-[10px] text-violet-400 ml-auto">AI-generated after research</span>
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-li:my-0.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-headings:my-2 prose-headings:text-violet-800 dark:prose-headings:text-violet-200 prose-code:text-xs prose-code:bg-violet-100 prose-code:dark:bg-violet-900/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-strong:text-violet-800 dark:prose-strong:text-violet-200">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-[85%] min-w-0">
                <div className="rounded-2xl rounded-tl-md px-3.5 py-2.5 text-sm bg-white dark:bg-gray-800/80 text-gray-800 dark:text-gray-200 shadow-sm border border-gray-100 dark:border-gray-700/50">
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-li:my-0.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-headings:my-2 prose-code:text-xs prose-code:bg-gray-100 prose-code:dark:bg-gray-700 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        // Truncate long inline code blocks that leaked through
                        code: ({ children, className, ...props }) => {
                          const text = String(children || '')
                          if (!className && text.length > 120) {
                            return <code {...props}>{text.substring(0, 80)}…</code>
                          }
                          return <code className={className} {...props}>{children}</code>
                        },
                        // Truncate long pre blocks
                        pre: ({ children, ...props }) => {
                          const text = String((children as any)?.props?.children || '')
                          if (text.length > 500) return null
                          return <pre {...props}>{children}</pre>
                        },
                      }}
                    >{stripFileBlocks(msg.content)}</ReactMarkdown>
                  </div>
                </div>

                {/* File changes card */}
                {msg.filesChanged && parseFilesChanged(msg.filesChanged).length > 0 && (
                  <FileChangesCard
                    files={parseFilesChanged(msg.filesChanged)}
                    tier={msg.tierUsed}
                    model={msg.modelUsed}
                    credits={msg.creditsCost}
                  />
                )}
              </div>
            )}
          </div>
        ))}

        {/* Thinking display */}
        {isStreaming && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm animate-pulse">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <ThinkingDisplay phases={thinkingPhases} pipelineStatus={pipelineStatus} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions bar */}
      {messages.length > 0 && !isStreaming && (
        <div className="px-3 pb-1.5 flex gap-1.5 flex-wrap">
          {quickActions.map(({ label, icon: Icon, prompt }) => (
            <button
              key={label}
              onClick={() => prompt === '__deploy__' ? handleDeploy() : sendMessage(prompt)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-brand-300 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-400 transition-all"
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-gray-100 dark:border-gray-800/50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
        <div className={`flex items-end gap-2 rounded-xl border px-3 py-2 transition-all ${
          input.trim()
            ? 'border-brand-300 dark:border-brand-700 shadow-sm shadow-brand-500/5'
            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
        }`}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              // Auto-resize
              const el = e.target
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 120) + 'px'
            }}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to build..."
            className="flex-1 bg-transparent resize-none text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none min-h-[36px] max-h-[120px] leading-relaxed"
            rows={1}
            disabled={isStreaming}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isStreaming}
            className={`p-2 rounded-lg transition-all flex-shrink-0 ${
              input.trim() && !isStreaming
                ? 'bg-brand-500 text-white shadow-sm hover:bg-brand-600 hover:shadow-md'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center mt-1.5">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
