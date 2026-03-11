// AI Complexity Classifier for VibeCoder tiered routing

import { chatCompletion, type ChatMessage } from '../openrouter'
import { getOpenRouterKey } from '../openrouter'

export interface ClassificationResult {
  tier: 'direct' | 'maestro'
  needsPlan: boolean
  confidence: number
  reasoning: string
  estimatedCredits: number
}

const CLASSIFIER_PROMPT = `You are a task complexity classifier for a vibe-coding IDE.
Given a user's coding request, classify it as:

DIRECT — Simple, single-file changes. Examples:
- "Change the button color to blue"
- "Add a margin-top of 20px to the header"
- "Fix the typo in the heading"
- "Remove the console.log"
- "Update the page title to 'My App'"
- "Add a new paragraph below the hero"

MAESTRO — Complex, multi-file or architectural changes. Examples:
- "Add user authentication with Google OAuth"
- "Create a dashboard page with charts"
- "Add a dark mode toggle"
- "Set up a REST API for todos"
- "Refactor the nav to use a sidebar layout"
- "Add a contact form with validation and email sending"

Also decide if the request needs a PLAN first. Set needsPlan=true when:
- The user is describing a NEW app/product from scratch (e.g. "build a marketplace", "create a SaaS app")
- The request involves 3+ features or pages
- It references architecture (database schema, API design, auth flow, multi-page app)
- The request is ambitious and would benefit from research + structured planning

Set needsPlan=false for:
- Incremental changes to an existing project
- Single feature additions
- Bug fixes, styling changes, refactoring

Respond with JSON only: { "tier": "direct"|"maestro", "needsPlan": true|false, "confidence": 0.0-1.0, "reasoning": "brief reason" }`

export async function classifyMessage(message: string): Promise<ClassificationResult> {
  const apiKey = await getOpenRouterKey()
  if (!apiKey) throw new Error('OpenRouter API key not configured')

  const messages: ChatMessage[] = [
    { role: 'system', content: CLASSIFIER_PROMPT },
    { role: 'user', content: message },
  ]

  try {
    const response = await chatCompletion(
      'google/gemini-2.0-flash-001',
      messages,
      apiKey,
      { temperature: 0.1, maxTokens: 200 },
    )

    const text = response.choices[0]?.message?.content || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { tier: 'direct', needsPlan: false, confidence: 0.5, reasoning: 'Failed to parse classification', estimatedCredits: 1 }
    }

    const parsed = JSON.parse(jsonMatch[0])
    const tier = parsed.tier === 'maestro' ? 'maestro' : 'direct'
    const needsPlan = tier === 'maestro' && parsed.needsPlan === true

    // Estimate credits based on tier
    const estimatedCredits = tier === 'direct' ? 1.5 : needsPlan ? 5 : 3

    return {
      tier,
      needsPlan,
      confidence: parsed.confidence || 0.7,
      reasoning: parsed.reasoning || '',
      estimatedCredits,
    }
  } catch {
    // Default to direct on failure
    return { tier: 'direct', needsPlan: false, confidence: 0.5, reasoning: 'Classification failed, defaulting to direct', estimatedCredits: 1 }
  }
}
