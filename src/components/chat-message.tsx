'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import { Copy, Check, Bot, User, Zap, Clipboard } from './icons'
import { cn } from '@/lib/utils'

/**
 * Strip wrapping code fences (```markdown ... ```) that some models
 * add around their entire response, which prevents markdown rendering.
 */
function stripWrappingCodeFence(text: string): string {
  const trimmed = text.trim()
  // Greedy match — safe because we anchor to start/end
  const match = trimmed.match(/^```(?:markdown|md|)\s*\n([\s\S]*)\n```\s*$/)
  if (match) return match[1]
  return text
}

interface ChatMessageProps {
  id?: string
  role: 'user' | 'assistant'
  content: string
  modelUsed?: string | null
  routingTier?: string | null
  creditsCost?: number
  latencyMs?: number
  isStreaming?: boolean
  wasEscalated?: boolean
  escalatedFrom?: string | null
  criticScore?: number | null
  compact?: boolean
  hideAvatar?: boolean
}

export function ChatMessage({
  role,
  content,
  modelUsed,
  routingTier,
  creditsCost,
  latencyMs,
  isStreaming,
  wasEscalated,
  escalatedFrom,
  compact,
  hideAvatar,
}: ChatMessageProps) {
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null)
  const [copiedMessage, setCopiedMessage] = useState(false)

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedBlock(id)
    setTimeout(() => setCopiedBlock(null), 2000)
  }

  const copyMessage = () => {
    navigator.clipboard.writeText(content)
    setCopiedMessage(true)
    setTimeout(() => setCopiedMessage(false), 2000)
  }

  const tierColor = routingTier === 'cheap' ? 'text-green-500' :
    routingTier === 'mid' ? 'text-yellow-500' : 'text-purple-500'

  const processedContent = stripWrappingCodeFence(content)

  // Compact mode: no avatar, no outer bubble, just the content (for multimodel cards)
  if (compact) {
    return (
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
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '')
              const codeString = String(children).replace(/\n$/, '')
              const isInline = !match && !codeString.includes('\n')
              if (isInline) {
                return <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm" {...props}>{children}</code>
              }
              const blockId = `code-${codeString.slice(0, 20)}`
              return (
                <div className="relative group my-3">
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-800 rounded-t-lg">
                    <span className="text-xs text-gray-400">{match?.[1] || 'code'}</span>
                    <button onClick={() => copyToClipboard(codeString, blockId)} className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
                      {copiedBlock === blockId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedBlock === blockId ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <SyntaxHighlighter style={oneDark} language={match?.[1] || 'text'} PreTag="div" customStyle={{ margin: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                    {codeString}
                  </SyntaxHighlighter>
                </div>
              )
            },
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
    )
  }

  return (
    <div className={cn('mb-6', role === 'user' ? '' : '')}>
      <div className="flex gap-3">
        {!hideAvatar && (
          <div className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
            role === 'user'
              ? 'bg-gray-200 dark:bg-gray-600'
              : 'bg-gradient-to-br from-brand-500 to-purple-600'
          )}>
            {role === 'user'
              ? <User className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              : <Bot className="w-4 h-4 text-white" />
            }
          </div>
        )}
        <div className="flex-1 min-w-0 max-w-3xl">
          <div className={cn(
            'rounded-2xl px-4 py-3',
            role === 'user'
              ? 'bg-brand-600 text-white'
              : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
          )}>
            {role === 'user' ? (
              <p className="whitespace-pre-wrap">{content}</p>
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
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '')
                      const codeString = String(children).replace(/\n$/, '')
                      const isInline = !match && !codeString.includes('\n')

                      if (isInline) {
                        return (
                          <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm" {...props}>
                            {children}
                          </code>
                        )
                      }

                      const blockId = `code-${codeString.slice(0, 20)}`
                      return (
                        <div className="relative group my-3">
                          <div className="flex items-center justify-between px-4 py-2 bg-gray-800 rounded-t-lg">
                            <span className="text-xs text-gray-400">{match?.[1] || 'code'}</span>
                            <button
                              onClick={() => copyToClipboard(codeString, blockId)}
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
                  {processedContent}
                </ReactMarkdown>
                {isStreaming && (
                  <span className="inline-block w-2 h-5 bg-brand-500 animate-pulse ml-1" />
                )}
              </div>
            )}
          </div>

          {/* Message metadata */}
          {role === 'assistant' && !isStreaming && (
            <div className="flex items-center gap-3 mt-1.5 px-1 text-xs text-gray-400">
              {modelUsed && (
                <span className={cn('flex items-center gap-1', tierColor)}>
                  <Zap className="w-3 h-3" />
                  {modelUsed.split('/')[1]}
                  {wasEscalated && escalatedFrom && (
                    <span className="text-purple-400 text-[10px]">(upgraded)</span>
                  )}
                </span>
              )}
              {creditsCost !== undefined && (
                <span>{creditsCost.toFixed(2)} credits</span>
              )}
              {latencyMs !== undefined && (
                <span>{(latencyMs / 1000).toFixed(1)}s</span>
              )}
              <button
                onClick={copyMessage}
                className="flex items-center gap-1 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Copy message"
              >
                {copiedMessage ? <Check className="w-3 h-3" /> : <Clipboard className="w-3 h-3" />}
                {copiedMessage ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
