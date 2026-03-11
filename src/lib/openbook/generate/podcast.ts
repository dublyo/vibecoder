/**
 * Adaptive podcast generation:
 * Phase 1: Script generation (structured JSON with speaker segments) — returns for user review
 * Phase 2: TTS synthesis (per segment, sequential) — triggered after user approves/edits script
 * Phase 3: Audio assembly (concatenate segments)
 */

import { prisma } from '@/lib/db'
import { callLLM } from '../ai'
import { calculateCredits } from '@/lib/credits'
import { synthesizeSpeech, getTTSAudioFormat } from '../tts/registry'
import { pcmToWav } from '../tts/google'

export type AudienceLevel = 'beginner' | 'undergraduate' | 'expert' | 'executive'
export type PodcastLength = 'short' | 'medium' | 'long'

export interface PodcastSegment {
  speaker: string
  text: string
  type: 'intro' | 'point' | 'question' | 'response' | 'outro'
}

export interface PodcastScript {
  speakers: Array<{ name: string; role: string; voiceId: string }>
  segments: PodcastSegment[]
}

export interface PodcastOptions {
  audienceLevel?: AudienceLevel
  length?: PodcastLength
  language?: string
  voice1?: string
  voice2?: string
  scriptOnly?: boolean
}

const LENGTH_CONFIG: Record<PodcastLength, { minutes: string; segments: string }> = {
  short: { minutes: '2-3', segments: '8-12' },
  medium: { minutes: '5-7', segments: '15-25' },
  long: { minutes: '10-15', segments: '30-45' },
}

const AUDIENCE_PROMPTS: Record<AudienceLevel, string> = {
  beginner: `Create a podcast for a curious beginner (like explaining to a 10-year-old).
Speakers: "Alex" (Curious Kid) and "Dr. Sam" (Patient Teacher)
Tone: Simple analogies, sense of wonder, avoid jargon. Use "Imagine..." and "It's like..." often.`,

  undergraduate: `Create a podcast for undergraduate students.
Speakers: "Jordan" (Curious Student) and "Prof. Chen" (Engaging Professor)
Tone: Academic but accessible. Include Q&A dynamics. Explain terminology when introduced.`,

  expert: `Create a podcast as a peer discussion between experts.
Speakers: "Dr. Rivera" (Researcher A) and "Dr. Park" (Researcher B)
Tone: Technical, nuanced debate. Discuss methodology, limitations, implications. Challenge each other.`,

  executive: `Create a podcast as an executive briefing.
Speakers: "Morgan" (Strategic Analyst) and "Taylor" (Executive Decision-Maker)
Tone: Bottom-line focused, strategic implications, market impact. Be concise and actionable.`,
}

/**
 * Phase 1: Generate podcast script only (no TTS).
 * Returns the script for user review/editing.
 */
export async function generatePodcast(
  notebookId: string,
  model: string,
  apiKey: string,
  options: Record<string, unknown> | undefined,
  onProgress: (p: { stage: string; message: string; progress: number }) => Promise<void>,
): Promise<{ content: string; metadata?: string; audioUrl?: string; credits: number }> {
  const audienceLevel = (options?.audienceLevel as AudienceLevel) || 'undergraduate'
  const length = (options?.length as PodcastLength) || 'medium'
  const language = (options?.language as string) || 'English'
  const voice1 = (options?.voice1 as string) || ''
  const voice2 = (options?.voice2 as string) || ''
  const lengthCfg = LENGTH_CONFIG[length]
  let totalCredits = 0

  await onProgress({ stage: 'generating', message: 'Gathering source material...', progress: 5 })

  const sources = await prisma.notebookSource.findMany({
    where: { notebookId, status: 'ready' },
    select: { title: true, summary: true, rawContent: true },
    orderBy: { createdAt: 'asc' },
  })

  if (sources.length === 0) throw new Error('No ready sources')

  const sourceBlock = sources
    .map((s, i) => {
      const content = s.summary || s.rawContent.slice(0, 4000)
      return `### Source ${i + 1}: ${s.title}\n${content}`
    })
    .join('\n\n---\n\n')

  await onProgress({ stage: 'scripting', message: 'Writing podcast script...', progress: 15 })

  const speaker1Voice = voice1 || 'nova'
  const speaker2Voice = voice2 || 'echo'

  const languageInstruction = language !== 'English'
    ? `\n\nIMPORTANT: Write the ENTIRE podcast script in ${language}. All dialogue must be in ${language}.`
    : ''

  const scriptResult = await callLLM(
    model,
    [
      {
        role: 'system',
        content: `You are an expert podcast scriptwriter who creates natural, engaging, human-like conversations.

${AUDIENCE_PROMPTS[audienceLevel]}

Write a natural, engaging podcast script (${lengthCfg.minutes} minutes when read aloud). ${lengthCfg.segments} segments total.${languageInstruction}

Output JSON:
{
  "speakers": [
    {"name": "Speaker1", "role": "their role", "voiceId": "${speaker1Voice}"},
    {"name": "Speaker2", "role": "their role", "voiceId": "${speaker2Voice}"}
  ],
  "segments": [
    {"speaker": "Speaker1", "text": "What they say...", "type": "intro"},
    {"speaker": "Speaker2", "text": "Response...", "type": "response"},
    ...
  ]
}

Rules:
- Start with a warm intro, end with a clear outro
- Cover all major topics from the sources
- Make it conversational and VERY natural — use fillers like "you know", "right", "hmm", "well" sparingly but naturally
- Include natural reactions: laughing, agreeing, expressing surprise
- Each segment should be 1-4 sentences
- Alternate speakers frequently for dynamic feel
- Add pauses and transitions between topics
- Make speakers have distinct personalities and speaking styles`,
      },
      {
        role: 'user',
        content: `Create a ${audienceLevel}-level podcast (${lengthCfg.minutes} min) about:\n\n${sourceBlock}`,
      },
    ],
    apiKey,
    { temperature: 0.7, maxTokens: length === 'long' ? 16384 : 8192 },
  )

  const inputTokens = scriptResult.inputTokens
  const outputTokens = scriptResult.outputTokens
  totalCredits += calculateCredits(model, inputTokens, outputTokens)

  await onProgress({ stage: 'scripting', message: 'Script ready for review', progress: 100 })

  let script: PodcastScript
  try {
    const parsed = JSON.parse(
      scriptResult.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    )
    script = parsed
  } catch {
    return {
      content: scriptResult.text,
      metadata: JSON.stringify({ audienceLevel, length, language, ttsSkipped: true, inputTokens, outputTokens }),
      credits: totalCredits,
    }
  }

  // Always return script only — user will review and then trigger audio generation
  return {
    content: JSON.stringify(script),
    metadata: JSON.stringify({
      audienceLevel, length, language,
      segmentCount: script.segments.length,
      speakerCount: script.speakers.length,
      hasAudio: false,
      scriptReady: true,
      inputTokens, outputTokens,
    }),
    credits: totalCredits,
  }
}

