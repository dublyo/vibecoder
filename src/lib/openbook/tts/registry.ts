/**
 * TTS provider registry — resolves the active TTS provider from settings
 */

import { prisma } from '@/lib/db'
import { OpenAITTS } from './openai'
import { GoogleTTS } from './google'
import type { TTSProvider, AudioFormat } from './interface'
import type { AudienceLevel } from '../generate/podcast'

let cachedProvider: TTSProvider | null = null
let cacheTime = 0

export async function getTTSProvider(): Promise<TTSProvider | null> {
  // Only use cache if we have a valid provider and it's fresh (30s)
  if (cachedProvider && Date.now() - cacheTime < 30000) return cachedProvider

  const settings = await prisma.settings.findMany({
    where: { key: { in: ['openbook_tts_provider', 'openbook_tts_api_key', 'openbook_tts_google_api_key'] } },
  })
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]))

  const provider = map.openbook_tts_provider

  if (!provider) {
    cachedProvider = null
    return null
  }

  switch (provider) {
    case 'openai': {
      const apiKey = map.openbook_tts_api_key
      if (!apiKey) return null
      cachedProvider = new OpenAITTS(apiKey)
      cacheTime = Date.now()
      return cachedProvider
    }
    case 'google': {
      const apiKey = map.openbook_tts_google_api_key
      if (!apiKey) return null
      cachedProvider = new GoogleTTS(apiKey)
      cacheTime = Date.now()
      return cachedProvider
    }
    default:
      return null
  }
}

/**
 * Synthesize speech using the configured TTS provider
 */
export async function synthesizeSpeech(text: string, voiceId: string, language?: string): Promise<Buffer> {
  const provider = await getTTSProvider()
  if (!provider) throw new Error('TTS not configured — set provider and API key in OpenBook settings')
  return provider.generateSpeech(text, voiceId, language)
}

/**
 * Get the audio format of the active TTS provider
 */
export async function getTTSAudioFormat(): Promise<AudioFormat> {
  const provider = await getTTSProvider()
  return provider?.audioFormat || 'mp3'
}

/**
 * Voice mapping per audience level
 */
const VOICE_MAPPINGS: Record<AudienceLevel, { speaker1: string; speaker2: string }> = {
  beginner: { speaker1: 'nova', speaker2: 'echo' },
  undergraduate: { speaker1: 'alloy', speaker2: 'fable' },
  expert: { speaker1: 'onyx', speaker2: 'nova' },
  executive: { speaker1: 'onyx', speaker2: 'alloy' },
}

export function getVoiceMapping(level: AudienceLevel) {
  return VOICE_MAPPINGS[level] || VOICE_MAPPINGS.undergraduate
}
