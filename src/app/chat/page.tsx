'use client'

import { useState, useEffect } from 'react'
import { useChatContext } from './layout'
import { ChatInput } from '@/components/chat-input'
import { MessageSquare, Layers, BookOpen, Zap, Terminal, Globe, GraduationCap } from '@/components/icons'

export type ChatType = 'classic' | 'multimodel' | 'skilled' | 'mcp' | 'research' | 'openbook'

interface ChatTypeOption {
  id: ChatType
  label: string
  description: string
  icon: typeof MessageSquare
  color: string
  comingSoon?: boolean
}

const CHAT_TYPES: ChatTypeOption[] = [
  {
    id: 'classic',
    label: 'Classic',
    description: 'Smart routing picks the best model',
    icon: Zap,
    color: 'from-brand-500 to-purple-600',
  },
  {
    id: 'multimodel',
    label: 'Multimodel',
    description: 'Multiple models, maestro picks best',
    icon: Layers,
    color: 'from-amber-500 to-orange-600',
  },
  {
    id: 'skilled',
    label: 'Skilled',
    description: 'Use a skill with a chosen model',
    icon: BookOpen,
    color: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'mcp',
    label: 'MCP',
    description: 'Chat with MCP tools & services',
    icon: Terminal,
    color: 'from-cyan-500 to-blue-600',
  },
  {
    id: 'research',
    label: 'Research',
    description: 'Deep web research with citations',
    icon: Globe,
    color: 'from-rose-500 to-pink-600',
  },
  {
    id: 'openbook',
    label: 'OpenBook',
    description: 'Learn from your materials visually',
    icon: GraduationCap,
    color: 'from-violet-500 to-indigo-600',
  },
]

interface SkillOption {
  id: string
  name: string
  icon: string
  description: string
}

