'use client'

import { useState, useEffect, useRef, useMemo, useCallback, use } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useChatContext } from '../layout'
import { ChatMessage } from '@/components/chat-message'
import { ChatInput } from '@/components/chat-input'
import { Bot, Loader2, Trophy, Layers, Terminal, Globe, Check, AlertCircle, ChevronDown, ChevronRight } from '@/components/icons'

function ThinkingIndicator({ label }: { label?: string }) {
  return (
    <div className="mb-6">
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-brand-500 to-purple-600">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="rounded-2xl px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 inline-block">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-brand-500 animate-bounce [animation-delay:0ms]" />
              <div className="w-2 h-2 rounded-full bg-brand-500 animate-bounce [animation-delay:150ms]" />
              <div className="w-2 h-2 rounded-full bg-brand-500 animate-bounce [animation-delay:300ms]" />
              <span className="ml-2 text-sm text-gray-400">{label || 'Thinking...'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface DbMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  modelUsed?: string | null
  routingTier?: string | null
  creditsCost?: number
  latencyMs?: number
  wasEscalated?: boolean
  escalatedFrom?: string | null
  criticScore?: number | null
  groupId?: string | null
  pipelineLog?: string | null
}

interface MultimodelResponse {
  messageId: string
  model: string
  content: string
  latencyMs: number
  credits: number
  score: number
  isWinner: boolean
}

interface MultimodelGroup {
  groupId: string
  userMessage: string
  responses: MultimodelResponse[]
  winner: { messageId: string; model: string; reason: string }
}

interface McpToolCallEvent {
  id: string
  server: string
  serverIcon: string
  tool: string
  args: Record<string, unknown>
  status?: 'success' | 'error'
  result?: string
  durationMs?: number
}

interface McpChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: McpToolCallEvent[]
}

interface ConversationData {
  chatType: string
  activeModel?: string | null
  skillId?: string | null
  skill?: { name: string; icon: string } | null
}

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { routingMode, loadConversations, refreshUser } = useChatContext()
  const [dbMessages, setDbMessages] = useState<DbMessage[]>([])
  const [convData, setConvData] = useState<ConversationData | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [mmLoading, setMmLoading] = useState(false)
  const [mmGroups, setMmGroups] = useState<MultimodelGroup[]>([])
  const [chosenModel, setChosenModel] = useState<string | null>(null)
  const [mcpMessages, setMcpMessages] = useState<McpChatMessage[]>([])
  const [mcpLoading, setMcpLoading] = useState(false)
  const [mcpActiveToolCalls, setMcpActiveToolCalls] = useState<McpToolCallEvent[]>([])
  // Research state
  const [researchJobId, setResearchJobId] = useState<string | null>(null)
  const [researchProgress, setResearchProgress] = useState<{
    stage: string; message: string; progress: number; detail?: string
  } | null>(null)
  const [researchReport, setResearchReport] = useState<string | null>(null)
  const [researchSources, setResearchSources] = useState<Array<{ url: string; title: string; snippet: string }>>([])
  const [researchCredits, setResearchCredits] = useState(0)
  const [researchLoading, setResearchLoading] = useState(false)
  const [researchError, setResearchError] = useState<string | null>(null)
  const [researchPlanMessage, setResearchPlanMessage] = useState<string | null>(null)
  const [researchAwaitingApproval, setResearchAwaitingApproval] = useState(false)
  // Clarification state (pre-research)
  const [clarifyStep, setClarifyStep] = useState(0) // 0=not started, 1-3=active question
  const [clarifyAnswers, setClarifyAnswers] = useState<Array<{ question: string; answer: string }>>([])
  const [clarifyQuestion, setClarifyQuestion] = useState<string | null>(null)
  const [clarifyChoices, setClarifyChoices] = useState<string[]>([])
  const [clarifyLoading, setClarifyLoading] = useState(false)
  const [clarifySummary, setClarifySummary] = useState<string | null>(null)
  const [clarifyOriginalQuery, setClarifyOriginalQuery] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const hasSentPending = useRef(false)

  const isMultimodel = convData?.chatType === 'multimodel'
  const isSkilled = convData?.chatType === 'skilled'
  const isMcp = convData?.chatType === 'mcp'
  const isResearch = convData?.chatType === 'research'
  // After 1st multimodel round, user must pick a model to continue
  const hasMultimodelResults = mmGroups.length > 0
  const activeModelForChat = chosenModel || convData?.activeModel

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: '/api/chat',
      body: { conversationId: id, routingMode, forceModel: isMultimodel ? activeModelForChat : undefined },
    }),
    [id, routingMode, isMultimodel, activeModelForChat]
  )

  const loadDbMessages = useCallback(async () => {
    const res = await fetch(`/api/conversations/${id}`)
    const data = await res.json()
    if (data.conversation) {
      setConvData({
        chatType: data.conversation.chatType || 'classic',
        activeModel: data.conversation.activeModel,
        skillId: data.conversation.skillId,
        skill: data.conversation.skill,
      })
      setDbMessages(data.conversation.messages.map((m: DbMessage & { createdAt: string }) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        modelUsed: m.modelUsed,
        routingTier: m.routingTier,
        creditsCost: m.creditsCost,
        latencyMs: m.latencyMs,
        wasEscalated: m.wasEscalated,
        escalatedFrom: m.escalatedFrom,
        criticScore: m.criticScore,
        groupId: m.groupId,
        pipelineLog: m.pipelineLog,
      })))

      // Parse multimodel groups
      if (data.conversation.chatType === 'multimodel') {
        parseMultimodelGroups(data.conversation.messages)
      }

      // Parse MCP messages from DB
      if (data.conversation.chatType === 'mcp') {
        const mcpMsgs: McpChatMessage[] = []
        for (const m of data.conversation.messages) {
          if (m.role === 'user') {
            mcpMsgs.push({ role: 'user', content: m.content })
          } else if (m.role === 'assistant') {
            let toolCalls: McpToolCallEvent[] | undefined
            if (m.pipelineLog) {
              try {
                const log = JSON.parse(m.pipelineLog)
                if (log.type === 'mcp' && Array.isArray(log.toolCalls)) {
                  toolCalls = log.toolCalls.map((tc: Record<string, unknown>, i: number) => ({
                    id: `db_${i}`,
                    server: tc.server as string || '',
                    serverIcon: 'terminal',
                    tool: tc.tool as string || '',
                    args: (tc.args || {}) as Record<string, unknown>,
                    status: tc.status as string || 'success',
                    result: tc.resultPreview as string || '',
                    durationMs: tc.durationMs as number || 0,
                  }))
                }
              } catch { /* ignore */ }
            }
            mcpMsgs.push({ role: 'assistant', content: m.content, toolCalls })
          }
        }
        setMcpMessages(mcpMsgs)
      }

      // Load research state from DB
      if (data.conversation.chatType === 'research') {
        const jobRes = await fetch(`/api/research?jobId=latest&conversationId=${data.conversation.id}`).catch(() => null)
        if (jobRes?.ok) {
          const jobData = await jobRes.json()
          setResearchJobId(jobData.id)
          if (jobData.sources) setResearchSources(jobData.sources)

          if (jobData.status === 'awaiting_approval') {
            // Show plan message and approve button
            setResearchPlanMessage(jobData.planMessage || null)
            setResearchAwaitingApproval(true)
            setResearchProgress({ stage: 'awaiting_approval', message: 'Waiting for your approval...', progress: 12 })
          } else if (jobData.status === 'completed') {
            // Show completed report
            const reportMsg = data.conversation.messages.find(
              (m: DbMessage) => m.role === 'assistant' && m.routingTier === 'research'
            )
            if (reportMsg) {
              setResearchReport(reportMsg.content)
              setResearchCredits(reportMsg.creditsCost || 0)
            } else if (jobData.report) {
              setResearchReport(jobData.report)
              setResearchCredits(jobData.totalCredits || 0)
            }
            // Also load plan message if exists
            const planMsg = data.conversation.messages.find(
              (m: DbMessage) => m.role === 'assistant' && m.routingTier === 'research-plan'
            )
            if (planMsg) setResearchPlanMessage(planMsg.content)
            setResearchProgress({ stage: 'completed', message: 'Research complete!', progress: 100 })
          } else if (jobData.status === 'failed') {
            setResearchError(jobData.errorMessage || 'Research failed')
          } else if (jobData.status !== 'pending') {
            // In-progress job — reconnect SSE
            setResearchLoading(true)
            setResearchProgress({ stage: jobData.status, message: jobData.progressMessage || 'Processing...', progress: jobData.progress })
          }
        }
      }
    }
  }, [id])

  const parseMultimodelGroups = (messages: (DbMessage & { createdAt: string })[]) => {
    const groups: Record<string, { userMsg?: string; responses: MultimodelResponse[]; winner?: { messageId: string; model: string; reason: string } }> = {}

    for (const msg of messages) {
      if (!msg.groupId) continue
      if (!groups[msg.groupId]) groups[msg.groupId] = { responses: [] }

      if (msg.role === 'user') {
        groups[msg.groupId].userMsg = msg.content
      } else if (msg.role === 'assistant') {
        let pipelineLog: { type?: string; scores?: Record<string, number>; reason?: string } = {}
        try { pipelineLog = msg.pipelineLog ? JSON.parse(msg.pipelineLog) : {} } catch { /* ignore */ }

        const isWinner = pipelineLog.type === 'multimodel_winner'
        groups[msg.groupId].responses.push({
          messageId: msg.id,
          model: msg.modelUsed || 'unknown',
          content: msg.content,
          latencyMs: msg.latencyMs || 0,
          credits: msg.creditsCost || 0,
          score: msg.criticScore || 0,
          isWinner,
        })

        if (isWinner) {
          groups[msg.groupId].winner = {
            messageId: msg.id,
            model: msg.modelUsed || 'unknown',
            reason: pipelineLog.reason || 'Selected by maestro',
          }
        }
      }
    }

    const parsedGroups: MultimodelGroup[] = Object.entries(groups)
      .filter(([, g]) => g.responses.length > 0)
      .map(([gId, g]) => ({
        groupId: gId,
        userMessage: g.userMsg || '',
        responses: g.responses.sort((a, b) => (b.score || 0) - (a.score || 0)),
        winner: g.winner || { messageId: g.responses[0].messageId, model: g.responses[0].model, reason: '' },
      }))

    setMmGroups(parsedGroups)
  }

  // Check for escalation (classic/skilled only)
  const checkForEscalation = useCallback(async () => {
    if (isMultimodel) return
    await new Promise(r => setTimeout(r, 3000))
    await loadDbMessages()

    const res = await fetch(`/api/conversations/${id}`)
    const data = await res.json()
    if (!data.conversation) return

    const messages = data.conversation.messages as (DbMessage & { escalatedFrom?: string | null })[]
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')

    if (lastAssistant?.escalatedFrom?.startsWith('needs_escalation:')) {
      const escalatedModel = lastAssistant.escalatedFrom.replace('needs_escalation:', '')
      const tier = escalatedModel.includes('opus') || escalatedModel.includes('pro') ? 'premium' : 'mid'

      setRegenerating(lastAssistant.id)

      try {
        const regenRes = await fetch('/api/chat/regenerate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId: lastAssistant.id,
            conversationId: id,
            model: escalatedModel,
            tier,
          }),
        })

        if (regenRes.ok) {
          const reader = regenRes.body?.getReader()
          if (reader) {
            while (true) {
              const { done } = await reader.read()
              if (done) break
            }
          }
        }
      } finally {
        setRegenerating(null)
        refreshUser()
        loadConversations()
        loadDbMessages()
      }
    }
  }, [id, isMultimodel, refreshUser, loadConversations, loadDbMessages])

  const { messages, status, sendMessage: chatSendMessage } = useChat({
    transport,
    id,
    onFinish: () => {
      refreshUser()
      loadConversations()
      loadDbMessages()
      checkForEscalation()
    },
  })

  useEffect(() => {
    loadDbMessages().then(() => setInitialLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => { scrollToBottom() }, [messages, dbMessages, mmGroups, mcpMessages, mcpActiveToolCalls])

  // Multimodel: send to /api/chat/multimodel instead
  const sendMultimodelMessage = async (text: string) => {
    if (!text.trim() || mmLoading) return
    setMmLoading(true)

    try {
      const res = await fetch('/api/chat/multimodel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: id, message: text }),
      })

      if (res.ok) {
        const data = await res.json()
        setMmGroups(prev => [...prev, {
          groupId: data.groupId,
          userMessage: text,
          responses: data.responses,
          winner: data.winner,
        }])
      }
    } finally {
      setMmLoading(false)
      refreshUser()
      loadConversations()
      loadDbMessages()
    }
  }

  // Select model after multimodel round
  const selectModel = async (model: string) => {
    setChosenModel(model)
    // Update activeModel in DB
    await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeModel: model }),
    })
    await loadDbMessages()
  }

  // MCP Chat: send to /api/chat/mcp with SSE streaming
  const sendMcpMessage = async (text: string) => {
    if (!text.trim() || mcpLoading) return
    setMcpLoading(true)
    setMcpActiveToolCalls([])

    // Add user message immediately
    setMcpMessages(prev => [...prev, { role: 'user', content: text }])

    try {
      const res = await fetch('/api/chat/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: id, message: text }),
      })

      if (!res.ok) {
        const err = await res.json()
        setMcpMessages(prev => [...prev, {
          role: 'assistant',
          content: `Error: ${err.error || 'Failed to send message'}`,
        }])
        return
      }

      const reader = res.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let buffer = ''
      const currentToolCalls: McpToolCallEvent[] = []
      let assistantText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let eventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6))

              if (eventType === 'tool_call_start') {
                const tc: McpToolCallEvent = { ...data }
                currentToolCalls.push(tc)
                setMcpActiveToolCalls([...currentToolCalls])
              } else if (eventType === 'tool_call_result') {
                const idx = currentToolCalls.findIndex(tc => tc.id === data.id)
                if (idx >= 0) {
                  currentToolCalls[idx] = { ...currentToolCalls[idx], ...data }
                  setMcpActiveToolCalls([...currentToolCalls])
                }
              } else if (eventType === 'text') {
                assistantText = data.content || ''
              } else if (eventType === 'error') {
                assistantText = `Error: ${data.message}`
              }
            } catch {
              // ignore parse errors
            }
            eventType = ''
          }
        }
      }

      // Add assistant message with tool calls
      setMcpMessages(prev => [...prev, {
        role: 'assistant',
        content: assistantText,
        toolCalls: currentToolCalls.length > 0 ? [...currentToolCalls] : undefined,
      }])
    } finally {
      setMcpLoading(false)
      setMcpActiveToolCalls([])
      refreshUser()
      loadConversations()
      loadDbMessages()
    }
  }

  // Fetch a clarifying question from the AI
  const fetchClarifyQuestion = async (query: string, step: number, answers: Array<{ question: string; answer: string }>) => {
    setClarifyLoading(true)
    try {
      const res = await fetch('/api/research/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, step, previousAnswers: answers }),
      })
      if (!res.ok) {
        // If clarify fails, skip to direct research
        startDirectResearch(query)
        return
      }
      const data = await res.json()
      setClarifyStep(step)
      setClarifyQuestion(data.question)
      setClarifyChoices(data.choices || [])
      if (data.summary) {
        setClarifySummary(data.summary)
      }
    } catch {
      // On error, skip clarification and go direct
      startDirectResearch(query)
    } finally {
      setClarifyLoading(false)
    }
  }

  // User picks a clarification choice
  const handleClarifyChoice = async (choice: string) => {
    if (!clarifyOriginalQuery || !clarifyQuestion) return
    const newAnswers = [...clarifyAnswers, { question: clarifyQuestion, answer: choice }]
    setClarifyAnswers(newAnswers)
    setClarifyQuestion(null)
    setClarifyChoices([])

    if (newAnswers.length < 3) {
      // Fetch next question
      await fetchClarifyQuestion(clarifyOriginalQuery, newAnswers.length + 1, newAnswers)
    } else {
      // All 3 answered — show summary and wait for user to start research
      setClarifyStep(4) // 4 = done, showing summary
    }
  }

  // Skip clarification and go straight to research
  const skipClarification = () => {
    if (clarifyOriginalQuery) {
      startDirectResearch(clarifyOriginalQuery)
    }
  }

  // Start research with enriched query (after clarification or direct)
  const startResearchWithContext = () => {
    if (!clarifyOriginalQuery) return
    const enrichedQuery = buildEnrichedQuery(clarifyOriginalQuery, clarifyAnswers, clarifySummary)
    startDirectResearch(enrichedQuery)
  }

  const buildEnrichedQuery = (
    query: string,
    answers: Array<{ question: string; answer: string }>,
    summary: string | null,
  ): string => {
    if (answers.length === 0) return query
    const clarifications = answers.map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer}`).join('\n')
    return `${query}\n\nClarification context:\n${clarifications}${summary ? `\n\nResearch focus: ${summary}` : ''}`
  }

  const startDirectResearch = async (text: string) => {
    // Reset clarify state
    setClarifyStep(0)
    setClarifyAnswers([])
    setClarifyQuestion(null)
    setClarifyChoices([])
    setClarifySummary(null)
    setClarifyOriginalQuery(null)

    setResearchLoading(true)
    setResearchError(null)
    setResearchProgress({ stage: 'queuing', message: 'Starting research...', progress: 0 })

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: id, message: text }),
      })

      if (!res.ok) {
        const err = await res.json()
        setResearchError(err.error || 'Failed to start research')
        setResearchLoading(false)
        setResearchProgress(null)
        return
      }

      const data = await res.json()
      setResearchJobId(data.jobId)

      // Connect to SSE progress stream
      const sse = new EventSource(`/api/research/progress?jobId=${data.jobId}`)

      sse.addEventListener('progress', (event) => {
        try {
          const progress = JSON.parse(event.data)
          setResearchProgress({
            stage: progress.stage,
            message: progress.message,
            progress: progress.progress,
            detail: progress.detail,
          })

          if (progress.stage === 'awaiting_approval') {
            setResearchPlanMessage(progress.planMessage || null)
            setResearchAwaitingApproval(true)
            setResearchLoading(false)
            sse.close()
            loadDbMessages()
          }

          if (progress.stage === 'completed') {
            setResearchReport(progress.report || null)
            setResearchSources(progress.sources || [])
            setResearchCredits(progress.totalCredits || 0)
            setResearchLoading(false)
            sse.close()
            refreshUser()
            loadConversations()
            loadDbMessages()
          }

          if (progress.stage === 'failed') {
            setResearchError(progress.message)
            setResearchLoading(false)
            sse.close()
          }
        } catch { /* ignore parse errors */ }
      })

      sse.onerror = () => {
        // SSE disconnected — poll for final status
        sse.close()
        if (researchLoading) {
          pollResearchStatus(data.jobId)
        }
      }
    } catch (err) {
      setResearchError((err as Error).message)
      setResearchLoading(false)
      setResearchProgress(null)
    }
  }

  const sendResearchMessage = async (text: string) => {
    // Start clarification flow (3 adaptive questions before research)
    setClarifyOriginalQuery(text)
    setClarifyAnswers([])
    setClarifySummary(null)
    setClarifyStep(0)
    await fetchClarifyQuestion(text, 1, [])
  }

  const pollResearchStatus = async (jobId: string) => {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000))
      try {
        const res = await fetch(`/api/research?jobId=${jobId}`)
        if (!res.ok) continue
        const data = await res.json()
        if (data.status === 'completed') {
          setResearchReport(data.report)
          setResearchSources(data.sources || [])
          setResearchCredits(data.totalCredits || 0)
          setResearchLoading(false)
          setResearchProgress({ stage: 'completed', message: 'Research complete!', progress: 100 })
          refreshUser()
          loadConversations()
          loadDbMessages()
          return
        }
        if (data.status === 'failed') {
          setResearchError(data.errorMessage || 'Research failed')
          setResearchLoading(false)
          return
        }
        setResearchProgress({
          stage: data.status,
          message: data.progressMessage || 'Processing...',
          progress: data.progress,
        })
      } catch { /* retry */ }
    }
  }

  const approveResearch = async () => {
    if (!researchJobId) return
    setResearchAwaitingApproval(false)
    setResearchLoading(true)
    setResearchProgress({ stage: 'searching', message: 'Approved! Starting web search...', progress: 15 })

    try {
      const res = await fetch('/api/research/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: researchJobId }),
      })

      if (!res.ok) {
        const err = await res.json()
        setResearchError(err.error || 'Failed to approve')
        setResearchLoading(false)
        return
      }

      // Reconnect SSE for phase 2 progress
      const sse = new EventSource(`/api/research/progress?jobId=${researchJobId}`)

      sse.addEventListener('progress', (event) => {
        try {
          const progress = JSON.parse(event.data)
          setResearchProgress({
            stage: progress.stage,
            message: progress.message,
            progress: progress.progress,
            detail: progress.detail,
          })

          if (progress.stage === 'completed') {
            setResearchReport(progress.report || null)
            setResearchSources(progress.sources || [])
            setResearchCredits(progress.totalCredits || 0)
            setResearchLoading(false)
            sse.close()
            refreshUser()
            loadConversations()
            loadDbMessages()
          }

          if (progress.stage === 'failed') {
            setResearchError(progress.message)
            setResearchLoading(false)
            sse.close()
          }
        } catch { /* ignore */ }
      })

      sse.onerror = () => {
        sse.close()
        if (researchLoading) {
          pollResearchStatus(researchJobId)
        }
      }
    } catch (err) {
      setResearchError((err as Error).message)
      setResearchLoading(false)
    }
  }

  const sendMessage = async (text: string) => {
    if (!text.trim()) return

    // Research chat uses its own handler
    if (isResearch) {
      sendResearchMessage(text)
      return
    }

    // MCP chat uses its own handler
    if (isMcp) {
      sendMcpMessage(text)
      return
    }

    // Only use multimodel fan-out for the FIRST message (no results yet)
    if (isMultimodel && !hasMultimodelResults) {
      sendMultimodelMessage(text)
      return
    }

    // For multimodel follow-ups, need a chosen model
    if (isMultimodel && !activeModelForChat) return

    if (status === 'streaming') return
    chatSendMessage({ text })
  }

  // Check for pending message from new chat creation
  useEffect(() => {
    if (initialLoading || hasSentPending.current) return
    const pending = sessionStorage.getItem('pendingMessage')
    if (pending) {
      sessionStorage.removeItem('pendingMessage')
      hasSentPending.current = true
      sendMessage(pending)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoading])

  if (initialLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    )
  }

  // ═══════════════════════════════════════════════
  // RESEARCH VIEW
  // ═══════════════════════════════════════════════
  if (isResearch) {
    const userQuery = dbMessages.find(m => m.role === 'user')?.content
    return (
      <>
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-4xl mx-auto py-6 px-4">
            {/* Research badge */}
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
              <Globe className="w-5 h-5 text-rose-500" />
              <span className="text-sm font-medium text-rose-600 dark:text-rose-400">Web Research</span>
              {researchCredits > 0 && (
                <span className="text-xs text-gray-500 ml-auto">{researchCredits.toFixed(1)} credits used</span>
              )}
            </div>

            {/* User query */}
            {userQuery && <ChatMessage id="research-q" role="user" content={userQuery} />}

            {/* Clarification phase (before research starts) */}
            {(clarifyStep > 0 || clarifyLoading || clarifyAnswers.length > 0) && !researchLoading && !researchReport && !researchPlanMessage && (
              <div className="mb-6 ml-11 space-y-4">
                {/* Previous Q&A pairs */}
                {clarifyAnswers.map((qa, i) => (
                  <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
                    <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">{qa.question}</p>
                    <div className="inline-block px-3 py-1.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg">
                      <span className="text-sm text-rose-700 dark:text-rose-300">{qa.answer}</span>
                    </div>
                  </div>
                ))}

                {/* Loading next question */}
                {clarifyLoading && (
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                      <span className="text-sm text-gray-500">Thinking of the next question...</span>
                    </div>
                  </div>
                )}

                {/* Current question with choices */}
                {clarifyQuestion && !clarifyLoading && clarifyStep <= 3 && (
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
                        Step {clarifyStep} of 3
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">{clarifyQuestion}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {clarifyChoices.map((choice, i) => (
                        <button
                          key={i}
                          onClick={() => handleClarifyChoice(choice)}
                          className="text-left px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-600 hover:border-rose-400 dark:hover:border-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all text-sm text-gray-700 dark:text-gray-300"
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={skipClarification}
                      className="mt-3 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      Skip and start research directly
                    </button>
                  </div>
                )}

                {/* Summary after all 3 questions answered */}
                {clarifyStep === 4 && (
                  <div className="bg-gradient-to-r from-rose-50 to-pink-50 dark:from-rose-950/20 dark:to-pink-950/20 border border-rose-200 dark:border-rose-800 rounded-2xl p-4">
                    <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase mb-2">Research Focus</p>
                    <p className="text-sm text-gray-900 dark:text-white mb-4">
                      {clarifySummary || `${clarifyOriginalQuery} — focused on: ${clarifyAnswers.map(a => a.answer).join(', ')}`}
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={startResearchWithContext}
                        className="px-5 py-2.5 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-xl font-medium text-sm hover:from-rose-600 hover:to-pink-600 transition-all shadow-sm hover:shadow-md"
                      >
                        Start Research
                      </button>
                      <span className="text-xs text-gray-400">with your refined focus</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Progress indicator */}
            {researchLoading && researchProgress && (
              <div className="mb-6 ml-11">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <Loader2 className="w-5 h-5 animate-spin text-rose-500" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {researchProgress.message}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
                    <div
                      className="bg-gradient-to-r from-rose-500 to-pink-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${researchProgress.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{researchProgress.stage.replace(/_/g, ' ')}</span>
                    <span>{researchProgress.progress}%</span>
                  </div>
                  {researchProgress.detail && (
                    <p className="text-xs text-gray-400 mt-2 truncate">{researchProgress.detail}</p>
                  )}
                </div>
              </div>
            )}

            {/* Research Plan (awaiting approval) */}
            {researchPlanMessage && !researchReport && (
              <div className="mb-6">
                <ChatMessage id="research-plan" role="assistant" content={researchPlanMessage} />
                {researchAwaitingApproval && (
                  <div className="ml-11 mt-3 flex items-center gap-3">
                    <button
                      onClick={approveResearch}
                      className="px-5 py-2.5 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-xl font-medium text-sm hover:from-rose-600 hover:to-pink-600 transition-all shadow-sm hover:shadow-md"
                    >
                      Approve & Start Research
                    </button>
                    <span className="text-xs text-gray-400">or type a new message to regenerate keywords</span>
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {researchError && (
              <div className="mb-6 ml-11">
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl p-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-red-700 dark:text-red-300">{researchError}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Research Report Artifact */}
            {researchReport && (
              <div className="mb-6 ml-11">
                {/* Artifact container - like Claude's artifact display */}
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm">
                  {/* Artifact header */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-rose-50 to-pink-50 dark:from-rose-950/20 dark:to-pink-950/20 border-b border-gray-200 dark:border-gray-700">
                    <Globe className="w-4 h-4 text-rose-500" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Research Report</span>
                    <span className="ml-auto text-xs text-gray-500">
                      {researchSources.length} sources
                    </span>
                  </div>
                  {/* Report content rendered as markdown */}
                  <div className="p-6">
                    <ChatMessage
                      id="research-report"
                      role="assistant"
                      content={researchReport}
                      hideAvatar
                    />
                  </div>
                </div>

                {/* Sources panel */}
                {researchSources.length > 0 && (
                  <div className="mt-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Sources ({researchSources.length})</h4>
                    <div className="space-y-2">
                      {researchSources.map((source, i) => (
                        <a
                          key={i}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-2 p-2 rounded-lg hover:bg-white dark:hover:bg-gray-700/50 transition-colors group"
                        >
                          <span className="text-xs font-bold text-rose-500 mt-0.5 shrink-0">[{i + 1}]</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-rose-600 dark:group-hover:text-rose-400">
                              {source.title}
                            </p>
                            <p className="text-xs text-gray-500 truncate">{source.url}</p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Empty state - no query yet */}
            {!userQuery && !researchLoading && !clarifyLoading && (
              <div className="text-center py-12 text-gray-400">
                <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Ask a question to start deep web research</p>
                <p className="text-xs mt-1">We&apos;ll ask a few quick questions to focus your research, then deliver a cited report</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </main>
        <ChatInput
          onSend={sendMessage}
          isLoading={researchLoading || clarifyLoading}
          placeholder={researchLoading ? 'Research in progress...' : clarifyStep > 0 && clarifyStep <= 3 ? 'Pick an option above, or skip...' : 'Ask a research question...'}
        />
      </>
    )
  }

  // ═══════════════════════════════════════════════
  // MCP CHAT VIEW
  // ═══════════════════════════════════════════════
  if (isMcp) {
    return (
      <>
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-3xl mx-auto py-6 px-4">
            {/* MCP badge */}
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
              <Terminal className="w-5 h-5 text-cyan-500" />
              <span className="text-sm font-medium text-cyan-600 dark:text-cyan-400">MCP Chat</span>
              {convData?.activeModel && (
                <span className="text-xs text-gray-500 ml-2">Model: {convData.activeModel.split('/')[1]}</span>
              )}
            </div>

            {/* Messages */}
            {mcpMessages.map((msg, i) => (
              <div key={i}>
                {msg.role === 'user' ? (
                  <ChatMessage id={`mcp-${i}`} role="user" content={msg.content} />
                ) : (
                  <div className="mb-6">
                    {/* Tool calls */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="ml-11 mb-3 space-y-2">
                        {msg.toolCalls.map((tc) => (
                          <McpToolCallCard key={tc.id} toolCall={tc} />
                        ))}
                      </div>
                    )}
                    {/* Assistant text */}
                    {msg.content && (
                      <ChatMessage
                        id={`mcp-${i}`}
                        role="assistant"
                        content={msg.content}
                        modelUsed={convData?.activeModel}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Active tool calls (while streaming) */}
            {mcpLoading && mcpActiveToolCalls.length > 0 && (
              <div className="ml-11 mb-3 space-y-2">
                {mcpActiveToolCalls.map((tc) => (
                  <McpToolCallCard key={tc.id} toolCall={tc} />
                ))}
              </div>
            )}

            {mcpLoading && mcpActiveToolCalls.length === 0 && (
              <ThinkingIndicator label="Connecting to MCP servers..." />
            )}
            {mcpLoading && mcpActiveToolCalls.length > 0 && !mcpActiveToolCalls.some(tc => !tc.status) && (
              <ThinkingIndicator label="Thinking..." />
            )}

            <div ref={messagesEndRef} />
          </div>
        </main>
        <ChatInput onSend={sendMessage} isLoading={mcpLoading} />
      </>
    )
  }

  // ═══════════════════════════════════════════════
  // MULTIMODEL VIEW
  // ═══════════════════════════════════════════════
  if (isMultimodel) {
    // Follow-up messages (after model is chosen)
    const isStreamingFollowUp = status === 'streaming' || status === 'submitted'
    const followUpMessages = isStreamingFollowUp || messages.length > 0
      ? messages.map(msg => {
          const textContent = (msg.parts ?? [])
            .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
            .map(p => p.text)
            .join('') || ''
          const dbMsg = dbMessages.find(d => d.role === msg.role && d.content === textContent)
          return {
            id: msg.id,
            role: msg.role as 'user' | 'assistant',
            content: textContent,
            modelUsed: dbMsg?.modelUsed,
            routingTier: dbMsg?.routingTier,
            creditsCost: dbMsg?.creditsCost,
            latencyMs: dbMsg?.latencyMs,
          }
        })
      : dbMessages.filter(m => !m.groupId) // Non-multimodel messages are follow-ups

    const needsModelPick = hasMultimodelResults && !activeModelForChat
    const showFollowUpThinking = status === 'submitted' && (followUpMessages.length === 0 || followUpMessages[followUpMessages.length - 1]?.role !== 'assistant')

    return (
      <>
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-4xl mx-auto py-6 px-4">
            {/* Chat type badge */}
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
              <Layers className="w-5 h-5 text-amber-500" />
              <span className="text-sm font-medium text-amber-600 dark:text-amber-400">Multimodel Consultation</span>
              {activeModelForChat ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 ml-2 font-medium">Continuing with: {activeModelForChat.split('/')[1]}</span>
              ) : hasMultimodelResults ? (
                <span className="text-xs text-amber-500 ml-2">Pick a model to continue</span>
              ) : null}
            </div>

            {/* Multimodel round(s) */}
            {mmGroups.map((group) => (
              <div key={group.groupId} className="mb-8">
                <ChatMessage id={`user-${group.groupId}`} role="user" content={group.userMessage} />
                <div className="ml-11 mt-4 space-y-3">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    {group.responses.length} model responses
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {group.responses.map((resp) => (
                      <MultimodelCard
                        key={resp.messageId}
                        response={resp}
                        isWinner={resp.messageId === group.winner.messageId}
                        winnerReason={resp.messageId === group.winner.messageId ? group.winner.reason : undefined}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {/* Model picker after first multimodel round */}
            {hasMultimodelResults && !activeModelForChat && (
              <div className="ml-11 mb-8 p-4 rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-3">
                  Choose a model to continue the conversation:
                </p>
                <div className="flex flex-wrap gap-2">
                  {mmGroups[0]?.responses
                    .sort((a, b) => (b.score || 0) - (a.score || 0))
                    .map((resp) => {
                      const modelName = resp.model.split('/')[1] || resp.model
                      const isRecommended = resp.messageId === mmGroups[0]?.winner.messageId
                      const score = resp.score != null && resp.score > 0 ? (resp.score * 100).toFixed(0) : null
                      return (
                        <button
                          key={resp.model}
                          onClick={() => selectModel(resp.model)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition border ${
                            isRecommended
                              ? 'border-amber-400 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 ring-1 ring-amber-300'
                              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-brand-400'
                          }`}
                        >
                          {modelName}
                          {score && <span className="ml-1 text-xs opacity-70">({score}%)</span>}
                          {isRecommended && <span className="ml-1 text-xs">⭐ Recommended</span>}
                        </button>
                      )
                    })}
                </div>
              </div>
            )}

            {/* Follow-up messages after model is chosen */}
            {activeModelForChat && followUpMessages.map((msg) => (
              <ChatMessage
                key={msg.id}
                {...msg}
                isStreaming={isStreamingFollowUp && msg.role === 'assistant' && msg === followUpMessages[followUpMessages.length - 1]}
              />
            ))}

            {showFollowUpThinking && <ThinkingIndicator />}
            {mmLoading && <ThinkingIndicator label="Consulting multiple models..." />}
            <div ref={messagesEndRef} />
          </div>
        </main>
        <ChatInput
          onSend={sendMessage}
          isLoading={mmLoading || isStreamingFollowUp}
          placeholder={needsModelPick ? 'Pick a model above to continue...' : undefined}
          disabled={needsModelPick}
        />
      </>
    )
  }

  // ═══════════════════════════════════════════════
  // CLASSIC + SKILLED VIEW
  // ═══════════════════════════════════════════════
  const isStreaming = status === 'streaming' || status === 'submitted'
  const displayMessages = isStreaming || messages.length > 0
    ? messages.map(msg => {
        const textContent = (msg.parts ?? [])
          .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
          .map(p => p.text)
          .join('') || ''
        const dbMsg = dbMessages.find(
          d => d.role === msg.role && d.content === textContent
        )
        return {
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          content: textContent,
          modelUsed: dbMsg?.modelUsed,
          routingTier: dbMsg?.routingTier,
          creditsCost: dbMsg?.creditsCost,
          latencyMs: dbMsg?.latencyMs,
          wasEscalated: dbMsg?.wasEscalated,
          escalatedFrom: dbMsg?.escalatedFrom,
          criticScore: dbMsg?.criticScore,
        }
      })
    : dbMessages

  const lastIsAssistant = displayMessages.length > 0 && displayMessages[displayMessages.length - 1].role === 'assistant'
  const showThinking = status === 'submitted' && !lastIsAssistant

  return (
    <>
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto py-6 px-4">
          {/* Skilled chat badge */}
          {isSkilled && convData?.skill && (
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
              <span className="text-lg">{convData.skill.icon}</span>
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                Skilled Chat: {convData.skill.name}
              </span>
              {convData.activeModel && (
                <span className="text-xs text-gray-500 ml-2">Model: {convData.activeModel.split('/')[1]}</span>
              )}
            </div>
          )}

          {displayMessages.map((msg) => (
            <ChatMessage
              key={msg.id}
              {...msg}
              isStreaming={isStreaming && msg.role === 'assistant' && msg === displayMessages[displayMessages.length - 1]}
            />
          ))}
          {showThinking && <ThinkingIndicator />}
          {regenerating && <ThinkingIndicator label="Improving answer with maestro model..." />}
          <div ref={messagesEndRef} />
        </div>
      </main>
      <ChatInput onSend={sendMessage} isLoading={status === 'streaming' || status === 'submitted'} />
    </>
  )
}

