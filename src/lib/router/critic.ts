import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

// Critic/Verifier: A cheap LLM evaluates primary response quality
// Returns a score 0-1 and whether escalation is recommended

export interface CriticResult {
  score: number        // 0-1 quality score
  shouldEscalate: boolean
  reason: string
  latencyMs: number
}

const CRITIC_PROMPT = `You are a response quality evaluator. Rate the assistant's response on a scale of 0-10.

Criteria:
- Accuracy: Is the information correct?
- Completeness: Does it fully answer the question?
- Clarity: Is it well-structured and clear?
- Relevance: Does it stay on topic?

Respond with ONLY a JSON object, no other text:
{"score": <0-10>, "shouldEscalate": <true/false>, "reason": "<brief reason>"}`

// Ultra-cheap critic model — we use the cheapest possible model
const CRITIC_MODEL = 'liquid/lfm-2-24b-a2b'

export async function evaluateResponse(
  userMessage: string,
  assistantResponse: string,
  apiKey: string,
): Promise<CriticResult> {
  const startTime = Date.now()

  try {
    const openrouter = createOpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      headers: {
        'HTTP-Referer': 'https://vibecode.new',
        'X-Title': 'VibeCoder',
      },
    })

    const { text } = await generateText({
      model: openrouter.chat(CRITIC_MODEL),
      system: CRITIC_PROMPT,
      messages: [
        {
          role: 'user',
          content: `User asked: "${userMessage.slice(0, 500)}"\n\nAssistant responded: "${assistantResponse.slice(0, 1000)}"\n\nRate this response.`,
        },
      ],
      maxOutputTokens: 100,
    })

    const latencyMs = Date.now() - startTime

    // Parse the critic's response
    try {
      const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      const score = Math.max(0, Math.min(1, (parsed.score || 0) / 10))

      return {
        score,
        shouldEscalate: parsed.shouldEscalate === true || score < 0.5,
        reason: parsed.reason || 'No reason provided',
        latencyMs,
      }
    } catch {
      // If critic response is unparseable, assume it's fine (don't escalate on parse errors)
      return {
        score: 0.7,
        shouldEscalate: false,
        reason: 'Critic response unparseable, defaulting to pass',
        latencyMs,
      }
    }
  } catch (err) {
    // If critic call fails entirely, don't block the pipeline
    return {
      score: 0.7,
      shouldEscalate: false,
      reason: `Critic error: ${(err as Error).message}`,
      latencyMs: Date.now() - startTime,
    }
  }
}