export default function NewChatPage() {
  const { routingMode, userName, loadConversations, refreshUser, router } = useChatContext()
  const [isLoading, setIsLoading] = useState(false)
  const [chatType, setChatType] = useState<ChatType>('classic')
  const [skills, setSkills] = useState<SkillOption[]>([])
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('')

  // Load skills when skilled chat is selected
  useEffect(() => {
    if (chatType === 'skilled') {
      fetch('/api/skills')
        .then(res => res.ok ? res.json() : { skills: [] })
        .then(data => setSkills(data.skills || []))
    }
  }, [chatType])

  const sendFirstMessage = async (text: string) => {
    if (!text.trim() || isLoading) return

    // Validate skilled chat requirements
    if (chatType === 'skilled' && !selectedSkillId) {
      alert('Please select a skill first')
      return
    }
    if ((chatType === 'skilled' || chatType === 'mcp') && !selectedModel) {
      alert('Please select a model first')
      return
    }

    setIsLoading(true)

    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: text.slice(0, 100),
          routingMode,
          chatType,
          skillId: chatType === 'skilled' ? selectedSkillId : undefined,
          activeModel: (chatType === 'skilled' || chatType === 'mcp') ? selectedModel : undefined,
        }),
      })
      const data = await res.json()
      const convId = data.conversation.id

      sessionStorage.setItem('pendingMessage', text)
      loadConversations()
      router.push(`/chat/${convId}`)
    } catch {
      setIsLoading(false)
    }
  }

  const greeting = userName
    ? `Hi ${userName}, what would you like to explore?`
    : 'What would you like to explore?'

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto">
      {/* Greeting */}
      <h1 className="text-3xl sm:text-4xl font-semibold text-gray-800 dark:text-gray-100 mb-8 text-center">
        {greeting}
      </h1>

      {/* Input */}
      <div className="w-full max-w-2xl mb-5">
        <ChatInput onSend={sendFirstMessage} isLoading={isLoading} borderless />
      </div>

      {/* Chat type pills */}
      <div className="flex flex-wrap justify-center gap-1.5 mb-5">
        {CHAT_TYPES.map((type) => {
          const Icon = type.icon
          const isActive = chatType === type.id
          const isSoon = type.comingSoon
          return (
            <button
              key={type.id}
              onClick={() => {
                if (isSoon) return
                if (type.id === 'openbook') { router.push('/openbook'); return }
                setChatType(type.id)
              }}
              disabled={isSoon}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isSoon
                  ? 'opacity-40 cursor-not-allowed text-gray-400 dark:text-gray-500'
                  : isActive
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {type.label}
              {isSoon && (
                <span className="text-[9px] font-semibold px-1 py-px rounded bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 leading-none">
                  Soon
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Chat-type-specific options */}
      <div className="w-full max-w-xl">
        {/* Skilled Chat: Skill + Model Picker */}
        {chatType === 'skilled' && (
          <div className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Skill</label>
              {skills.length === 0 ? (
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl text-center">
                  <p className="text-sm text-gray-500">No skills yet.</p>
                  <button
                    onClick={() => router.push('/skills')}
                    className="text-sm text-brand-600 hover:text-brand-700 mt-1 font-medium"
                  >
                    Create or install a skill
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {skills.map((skill) => (
                    <button
                      key={skill.id}
                      onClick={() => setSelectedSkillId(skill.id)}
                      className={`p-3 rounded-xl border text-left transition ${
                        selectedSkillId === skill.id
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 bg-white dark:bg-gray-800'
                      }`}
                    >
                      <span className="text-lg">{skill.icon}</span>
                      <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">{skill.name}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Model</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              >
                <option value="">Choose a model...</option>
                <optgroup label="Budget">
                  <option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option>
                  <option value="deepseek/deepseek-chat-v3-0324">DeepSeek V3</option>
                  <option value="qwen/qwen3-coder-next">Qwen 3 Coder</option>
                  <option value="minimax/minimax-m2.5">MiniMax M2.5</option>
                  <option value="inception/mercury-2">Mercury 2</option>
                </optgroup>
                <optgroup label="Quality">
                  <option value="anthropic/claude-sonnet-4.6">Claude Sonnet 4.6</option>
                  <option value="openai/gpt-5.3-chat">GPT-5.3 Chat</option>
                  <option value="google/gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                  <option value="deepseek/deepseek-r1">DeepSeek R1</option>
                </optgroup>
                <optgroup label="Premium">
                  <option value="anthropic/claude-opus-4.6">Claude Opus 4.6</option>
                  <option value="openai/gpt-5.4-pro">GPT-5.4 Pro</option>
                </optgroup>
              </select>
            </div>
          </div>
        )}

        {/* MCP Chat: Model Picker + info */}
        {chatType === 'mcp' && (
          <div className="space-y-4 text-left">
            <div className="p-3.5 bg-cyan-50 dark:bg-cyan-950/30 rounded-xl border border-cyan-200 dark:border-cyan-800">
              <p className="text-xs text-cyan-700 dark:text-cyan-300">
                Your message goes to the selected model with MCP tool access.{' '}
                <a href="/mcp" className="underline font-medium">Manage servers →</a>
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Model</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              >
                <option value="">Choose a model...</option>
                <optgroup label="Budget">
                  <option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option>
                  <option value="deepseek/deepseek-chat-v3-0324">DeepSeek V3</option>
                  <option value="qwen/qwen3-coder-next">Qwen 3 Coder</option>
                </optgroup>
                <optgroup label="Quality">
                  <option value="anthropic/claude-sonnet-4.6">Claude Sonnet 4.6</option>
                  <option value="openai/gpt-5.3-chat">GPT-5.3 Chat</option>
                  <option value="google/gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                </optgroup>
                <optgroup label="Premium">
                  <option value="anthropic/claude-opus-4.6">Claude Opus 4.6</option>
                  <option value="openai/gpt-5.4-pro">GPT-5.4 Pro</option>
                </optgroup>
              </select>
            </div>
          </div>
        )}

        {/* Multimodel info */}
        {chatType === 'multimodel' && (
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 text-left">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Sends to multiple models simultaneously. The maestro evaluates all responses and picks the best one.
            </p>
          </div>
        )}

        {/* Research info */}
        {chatType === 'research' && (
          <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800 text-left">
            <p className="text-xs text-rose-700 dark:text-rose-300">
              Searches the web, crawls pages, and synthesizes a cited report. You&apos;ll review the plan before it runs.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