// ═══════════════════════════════════════════════
// Multimodel Response Card Component
// ═══════════════════════════════════════════════
function MultimodelCard({
  response,
  isWinner,
  winnerReason,
}: {
  response: MultimodelResponse
  isWinner: boolean
  winnerReason?: string
}) {
  const [expanded, setExpanded] = useState(isWinner)
  const modelName = response.model.split('/')[1] || response.model
  const score = response.score != null && response.score > 0 ? (response.score * 100).toFixed(0) : '—'

  return (
    <div
      className={`rounded-xl border transition ${
        isWinner
          ? 'border-amber-400 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-950/20 ring-1 ring-amber-200 dark:ring-amber-800'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
      }`}
    >
      {/* Card header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          {isWinner && <Trophy className="w-4 h-4 text-amber-500" />}
          <span className={`text-sm font-semibold ${isWinner ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-white'}`}>
            {modelName}
          </span>
          {isWinner && (
            <span className="text-xs px-2 py-0.5 bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded-full font-medium">
              Winner
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>Score: {score}%</span>
          <span>{response.latencyMs}ms</span>
          <span>{response.credits.toFixed(2)} cr</span>
          <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Card body */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
          {isWinner && winnerReason && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-3 italic">
              {winnerReason}
            </p>
          )}
          <ChatMessage
            id={response.messageId}
            role="assistant"
            content={response.content}
            modelUsed={response.model}
            isStreaming={false}
            compact
          />
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════
// MCP Tool Call Card Component (inline collapsible)
// ═══════════════════════════════════════════════
function McpToolCallCard({ toolCall }: { toolCall: McpToolCallEvent }) {
  const [expanded, setExpanded] = useState(false)
  const isLoading = !toolCall.status
  const isError = toolCall.status === 'error'
  const isSuccess = toolCall.status === 'success'

  return (
    <div
      className={`rounded-lg border transition text-sm ${
        isError
          ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/20'
          : isLoading
          ? 'border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-950/20'
          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          {isLoading && <Loader2 className="w-3.5 h-3.5 text-cyan-500 animate-spin" />}
          {isSuccess && <Check className="w-3.5 h-3.5 text-emerald-500" />}
          {isError && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
          <span className="font-mono text-xs text-gray-600 dark:text-gray-300">
            {toolCall.server}.{toolCall.tool}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {toolCall.durationMs != null && <span>{toolCall.durationMs}ms</span>}
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-700 pt-2 space-y-2">
          {/* Args */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Arguments</p>
            <pre className="text-xs bg-white dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-32 text-gray-700 dark:text-gray-300">
              {JSON.stringify(toolCall.args, null, 2)}
            </pre>
          </div>
          {/* Result */}
          {toolCall.result && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Result</p>
              <pre className="text-xs bg-white dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-48 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {toolCall.result.slice(0, 2000)}
                {toolCall.result.length > 2000 && '...'}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
