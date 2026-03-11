'use client'

import React, { useState, useRef, useEffect, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import {
  ArrowLeft, Send, Loader2, BookOpen, Bot, User,
  Copy, Check, Clipboard, Sparkles,
} from '@/components/icons'

interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
}

interface Conversation {
  id: string
  title: string
  messageCount: number
  updatedAt: string
}

const SUGGESTED_QUESTIONS = [
  'What are the main topics covered in my sources?',
  'Summarize the key findings',
  'What are the most important concepts?',
  'How do the different sources relate to each other?',
]

export default function NotebookChat({ params }: { params: Promise<{ id: string }> }) {
  const { id: notebookId } = use(params)
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [notebookTitle, setNotebookTitle] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load notebook info and conversations
  useEffect(() => {
    fetch(`/api/openbook/notebooks/${notebookId}`)
      .then(r => r.json())
      .then(d => {
        if (d.notebook) {
          setNotebookTitle(d.notebook.title)
          setConversations(d.notebook.conversations || [])
        }
      })
  }, [notebookId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const autoResize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  useEffect(() => { autoResize() }, [input])

  const loadConversation = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/openbook/chat/${convId}`)
      const data = await res.json()
      if (data.messages) {
        setMessages(data.messages.map((m: { id: string; role: string; content: string; createdAt: string }) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          createdAt: m.createdAt,
        })))
        setConversationId(convId)
        setShowHistory(false)
      }
    } catch {}
  }, [])

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim()
    if (!msg || isStreaming) return
    setInput('')
    setIsStreaming(true)

    setMessages(prev => [...prev, { role: 'user', content: msg }])

    try {
      const res = await fetch('/api/openbook/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notebookId,
          conversationId,
          message: msg,
        }),
      })

      const cid = res.headers.get('X-Conversation-Id')
      if (cid) setConversationId(cid)

      const reader = res.body?.getReader()
      if (!reader) return

      let assistantContent = ''
      setMessages(prev => [...prev, { role: 'assistant', content: '' }])

      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6))
              const delta = data.choices?.[0]?.delta?.content
              if (delta) {
                assistantContent += delta
                setMessages(prev => {
                  const updated = [...prev]
                  updated[updated.length - 1] = { role: 'assistant', content: assistantContent }
                  return updated
                })
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' },
      ])
    }

    setIsStreaming(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const copyMessage = (content: string, idx: number) => {
    navigator.clipboard.writeText(content)
    setCopiedId(String(idx))
    setTimeout(() => setCopiedId(null), 2000)
  }

  const copyCodeBlock = (code: string, id: string) => {
    navigator.clipboard.writeText(code)
    setCopiedBlock(id)
    setTimeout(() => setCopiedBlock(null), 2000)
  }

  const startNewChat = () => {
    setMessages([])
    setConversationId(null)
    setShowHistory(false)
  }

  // Recursively process React children to find text nodes with [Source N] and replace with badges
  const processChildren = (children: React.ReactNode): React.ReactNode => {
    return React.Children.map(children, child => {
      if (typeof child === 'string') {
        return renderTextWithCitations(child)
      }
      return child
    })
  }

  // Process text to render [Source N] citations as styled badges
  const renderTextWithCitations = (text: string) => {
    const parts = text.split(/(\[Source\s+\d+\])/)
    if (parts.length === 1) return text
    return parts.map((part, idx) => {
      if (/^\[Source\s+\d+\]$/.test(part)) {
        return (
          <span key={idx} className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-md text-[11px] font-semibold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 align-middle">
            {part}
          </span>
        )
      }
      return part
    })
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <button
          onClick={() => router.push(`/openbook/${notebookId}`)}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <BookOpen className="w-5 h-5 text-violet-600 dark:text-violet-400" />
        <div className="flex-1">
          <h1 className="text-sm font-medium text-gray-900 dark:text-white">{notebookTitle || 'Notebook Chat'}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Ask questions about your sources</p>
        </div>
        <div className="flex items-center gap-2">
          {conversations.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
            >
              History ({conversations.length})
            </button>
          )}
          {conversationId && (
            <button
              onClick={startNewChat}
              className="px-3 py-1.5 text-xs text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition font-medium"
            >
              New Chat
            </button>
          )}
        </div>
      </div>

      {/* Conversation History Dropdown */}
      {showHistory && (
        <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
          <div className="max-w-3xl mx-auto space-y-1">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Previous conversations</p>
            {conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                  conv.id === conversationId
                    ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <span className="font-medium truncate block">{conv.title}</span>
                <span className="text-xs text-gray-400">
                  {conv.messageCount} messages
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-violet-500 dark:text-violet-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Chat with your sources</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 max-w-md mx-auto">
                Ask questions and get answers with citations from your notebook sources.
              </p>

              {/* Suggested Questions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="text-left px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-sm transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </div>
              )}
              <div className={`max-w-[80%] ${msg.role === 'user' ? '' : ''}`}>
                <div
                  className={`rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm'
                      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <div className="prose dark:prose-invert prose-sm max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          table({ children }) {
                            return (
                              <div className="overflow-x-auto my-3">
                                <table className="min-w-full border-collapse border border-gray-200 dark:border-gray-700 text-sm">
                                  {children}
                                </table>
                              </div>
                            )
                          },
                          th({ children }) {
                            return <th className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-left font-semibold">{children}</th>
                          },
                          td({ children }) {
                            return <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">{children}</td>
                          },
                          p({ children }) {
                            return <p>{processChildren(children)}</p>
                          },
                          li({ children }) {
                            return <li>{processChildren(children)}</li>
                          },
                          code({ className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || '')
                            const codeString = String(children).replace(/\n$/, '')
                            const isInline = !match && !codeString.includes('\n')

                            if (isInline) {
                              return <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm" {...props}>{children}</code>
                            }

                            const blockId = `code-${i}-${codeString.slice(0, 20)}`
                            return (
                              <div className="relative group my-3">
                                <div className="flex items-center justify-between px-4 py-2 bg-gray-800 rounded-t-lg">
                                  <span className="text-xs text-gray-400">{match?.[1] || 'code'}</span>
                                  <button
                                    onClick={() => copyCodeBlock(codeString, blockId)}
                                    className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                                  >
                                    {copiedBlock === blockId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                    {copiedBlock === blockId ? 'Copied' : 'Copy'}
                                  </button>
                                </div>
                                <SyntaxHighlighter
                                  style={oneDark}
                                  language={match?.[1] || 'text'}
                                  PreTag="div"
                                  customStyle={{ margin: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
                                >
                                  {codeString}
                                </SyntaxHighlighter>
                              </div>
                            )
                          },
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                      {isStreaming && i === messages.length - 1 && (
                        <span className="inline-block w-2 h-4 bg-violet-500 animate-pulse ml-0.5" />
                      )}
                    </div>
                  )}
                </div>

                {/* Copy button for assistant messages */}
                {msg.role === 'assistant' && !isStreaming && msg.content && (
                  <div className="flex items-center gap-2 mt-1 px-1">
                    <button
                      onClick={() => copyMessage(msg.content, i)}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    >
                      {copiedId === String(i) ? <Check className="w-3 h-3" /> : <Clipboard className="w-3 h-3" />}
                      {copiedId === String(i) ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mt-1">
                  <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-3xl mx-auto">
          <div className="relative rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm focus-within:shadow-md focus-within:border-violet-300 dark:focus-within:border-violet-700 transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              className="w-full px-5 pt-4 pb-12 bg-transparent resize-none outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 text-[15px]"
              placeholder="Ask about your sources..."
              disabled={isStreaming}
            />
            <div className="absolute bottom-3 right-3">
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isStreaming}
                className="p-2 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white dark:text-gray-900 disabled:text-gray-400 dark:disabled:text-gray-500 rounded-xl transition-colors"
              >
                {isStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center mt-2">
            Answers are generated from your notebook sources. Always verify important information.
          </p>
        </div>
      </div>
    </div>
  )
}
