'use client'

import { useState, useEffect, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import {
  ArrowLeft, Loader2, FileText, FlipVertical, GraduationCap,
  Headphones, ChevronRight, ChevronLeft, Copy, Check,
} from '@/components/icons'

interface FlashCard {
  id: string
  front: string
  back: string
  difficulty: string
  tags: string[]
}

// Shared markdown renderer for content sections
function MarkdownContent({ content }: { content: string }) {
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null)

  return (
    <div className="prose dark:prose-invert prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3">
                <table className="min-w-full border-collapse border border-gray-200 dark:border-gray-700 text-sm">
                  {children}
                </table>
              </div>
            )
          },
          th({ children }) {
            return <th className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-left font-semibold">{children}</th>
          },
          td({ children }) {
            return <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">{children}</td>
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const codeString = String(children).replace(/\n$/, '')
            const isInline = !match && !codeString.includes('\n')

            if (isInline) {
              return <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm" {...props}>{children}</code>
            }

            const blockId = `code-${codeString.slice(0, 20)}`
            return (
              <div className="relative group my-3">
                <div className="flex items-center justify-between px-4 py-2 bg-gray-800 rounded-t-lg">
                  <span className="text-xs text-gray-400">{match?.[1] || 'code'}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(codeString)
                      setCopiedBlock(blockId)
                      setTimeout(() => setCopiedBlock(null), 2000)
                    }}
                    className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                  >
                    {copiedBlock === blockId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedBlock === blockId ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <SyntaxHighlighter
                  style={oneDark}
                  language={match?.[1] || 'text'}
                  PreTag="div"
                  customStyle={{ margin: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
                >
                  {codeString}
                </SyntaxHighlighter>
              </div>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default function ArtifactView({
  params,
}: {
  params: Promise<{ id: string; artifactId: string }>
}) {
  const { id: notebookId, artifactId } = use(params)
  const router = useRouter()
  const [artifact, setArtifact] = useState<{
    id: string; type: string; title: string; content: unknown;
    metadata: unknown; audioUrl: string | null; status: string;
    creditsUsed: number
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/openbook/artifacts/${artifactId}`)
      .then(r => r.json())
      .then(d => { setArtifact(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [artifactId])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!artifact) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500">Artifact not found</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push(`/openbook/${notebookId}`)}
            className="p-2 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-800 transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{artifact.title}</h1>
        </div>

        {artifact.status !== 'ready' && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl mb-6">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Status: {artifact.status}
            </p>
          </div>
        )}

        {/* Render based on type */}
        {artifact.type === 'summary' && <SummaryView content={artifact.content} />}
        {artifact.type === 'flashcards' && <FlashcardsView content={artifact.content} />}
        {artifact.type === 'studyguide' && <StudyGuideView content={artifact.content} />}
        {artifact.type === 'podcast' && <PodcastView content={artifact.content} audioUrl={artifact.audioUrl} metadata={artifact.metadata} creditsUsed={artifact.creditsUsed} />}
      </div>
    </div>
  )
}

function SummaryView({ content }: { content: unknown }) {
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2)

  let parsed: { overview?: string; keyThemes?: string[]; connections?: string } | null = null
  try {
    parsed = typeof content === 'string' ? JSON.parse(content) : content as typeof parsed
  } catch {}

  if (parsed?.overview) {
    return (
      <div className="space-y-6">
        <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Overview</h2>
          <MarkdownContent content={parsed.overview} />
        </div>
        {parsed.keyThemes && (
          <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Key Themes</h2>
            <div className="flex flex-wrap gap-2">
              {parsed.keyThemes.map((t, i) => (
                <span key={i} className="px-3 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-full text-sm">{t}</span>
              ))}
            </div>
          </div>
        )}
        {parsed.connections && (
          <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Connections</h2>
            <MarkdownContent content={parsed.connections} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
      <MarkdownContent content={text} />
    </div>
  )
}

function FlashcardsView({ content }: { content: unknown }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [answered, setAnswered] = useState<Record<number, 'correct' | 'wrong'>>({})
  const [mode, setMode] = useState<'cards' | 'list'>('cards')

  let cards: FlashCard[] = []
  try {
    const parsed = typeof content === 'string' ? JSON.parse(content) : content
    cards = parsed?.cards || []
  } catch {}

  const goNext = useCallback(() => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(prev => prev + 1)
      setFlipped(false)
    }
  }, [currentIndex, cards.length])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
      setFlipped(false)
    }
  }, [currentIndex])

  // Keyboard navigation
  useEffect(() => {
    if (mode !== 'cards') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'j') goNext()
      else if (e.key === 'ArrowLeft' || e.key === 'k') goPrev()
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped(f => !f) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mode, goNext, goPrev])

  if (cards.length === 0) {
    return <p className="text-gray-500 text-center py-10">No flashcards generated</p>
  }

  const card = cards[currentIndex]
  const correctCount = Object.values(answered).filter(v => v === 'correct').length
  const wrongCount = Object.values(answered).filter(v => v === 'wrong').length
  const progress = ((currentIndex + 1) / cards.length) * 100

  const markAnswer = (result: 'correct' | 'wrong') => {
    setAnswered(prev => ({ ...prev, [currentIndex]: result }))
    if (currentIndex < cards.length - 1) {
      setTimeout(() => { setCurrentIndex(prev => prev + 1); setFlipped(false) }, 300)
    }
  }

  if (mode === 'list') {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">{cards.length} cards</p>
          <button
            onClick={() => setMode('cards')}
            className="px-3 py-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition"
          >
            Card View
          </button>
        </div>
        <div className="space-y-3">
          {cards.map((c, idx) => (
            <div key={idx} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex">
                <div className="flex-1 p-4 border-r border-gray-200 dark:border-gray-700">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Question</p>
                  <p className="text-sm text-gray-900 dark:text-white">{c.front}</p>
                </div>
                <div className="flex-1 p-4">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Answer</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{c.back}</p>
                </div>
              </div>
              <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2">
                {c.tags?.map((tag, i) => (
                  <span key={i} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 text-[10px] rounded-full">{tag}</span>
                ))}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  c.difficulty === 'easy' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' :
                  c.difficulty === 'hard' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                  'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                }`}>{c.difficulty}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Top bar: progress + mode toggle */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{currentIndex + 1} / {cards.length}</span>
          {(correctCount > 0 || wrongCount > 0) && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-emerald-600 dark:text-emerald-400">{correctCount} correct</span>
              <span className="text-red-500">{wrongCount} wrong</span>
            </div>
          )}
        </div>
        <button
          onClick={() => setMode('list')}
          className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
        >
          List View
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-violet-500 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Card */}
      <div
        onClick={() => setFlipped(!flipped)}
        className="cursor-pointer select-none perspective-1000"
      >
        <div className={`relative min-h-[300px] transition-transform duration-500 transform-style-preserve-3d ${flipped ? '[transform:rotateY(180deg)]' : ''}`}>
          {/* Front */}
          <div className="absolute inset-0 backface-hidden">
            <div className="h-full p-8 bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-lg flex flex-col items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-4">
                <span className="text-violet-600 dark:text-violet-400 font-bold text-sm">Q</span>
              </div>
              <p className="text-lg text-gray-900 dark:text-white text-center leading-relaxed max-w-md">
                {card.front}
              </p>
              <div className="mt-6 flex items-center gap-2">
                {card.tags?.map((tag, i) => (
                  <span key={i} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 text-xs rounded-full">{tag}</span>
                ))}
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  card.difficulty === 'easy' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' :
                  card.difficulty === 'hard' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                  'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                }`}>{card.difficulty}</span>
              </div>
              <p className="text-xs text-gray-400 mt-4">Click or press Space to flip</p>
            </div>
          </div>

          {/* Back */}
          <div className="absolute inset-0 backface-hidden [transform:rotateY(180deg)]">
            <div className="h-full p-8 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/20 dark:to-gray-800 rounded-2xl border-2 border-violet-200 dark:border-violet-800 shadow-lg flex flex-col items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center mb-4">
                <span className="text-white font-bold text-sm">A</span>
              </div>
              <p className="text-lg text-gray-900 dark:text-white text-center leading-relaxed max-w-md">
                {card.back}
              </p>

              {/* Self-assessment buttons */}
              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={(e) => { e.stopPropagation(); markAnswer('wrong') }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                    answered[currentIndex] === 'wrong'
                      ? 'bg-red-500 text-white'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
                  }`}
                >
                  Got it wrong
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); markAnswer('correct') }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                    answered[currentIndex] === 'correct'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
                  }`}
                >
                  Got it right
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>

        {/* Card dots */}
        <div className="flex items-center gap-1 max-w-[200px] overflow-hidden">
          {cards.map((_, idx) => (
            <button
              key={idx}
              onClick={() => { setCurrentIndex(idx); setFlipped(false) }}
              className={`w-2 h-2 rounded-full flex-shrink-0 transition-all ${
                idx === currentIndex
                  ? 'w-4 bg-violet-500'
                  : answered[idx] === 'correct'
                    ? 'bg-emerald-400'
                    : answered[idx] === 'wrong'
                      ? 'bg-red-400'
                      : 'bg-gray-300 dark:bg-gray-600'
              }`}
            />
          ))}
        </div>

        <button
          onClick={goNext}
          disabled={currentIndex >= cards.length - 1}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Keyboard hint */}
      <p className="text-center text-[11px] text-gray-400 dark:text-gray-500 mt-4">
        Use arrow keys to navigate, Space to flip
      </p>
    </div>
  )
}

