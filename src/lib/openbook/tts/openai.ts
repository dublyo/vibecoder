/**
 * OpenAI TTS provider implementation
 * Uses gpt-4o-mini-tts for highest quality with explicit language support
 */

import type { TTSProvider, Voice, AudioFormat } from './interface'

const VOICES: Voice[] = [
  { id: 'alloy', name: 'Alloy', gender: 'neutral', description: 'Clear, versatile' },
  { id: 'ash', name: 'Ash', gender: 'male', description: 'Warm, natural' },
  { id: 'coral', name: 'Coral', gender: 'female', description: 'Bright, expressive' },
  { id: 'echo', name: 'Echo', gender: 'male', description: 'Warm, conversational' },
  { id: 'fable', name: 'Fable', gender: 'female', description: 'Expressive, engaging' },
  { id: 'onyx', name: 'Onyx', gender: 'male', description: 'Deep, authoritative' },
  { id: 'nova', name: 'Nova', gender: 'female', description: 'Friendly, warm' },
  { id: 'sage', name: 'Sage', gender: 'neutral', description: 'Calm, thoughtful' },
  { id: 'shimmer', name: 'Shimmer', gender: 'female', description: 'Clear, professional' },
]

export { VOICES as OPENAI_VOICES }

/** ISO 639-1 language codes for OpenAI TTS */
export const LANGUAGE_CODES: Record<string, string> = {
  English: 'en',
  Spanish: 'es',
  French: 'fr',
  German: 'de',
  Italian: 'it',
  Portuguese: 'pt',
  Japanese: 'ja',
  Chinese: 'zh',
  Korean: 'ko',
  Hindi: 'hi',
  Arabic: 'ar',
  Russian: 'ru',
  Dutch: 'nl',
  Turkish: 'tr',
  Polish: 'pl',
  Swedish: 'sv',
}

export class OpenAITTS implements TTSProvider {
  name = 'openai'
  audioFormat: AudioFormat = 'mp3'
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async generateSpeech(text: string, voiceId: string, language?: string): Promise<Buffer> {
    const body: Record<string, unknown> = {
      model: 'gpt-4o-mini-tts',
      voice: voiceId || 'alloy',
      input: text,
      response_format: 'mp3',
    }

    if (language) {
      const code = LANGUAGE_CODES[language] || language
      body.language = code
    }

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI TTS error (${res.status}): ${err.slice(0, 200)}`)
    }

    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  availableVoices(): Voice[] {
    return VOICES
  }
}
