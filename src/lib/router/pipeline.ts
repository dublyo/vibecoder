import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { classifyMessage } from './classifier'
import { getBestModelForTask } from './models'
import { evaluateResponse } from './critic'
import { buildOptimizedContext, shouldCompress, compressContext } from './memory'
import { createPipelineLog, addStep, finalizePipelineLog, type PipelineLog, type PipelineStep } from './telemetry'
import { calculateCredits, getModelContextWindow } from '@/lib/credits'
import { getModelPreferences, getPreferredModel, type ModelPreferences } from '@/lib/model-preferences'
import type { RoutingMode } from './engine'

// Pipeline v2: Stream-first architecture
// 1. ALWAYS stream cheap model immediately (user sees response fast)
// 2. After stream completes, critic evaluates quality in background
// 3. If critic fails → mark for maestro regeneration
// Simple messages skip the critic entirely (no overhead needed)

export interface PipelineResult {
  stream: ReturnType<typeof streamText>
  // Metadata about what the pipeline decided
  model: string
  tier: 'cheap' | 'mid' | 'premium'
  wasEscalated: boolean
  escalatedFrom?: string
  criticScore?: number
  pipelineLog: PipelineLog
  taskType: string
  complexity: string
  confidence: number
  // Post-stream critic config
  shouldRunCritic: boolean
}

// Escalation thresholds
const CRITIC_THRESHOLD = 0.6 // escalate if critic score below this
// Only run critic for medium/complex in auto mode — simple messages don't need quality checks
const SKIP_CRITIC_FOR = ['simple']

function createOpenRouterProvider(apiKey: string) {
  return createOpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    headers: {
      'HTTP-Referer': 'https://vibecode.new',
      'X-Title': 'VibeCoder',
    },
  })
}

function getEscalatedModel(
  currentTier: 'cheap' | 'mid' | 'premium',
  taskType: string,
  prefs: ModelPreferences,
): { model: string; tier: 'cheap' | 'mid' | 'premium' } {
  if (currentTier === 'cheap') {
    return {
      model: getPreferredModel(taskType as Parameters<typeof getBestModelForTask>[0], 'mid', prefs),
      tier: 'mid',
    }
  }
  // mid -> premium (uses maestro)
  return {
    model: prefs.maestroModel,
    tier: 'premium',
  }
}

// Estimate token count from text (rough: 1 token ~ 4 chars)
function estimateTokens(messages: { role: string; content: string }[]): number {
  return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4)
}

// Trim context to fit within model's context window, keeping most recent messages
function trimToContextWindow(
  messages: { role: string; content: string }[],
  modelId: string,
  reserveForOutput: number = 4096,
): { role: string; content: string }[] {
  const maxTokens = getModelContextWindow(modelId) - reserveForOutput
  if (maxTokens <= 0) return messages.slice(-3)

  // Always keep at least the last message
  const result: { role: string; content: string }[] = []
  let tokenCount = 0

  // Build from the end (most recent first)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = Math.ceil(messages[i].content.length / 4)
    if (tokenCount + msgTokens > maxTokens && result.length > 0) break
    result.unshift(messages[i])
    tokenCount += msgTokens
  }

  return result
}