function StudyGuideView({ content }: { content: unknown }) {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set())

  let guide: {
    title?: string
    sections?: Array<{ heading: string; content: string; keyTerms?: string[]; reviewQuestions?: string[] }>
    glossary?: Array<{ term: string; definition: string }>
  } | null = null

  try {
    guide = typeof content === 'string' ? JSON.parse(content) : content as typeof guide
  } catch {}

  if (!guide?.sections) {
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
    return (
      <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
        <MarkdownContent content={text} />
      </div>
    )
  }

  // Start with all sections expanded
  const isExpanded = (i: number) => expandedSections.size === 0 || expandedSections.has(i)

  const toggleSection = (i: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      // If first interaction, populate with all expanded
      if (prev.size === 0) {
        guide!.sections!.forEach((_, idx) => next.add(idx))
        next.delete(i)
      } else if (next.has(i)) {
        next.delete(i)
      } else {
        next.add(i)
      }
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* Table of Contents */}
      <div className="p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Contents</p>
        <div className="flex flex-wrap gap-2">
          {guide.sections.map((section, i) => (
            <button
              key={i}
              onClick={() => {
                const el = document.getElementById(`section-${i}`)
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="px-3 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition"
            >
              {section.heading}
            </button>
          ))}
          {guide.glossary && guide.glossary.length > 0 && (
            <button
              onClick={() => {
                const el = document.getElementById('glossary')
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="px-3 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition"
            >
              Glossary
            </button>
          )}
        </div>
      </div>

      {/* Sections */}
      {guide.sections.map((section, i) => (
        <div
          key={i}
          id={`section-${i}`}
          className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          <button
            onClick={() => toggleSection(i)}
            className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-750 transition"
          >
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{section.heading}</h2>
            <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded(i) ? 'rotate-90' : ''}`} />
          </button>

          {isExpanded(i) && (
            <div className="px-6 pb-6 -mt-2">
              {/* Main content with markdown */}
              <div className="mb-4">
                <MarkdownContent content={section.content} />
              </div>

              {section.keyTerms && section.keyTerms.length > 0 && (
                <div className="mb-4 p-3 bg-violet-50 dark:bg-violet-950/20 rounded-xl">
                  <p className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-2">Key Terms</p>
                  <div className="flex flex-wrap gap-1.5">
                    {section.keyTerms.map((t, j) => (
                      <span key={j} className="px-2.5 py-1 bg-white dark:bg-gray-800 text-violet-700 dark:text-violet-300 rounded-lg text-xs font-medium border border-violet-200 dark:border-violet-800">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {section.reviewQuestions && section.reviewQuestions.length > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-xl">
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">Review Questions</p>
                  <ul className="space-y-1.5">
                    {section.reviewQuestions.map((q, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <span className="text-amber-500 font-medium text-xs mt-0.5">{j + 1}.</span>
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Glossary */}
      {guide.glossary && guide.glossary.length > 0 && (
        <div id="glossary" className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Glossary</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {guide.glossary.map((g, i) => (
              <div key={i} className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                <dt className="text-sm font-semibold text-gray-900 dark:text-white mb-0.5">{g.term}</dt>
                <dd className="text-xs text-gray-600 dark:text-gray-400">{g.definition}</dd>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const SPEAKER_COLORS = [
  { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800', dot: 'bg-rose-500' },
  { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800', dot: 'bg-blue-500' },
]

function PodcastView({ content, audioUrl: initialAudioUrl, metadata, creditsUsed }: { content: unknown; audioUrl: string | null; metadata: unknown; creditsUsed: number }) {
  const [activeSeg, setActiveSeg] = useState(-1)
  const [editedSegments, setEditedSegments] = useState<Record<number, string>>({})
  const [editedSpeakers, setEditedSpeakers] = useState<Record<number, string>>({})
  const [generatingAudio, setGeneratingAudio] = useState(false)
  const [audioUrl, setAudioUrl] = useState(initialAudioUrl)
  const [audioError, setAudioError] = useState<string | null>(null)

  let script: {
    speakers?: Array<{ name: string; role: string; voiceId?: string }>
    segments?: Array<{ speaker: string; text: string; type: string }>
  } | null = null

  let meta: Record<string, unknown> = {}
  try {
    script = typeof content === 'string' ? JSON.parse(content) : content as typeof script
  } catch {}
  try {
    meta = typeof metadata === 'string' ? JSON.parse(metadata) : (metadata as Record<string, unknown>) || {}
  } catch {}

  const isScriptReady = !audioUrl && !!meta.scriptReady && !!script?.segments
  const hasEdits = Object.keys(editedSegments).length > 0 || Object.keys(editedSpeakers).length > 0

  const getSpeakerName = (i: number) => editedSpeakers[i] ?? script?.speakers?.[i]?.name ?? ''

  // Map original speaker name → edited name
  const speakerNameMap = () => {
    const map: Record<string, string> = {}
    script?.speakers?.forEach((s, i) => {
      if (editedSpeakers[i]) map[s.name] = editedSpeakers[i]
    })
    return map
  }

  const speakerIndex = (name: string) => {
    const idx = script?.speakers?.findIndex(s => s.name === name) ?? 0
    return Math.max(0, idx) % SPEAKER_COLORS.length
  }

  const getSegmentText = (i: number) => {
    return editedSegments[i] ?? script?.segments?.[i]?.text ?? ''
  }

  const updateSegment = (i: number, text: string) => {
    setEditedSegments(prev => ({ ...prev, [i]: text }))
  }

  const buildEditedScript = () => {
    if (!script) return ''
    const nameMap = speakerNameMap()
    const edited = {
      ...script,
      speakers: script.speakers?.map((s, i) => ({
        ...s,
        name: editedSpeakers[i] ?? s.name,
      })),
      segments: script.segments?.map((seg, i) => ({
        ...seg,
        speaker: nameMap[seg.speaker] ?? seg.speaker,
        text: editedSegments[i] ?? seg.text,
      })),
    }
    return JSON.stringify(edited)
  }

  const generateAudio = async () => {
    const artifactId = window.location.pathname.split('/').pop()
    if (!artifactId) return

    setGeneratingAudio(true)
    setAudioError(null)

    try {
      const res = await fetch('/api/openbook/generate-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artifactId,
          script: buildEditedScript(),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to start audio generation')
      }

      // Poll for completion
      const poll = async () => {
        const r = await fetch(`/api/openbook/artifacts/${artifactId}`)
        const d = await r.json()
        if (d.audioUrl) {
          setAudioUrl(d.audioUrl)
          setGeneratingAudio(false)
          return
        }
        if (d.status === 'ready' && d.errorMessage) {
          setAudioError(d.errorMessage)
          setGeneratingAudio(false)
          return
        }
        if (d.status === 'failed') {
          setAudioError(d.errorMessage || 'Audio generation failed')
          setGeneratingAudio(false)
          return
        }
      }

      // Poll at intervals
      const intervals = [3000, 6000, 10000, 15000, 20000, 30000, 45000, 60000, 90000, 120000]
      intervals.forEach(ms => setTimeout(poll, ms))
    } catch (err) {
      setAudioError((err as Error).message)
      setGeneratingAudio(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Audio Player */}
      {audioUrl && (
        <div className="p-5 bg-gradient-to-r from-rose-50 to-violet-50 dark:from-rose-950/20 dark:to-violet-950/20 rounded-2xl border border-rose-200 dark:border-rose-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center">
              <Headphones className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Podcast Audio</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {script?.segments?.length || 0} segments
                {meta.language && meta.language !== 'English' ? ` · ${meta.language as string}` : ''}
                {meta.audienceLevel ? ` · ${meta.audienceLevel as string}` : ''}
                {creditsUsed ? ` · ${creditsUsed.toFixed(1)} credits` : ''}
              </p>
            </div>
          </div>
          <audio
            controls
            src={audioUrl}
            className="w-full"
          />
        </div>
      )}

      {/* Script review banner — shown when script is ready but no audio */}
      {isScriptReady && !generatingAudio && (
        <div className="p-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-2xl border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Review Script</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Edit the transcript below if needed, then generate audio.
                {meta.inputTokens ? ` Script: ${(meta.inputTokens as number).toLocaleString()} in + ${(meta.outputTokens as number).toLocaleString()} out tokens.` : ''}
              </p>
            </div>
          </div>
          {audioError && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2 mb-2">{audioError}</p>
          )}
          <button
            onClick={generateAudio}
            className="mt-2 w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium transition"
          >
            Generate Audio{hasEdits ? ' (with edits)' : ''}
          </button>
        </div>
      )}

      {/* Generating audio progress */}
      {generatingAudio && (
        <div className="p-5 bg-gradient-to-r from-rose-50 to-violet-50 dark:from-rose-950/20 dark:to-violet-950/20 rounded-2xl border border-rose-200 dark:border-rose-800">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-rose-500" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Generating Audio...</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Synthesizing {script?.segments?.length || 0} segments. This may take a minute.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Speakers */}
      {script?.speakers && (
        <div className="flex gap-3">
          {script.speakers.map((s, i) => {
            const color = SPEAKER_COLORS[i % SPEAKER_COLORS.length]
            return (
              <div key={i} className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl ${color.bg} border ${color.border}`}>
                <div className={`w-3 h-3 rounded-full ${color.dot}`} />
                <div>
                  {isScriptReady ? (
                    <input
                      value={getSpeakerName(i)}
                      onChange={e => setEditedSpeakers(prev => ({ ...prev, [i]: e.target.value }))}
                      className={`text-sm font-medium ${color.text} bg-transparent border-0 outline-none p-0 w-28 focus:ring-0`}
                      placeholder="Speaker name"
                    />
                  ) : (
                    <p className={`text-sm font-medium ${color.text}`}>{getSpeakerName(i)}</p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400">{s.role}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Transcript — editable when no audio */}
      {script?.segments && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Transcript</h2>
            {isScriptReady && (
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Click text to edit</span>
            )}
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {script.segments.map((seg, i) => {
              const color = SPEAKER_COLORS[speakerIndex(seg.speaker)]
              const isIntroOutro = seg.type === 'intro' || seg.type === 'outro'
              const isEdited = editedSegments[i] !== undefined
              return (
                <div
                  key={i}
                  className={`flex gap-4 px-6 py-3.5 transition-colors cursor-default ${
                    activeSeg === i ? 'bg-gray-50 dark:bg-gray-750' : 'hover:bg-gray-50/50 dark:hover:bg-gray-750/50'
                  } ${isIntroOutro ? 'bg-gray-50/50 dark:bg-gray-800/50' : ''}`}
                  onMouseEnter={() => setActiveSeg(i)}
                  onMouseLeave={() => setActiveSeg(-1)}
                >
                  <div className="flex-shrink-0 pt-0.5">
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${color.dot}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold ${color.text}`}>{speakerNameMap()[seg.speaker] ?? seg.speaker}</span>
                      {isIntroOutro && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium">
                          {seg.type}
                        </span>
                      )}
                      {isEdited && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium">
                          edited
                        </span>
                      )}
                    </div>
                    {isScriptReady ? (
                      <textarea
                        value={getSegmentText(i)}
                        onChange={e => updateSegment(i, e.target.value)}
                        className="w-full text-sm text-gray-700 dark:text-gray-300 leading-relaxed bg-transparent border-0 outline-none resize-none p-0 focus:ring-0"
                        rows={Math.max(2, Math.ceil(getSegmentText(i).length / 80))}
                      />
                    ) : (
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{seg.text}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 pt-1 tabular-nums">
                    {i + 1}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Fallback for non-parsed content */}
      {!script?.segments && (
        <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <MarkdownContent content={typeof content === 'string' ? content : JSON.stringify(content, null, 2)} />
        </div>
      )}
    </div>
  )
}
