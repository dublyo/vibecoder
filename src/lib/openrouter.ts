import { prisma } from './db'

export async function getOpenRouterKey(): Promise<string | null> {
  const setting = await prisma.settings.findUnique({
    where: { key: 'openrouter_api_key' },
  })
  return setting?.value || null
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OpenRouterResponse {
  id: string
  choices: { message: { content: string }; finish_reason: string }[]
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  model: string
}

export async function chatCompletion(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  options: { stream?: boolean; temperature?: number; maxTokens?: number } = {}
): Promise<OpenRouterResponse> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://vibecode.new',
      'X-Title': 'VibeCoder',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream: false,
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`OpenRouter API error (${res.status}): ${error}`)
  }

  return res.json()
}

export async function streamChatCompletion(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://vibecode.new',
      'X-Title': 'VibeCoder',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`OpenRouter API error (${res.status}): ${error}`)
  }

  return res.body!
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    return res.ok
  } catch {
    return false
  }
}