export async function executePipeline(opts: {
  message: string
  context: { role: string; content: string }[]
  contextSummary: string | null
  routingMode: RoutingMode
  apiKey: string
  conversationId: string
  getSystemPrompt: (tier: 'cheap' | 'mid' | 'premium') => string
}): Promise<PipelineResult> {
  const { message, context, contextSummary, routingMode, apiKey, conversationId, getSystemPrompt } = opts
  const steps: PipelineStep[] = createPipelineLog()
  const openrouter = createOpenRouterProvider(apiKey)
  const pipelineStart = Date.now()

  // Load user model preferences (cached after first call)
  const prefs = await getModelPreferences()
  console.log(`[pipeline] Prefs loaded in ${Date.now() - pipelineStart}ms`)

  // ═══════════════════════════════════════════════
  // STAGE 1: Intent Classification (free, instant)
  // ═══════════════════════════════════════════════
  const classifyStart = Date.now()
  const classification = classifyMessage(message)
  addStep(steps, 'intent_classifier', {
    latencyMs: Date.now() - classifyStart,
    result: `${classification.taskType} / ${classification.complexity} / confidence=${classification.confidence}`,
  })

  // ═══════════════════════════════════════════════
  // STAGE 2: Route Selection (free, instant)
  // ═══════════════════════════════════════════════
  let tier: 'cheap' | 'mid' | 'premium'

  if (routingMode === 'economy') {
    tier = 'cheap'
  } else if (routingMode === 'premium') {
    tier = 'premium'
  } else if (routingMode === 'balanced') {
    // Balanced: cheap for simple/medium, mid only for complex
    tier = classification.complexity === 'complex' ? 'mid' : 'cheap'
  } else {
    // Auto mode: ALWAYS start cheap — let the critic/escalation handle quality
    // The whole business model is: cheap first, escalate only when needed
    if (classification.complexity === 'simple') {
      tier = 'cheap'
    } else if (classification.complexity === 'medium') {
      // Medium: cheap first, critic will evaluate and escalate if needed
      tier = 'cheap'
    } else {
      // Complex: still start cheap! The cheap coding models (qwen3-coder-next,
      // deepseek-v3) are surprisingly capable. Stream directly (no critic — too slow).
      // If quality matters, user switches to balanced/premium mode.
      tier = 'cheap'
    }
  }

  // Use user-preferred model for this task+tier
  let primaryModel = getPreferredModel(
    classification.taskType as Parameters<typeof getBestModelForTask>[0],
    tier,
    prefs,
  )

  // ═══════════════════════════════════════════════
  // STAGE 3: Memory Management + Context Window Enforcement
  // ═══════════════════════════════════════════════
  const memoryStart = Date.now()
  let optimizedContext = buildOptimizedContext(context, contextSummary, classification.taskType)

  // Trim to fit within model's context window
  const contextWindow = getModelContextWindow(primaryModel)
  const beforeTrim = optimizedContext.length
  optimizedContext = trimToContextWindow(optimizedContext, primaryModel)

  addStep(steps, 'memory_manager', {
    latencyMs: Date.now() - memoryStart,
    result: `${context.length} messages -> ${optimizedContext.length} optimized${beforeTrim !== optimizedContext.length ? ` (trimmed from ${beforeTrim} for ${contextWindow} ctx limit)` : ''} (${contextSummary ? 'with summary' : 'no summary'})`,
  })

  // Trigger async compression if needed (don't wait for it)
  shouldCompress(conversationId).then(async (needsCompress) => {
    if (needsCompress) {
      await compressContext(conversationId, apiKey)
    }
  })

  // ═══════════════════════════════════════════════
  // STAGE 4: Policy — determine if critic should run AFTER stream
  // ═══════════════════════════════════════════════
  const shouldRunCritic =
    routingMode === 'auto' &&
    !SKIP_CRITIC_FOR.includes(classification.complexity) &&
    tier !== 'premium'

  addStep(steps, 'policy_engine', {
    latencyMs: 0,
    result: shouldRunCritic
      ? `${classification.complexity}/${routingMode}: stream ${tier} first, critic runs after`
      : `${classification.complexity}/${routingMode}: stream ${tier} directly, no critic`,
  })

  // ═══════════════════════════════════════════════
  // STAGE 5: ALWAYS stream cheap model immediately
  // No more blocking generateText — user sees response fast
  // ═══════════════════════════════════════════════
  const stream = streamText({
    model: openrouter.chat(primaryModel),
    system: getSystemPrompt(tier),
    messages: optimizedContext.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    })),
  })

  addStep(steps, 'primary_executor', {
    model: primaryModel,
    latencyMs: 0,
    result: `streaming ${shouldRunCritic ? '(critic will verify after)' : '(final)'}`,
  })

  return {
    stream,
    model: primaryModel,
    tier,
    wasEscalated: false,
    shouldRunCritic,
    pipelineLog: finalizePipelineLog(steps, {
      wasEscalated: false,
      finalModel: primaryModel,
      taskType: classification.taskType,
      complexity: classification.complexity,
    }),
    taskType: classification.taskType,
    complexity: classification.complexity,
    confidence: classification.confidence,
  }
}

// ═══════════════════════════════════════════════
// Post-stream critic evaluation + maestro escalation
// Called AFTER the cheap model stream completes
// ═══════════════════════════════════════════════
export async function evaluateAndEscalate(opts: {
  messageId: string
  userMessage: string
  assistantResponse: string
  conversationId: string
  taskType: string
  currentModel: string
  currentTier: 'cheap' | 'mid' | 'premium'
  apiKey: string
}): Promise<{
  shouldEscalate: boolean
  criticScore: number
  criticReason: string
  escalatedModel?: string
  escalatedTier?: 'mid' | 'premium'
}> {
  const { userMessage, assistantResponse, currentTier, taskType, apiKey } = opts

  // Run critic
  const criticResult = await evaluateResponse(userMessage, assistantResponse, apiKey)
  console.log(`[critic] score=${criticResult.score.toFixed(2)} reason="${criticResult.reason}" for msg ${opts.messageId}`)

  const shouldEscalate = criticResult.score < CRITIC_THRESHOLD && currentTier !== 'premium'

  if (!shouldEscalate) {
    return {
      shouldEscalate: false,
      criticScore: criticResult.score,
      criticReason: criticResult.reason,
    }
  }

  // Determine escalation target
  const prefs = await getModelPreferences()
  const escalated = getEscalatedModel(currentTier, taskType, prefs)

  console.log(`[critic] ESCALATING: ${opts.currentModel} → ${escalated.model} (score ${criticResult.score.toFixed(2)} < ${CRITIC_THRESHOLD})`)

  return {
    shouldEscalate: true,
    criticScore: criticResult.score,
    criticReason: criticResult.reason,
    escalatedModel: escalated.model,
    escalatedTier: escalated.tier as 'mid' | 'premium',
  }
}
