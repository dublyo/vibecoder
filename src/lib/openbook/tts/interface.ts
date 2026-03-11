/**
 * TTS Provider interface — extensible for different TTS backends
 */

export interface Voice {
  id: string
  name: string
  gender: 'male' | 'female' | 'neutral'
  description?: string
}

export type AudioFormat = 'mp3' | 'pcm'

export interface TTSProvider {
  name: string
  /** 'mp3' for OpenAI, 'pcm' for Google (24kHz, 16-bit, mono) */
  audioFormat: AudioFormat
  generateSpeech(text: string, voiceId: string, language?: string): Promise<Buffer>
  availableVoices(): Voice[]
}