/**
 * Phase 2+3: Generate audio from an existing (possibly edited) script.
 * Called after user reviews/edits the script.
 */
export async function generatePodcastAudio(
  artifactId: string,
  notebookId: string,
  script: PodcastScript,
  language: string,
  onProgress: (p: { stage: string; message: string; progress: number }) => Promise<void>,
): Promise<{ audioUrl: string; credits: number }> {
  let totalCredits = 0

  await onProgress({ stage: 'tts', message: `Generating audio for ${script.segments.length} segments...`, progress: 5 })

  const audioBuffers: (Buffer | null)[] = new Array(script.segments.length).fill(null)
  const speaker1Voice = script.speakers[0]?.voiceId || 'nova'
  const BATCH_SIZE = 3
  let completed = 0

  for (let batchStart = 0; batchStart < script.segments.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, script.segments.length)
    const batch = script.segments.slice(batchStart, batchEnd)

    const results = await Promise.allSettled(
      batch.map(async (segment, offset) => {
        const idx = batchStart + offset
        const speaker = script.speakers.find(s => s.name === segment.speaker)
        const voiceId = speaker?.voiceId || speaker1Voice
        const audio = await synthesizeSpeech(segment.text, voiceId, language)
        return { idx, audio }
      })
    )

    for (const r of results) {
      if (r.status === 'fulfilled') {
        audioBuffers[r.value.idx] = r.value.audio
        totalCredits += 0.5
        completed++
      } else {
        console.error(`[podcast] TTS failed for batch segment:`, r.reason?.message || r.reason)
        completed++
      }
    }

    // Fail fast if first segment fails (likely config issue)
    if (batchStart === 0 && !audioBuffers[0]) {
      const firstErr = results[0]?.status === 'rejected' ? results[0].reason : 'unknown'
      const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr)
      throw new Error(`TTS failed on first segment: ${errMsg}`)
    }

    const pct = 5 + Math.round((completed / script.segments.length) * 85)
    await onProgress({ stage: 'tts', message: `Audio: ${completed}/${script.segments.length} segments`, progress: pct })
  }

  const validBuffers = audioBuffers.filter((b): b is Buffer => b !== null)
  if (validBuffers.length === 0) {
    throw new Error('No audio segments generated')
  }

  await onProgress({ stage: 'assembling', message: 'Assembling final audio...', progress: 92 })

  const audioFormat = await getTTSAudioFormat()
  let finalAudio: Buffer
  let ext: string

  if (audioFormat === 'pcm') {
    // Google TTS returns raw PCM — concat and wrap in WAV header
    finalAudio = pcmToWav(Buffer.concat(validBuffers))
    ext = 'wav'
  } else {
    // OpenAI returns MP3 — just concat
    finalAudio = Buffer.concat(validBuffers)
    ext = 'mp3'
  }

  const fileName = `podcast-${notebookId}-${Date.now()}.${ext}`
  const { writeFile, mkdir } = await import('fs/promises')
  const path = await import('path')
  const audioDir = path.join(process.cwd(), 'public', 'audio', 'podcasts')
  await mkdir(audioDir, { recursive: true })
  await writeFile(path.join(audioDir, fileName), finalAudio)

  await onProgress({ stage: 'done', message: 'Audio ready!', progress: 100 })

  return {
    audioUrl: `/audio/podcasts/${fileName}`,
    credits: totalCredits,
  }
}

async function isTTSEnabled(): Promise<boolean> {
  const setting = await prisma.settings.findUnique({
    where: { key: 'openbook_tts_provider' },
  })
  return !!setting?.value
}
