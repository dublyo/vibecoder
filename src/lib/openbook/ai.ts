/**
 * LLM helpers for OpenBook — reuses OpenRouter API patterns from research/ai.ts
 */

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMResponse {
  text: string
  inputTokens: number
  outputTokens: number
}

export async function callLLM(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  options: { temperature?: number; maxTokens?: number; retries?: number } = {},
): Promise<LLMResponse> {
  const maxRetries = options.retries ?? 2
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, 2000 * attempt))
      }

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://vibecode.new',
          'X-Title': 'VibeCoder OpenBook',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 2048,
        }),
        signal: AbortSignal.timeout(120000),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`LLM error (${res.status}): ${errText.slice(0, 200)}`)
      }

      const data = await res.json()
      const choice = data.choices?.[0]
      const usage = data.usage || {}

      return {
        text: choice?.message?.content || '',
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
      }
    } catch (err) {
      lastError = err as Error
      const isTimeout = lastError.message.includes('timeout') || lastError.message.includes('aborted')
      if (!isTimeout || attempt >= maxRetries) throw lastError
    }
  }

  throw lastError!
}

/** Parse a JSON response from LLM, extracting the first JSON object or array */
export function parseJSON<T>(text: string): T | null {
  // Try to extract JSON from markdown code blocks first
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()) } catch {}
  }
  // Try raw JSON
  const jsonMatch = text.match(/[\[{][\s\S]*[\]}]/)
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]) } catch {}
  }
  return null
}
