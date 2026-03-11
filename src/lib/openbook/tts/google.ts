/**
 * Google Gemini TTS provider implementation
 * Uses gemini-2.5-flash-preview-tts for high-quality speech generation
 * Returns raw PCM audio (24kHz, 16-bit, mono)
 */

import { GoogleGenAI } from '@google/genai'
import type { TTSProvider, Voice, AudioFormat } from './interface'

const VOICES: Voice[] = [
  { id: 'Zephyr', name: 'Zephyr', gender: 'female', description: 'Bright' },
  { id: 'Puck', name: 'Puck', gender: 'male', description: 'Upbeat' },
  { id: 'Charon', name: 'Charon', gender: 'male', description: 'Informative' },
  { id: 'Kore', name: 'Kore', gender: 'female', description: 'Firm' },
  { id: 'Fenrir', name: 'Fenrir', gender: 'male', description: 'Excitable' },
  { id: 'Leda', name: 'Leda', gender: 'female', description: 'Youthful' },
  { id: 'Orus', name: 'Orus', gender: 'male', description: 'Firm' },
  { id: 'Aoede', name: 'Aoede', gender: 'female', description: 'Breezy' },
  { id: 'Callirrhoe', name: 'Callirrhoe', gender: 'female', description: 'Easy-going' },
  { id: 'Autonoe', name: 'Autonoe', gender: 'female', description: 'Bright' },
  { id: 'Enceladus', name: 'Enceladus', gender: 'male', description: 'Breathy' },
  { id: 'Iapetus', name: 'Iapetus', gender: 'male', description: 'Clear' },
  { id: 'Umbriel', name: 'Umbriel', gender: 'male', description: 'Easy-going' },
  { id: 'Algieba', name: 'Algieba', gender: 'male', description: 'Smooth' },
  { id: 'Despina', name: 'Despina', gender: 'female', description: 'Smooth' },
  { id: 'Erinome', name: 'Erinome', gender: 'female', description: 'Clear' },
  { id: 'Algenib', name: 'Algenib', gender: 'male', description: 'Gravelly' },
  { id: 'Rasalgethi', name: 'Rasalgethi', gender: 'male', description: 'Informative' },
  { id: 'Laomedeia', name: 'Laomedeia', gender: 'female', description: 'Upbeat' },
  { id: 'Achernar', name: 'Achernar', gender: 'female', description: 'Soft' },
  { id: 'Alnilam', name: 'Alnilam', gender: 'male', description: 'Firm' },
  { id: 'Schedar', name: 'Schedar', gender: 'male', description: 'Even' },
  { id: 'Gacrux', name: 'Gacrux', gender: 'female', description: 'Mature' },
  { id: 'Pulcherrima', name: 'Pulcherrima', gender: 'male', description: 'Forward' },
  { id: 'Achird', name: 'Achird', gender: 'male', description: 'Friendly' },
  { id: 'Zubenelgenubi', name: 'Zubenelgenubi', gender: 'male', description: 'Casual' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix', gender: 'female', description: 'Gentle' },
  { id: 'Sadachbia', name: 'Sadachbia', gender: 'male', description: 'Lively' },
  { id: 'Sadaltager', name: 'Sadaltager', gender: 'male', description: 'Knowledgeable' },
  { id: 'Sulafat', name: 'Sulafat', gender: 'female', description: 'Warm' },
]

export { VOICES as GOOGLE_VOICES }

export class GoogleTTS implements TTSProvider {
  name = 'google'
  audioFormat: AudioFormat = 'pcm'
  private apiKey: string
  private ai: GoogleGenAI

  constructor(apiKey: string) {
    this.apiKey = apiKey
    this.ai = new GoogleGenAI({ apiKey })
  }

  /**
   * Generate speech for a single segment.
   * Returns raw PCM audio (24kHz, 16-bit, mono).
   */
  async generateSpeech(text: string, voiceId: string, language?: string): Promise<Buffer> {
    const voiceName = voiceId || 'Kore'

    // Add language hint to text if non-English
    const prompt = language && language !== 'English'
      ? `Say the following in ${language}:\n${text}`
      : text

    let response
    try {
      response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[google-tts] API error (voice=${voiceName}):`, msg)
      throw new Error(`Google TTS API error: ${msg.slice(0, 200)}`)
    }

    const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
    if (!data) {
      const raw = JSON.stringify(response.candidates?.[0]?.content?.parts?.[0] || {}).slice(0, 200)
      console.error('[google-tts] No audio data in response. Part:', raw)
      throw new Error(`Google TTS returned no audio data. Response: ${raw}`)
    }

    return Buffer.from(data, 'base64')
  }

  availableVoices(): Voice[] {
    return VOICES
  }
}

/**
 * Wrap raw PCM data in a WAV header.
 * PCM format: 24000 Hz, 16-bit, mono (Google Gemini TTS default)
 */
export function pcmToWav(pcmData: Buffer, sampleRate = 24000, channels = 1, bitDepth = 16): Buffer {
  const byteRate = sampleRate * channels * (bitDepth / 8)
  const blockAlign = channels * (bitDepth / 8)
  const dataSize = pcmData.length
  const headerSize = 44

  const header = Buffer.alloc(headerSize)
  // RIFF header
  header.write('RIFF', 0)
  header.writeUInt32LE(dataSize + headerSize - 8, 4)
  header.write('WAVE', 8)
  // fmt subchunk
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // subchunk size
  header.writeUInt16LE(1, 20)  // PCM format
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitDepth, 34)
  // data subchunk
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)

  return Buffer.concat([header, pcmData])
}
