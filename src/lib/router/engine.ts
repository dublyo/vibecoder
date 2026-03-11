import { classifyMessage } from './classifier'
import { getBestModelForTask, getModelTier } from './models'
import type { TaskType } from './models'

export type RoutingMode = 'economy' | 'balanced' | 'premium' | 'auto'

export interface RoutingDecision {
  model: string
  tier: 'cheap' | 'mid' | 'premium'
  taskType: TaskType
  complexity: 'simple' | 'medium' | 'complex'
  confidence: number
  reason: string
}

export function routeMessage(
  message: string,
  mode: RoutingMode = 'auto'
): RoutingDecision {
  const classification = classifyMessage(message)

  // Economy mode: always use cheapest
  if (mode === 'economy') {
    const model = getBestModelForTask(classification.taskType, 'cheap')
    return {
      model,
      tier: 'cheap',
      taskType: classification.taskType,
      complexity: classification.complexity,
      confidence: classification.confidence,
      reason: `Economy mode: using cheapest model for ${classification.taskType}`,
    }
  }

  // Premium mode: always use best
  if (mode === 'premium') {
    const model = getBestModelForTask(classification.taskType, 'premium')
    return {
      model,
      tier: 'premium',
      taskType: classification.taskType,
      complexity: classification.complexity,
      confidence: classification.confidence,
      reason: `Premium mode: using best model for ${classification.taskType}`,
    }
  }

  // Balanced mode: mid tier default, premium for complex
  if (mode === 'balanced') {
    const tier = classification.complexity === 'complex' ? 'premium' : 'mid'
    const model = getBestModelForTask(classification.taskType, tier)
    return {
      model,
      tier,
      taskType: classification.taskType,
      complexity: classification.complexity,
      confidence: classification.confidence,
      reason: `Balanced mode: ${classification.complexity} ${classification.taskType} → ${tier} tier`,
    }
  }

  // Auto mode: smart routing based on classification
  let tier: 'cheap' | 'mid' | 'premium'

  if (classification.complexity === 'simple') {
    tier = 'cheap'
  } else if (classification.complexity === 'medium') {
    // Use cheap if confidence is high, mid if uncertain
    tier = classification.confidence >= 0.75 ? 'cheap' : 'mid'
  } else {
    // Complex: use mid, only escalate to premium if confidence is low
    tier = classification.confidence >= 0.7 ? 'mid' : 'premium'
  }

  const model = getBestModelForTask(classification.taskType, tier)

  return {
    model,
    tier,
    taskType: classification.taskType,
    complexity: classification.complexity,
    confidence: classification.confidence,
    reason: `Auto: ${classification.taskType} (${classification.complexity}, confidence ${(classification.confidence * 100).toFixed(0)}%) → ${tier} tier`,
  }
}

// Build context with compression
export function buildContext(
  messages: { role: string; content: string }[],
  contextSummary: string | null,
  maxMessages = 10
): { role: string; content: string }[] {
  const context: { role: string; content: string }[] = []

  // Add summary as system context if available
  if (contextSummary) {
    context.push({
      role: 'system',
      content: `Previous conversation summary: ${contextSummary}`,
    })
  }

  // Take last N messages for hot context
  const recentMessages = messages.slice(-maxMessages)
  context.push(...recentMessages)

  return context
}
