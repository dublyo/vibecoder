'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, BookOpen, FileText, Link, Pin, PinOff,
  Trash2, Loader2, MessageSquare, Sparkles, Headphones,
  FlipVertical, Map, GraduationCap, UploadCloud, Globe, X,
} from '@/components/icons'

interface Source {
  id: string
  type: string
  title: string
  fileName: string | null
  url: string | null
  summary: string | null
  wordCount: number
  status: string
  errorMessage: string | null
  pinned: boolean
  createdAt: string
  _count?: { chunks: number }
}

interface Artifact {
  id: string
  type: string
  title: string
  status: string
  audioUrl: string | null
  creditsUsed: number
  metadata: string | null
  createdAt: string
}

interface NotebookData {
  id: string
  title: string
  description: string | null
  sources: Source[]
  artifacts: Artifact[]
  conversations: Array<{ id: string; title: string; messageCount: number; updatedAt: string }>
  _count: { mapNodes: number; mapEdges: number }
}

const OUTPUT_TYPES = [
  { type: 'summary', label: 'Summary', icon: FileText, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400' },
  { type: 'flashcards', label: 'Flashcards', icon: FlipVertical, color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400' },
  { type: 'studyguide', label: 'Study Guide', icon: GraduationCap, color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { type: 'podcast', label: 'Podcast', icon: Headphones, color: 'text-rose-600 bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400' },
]

export default function NotebookDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [notebook, setNotebook] = useState<NotebookData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddSource, setShowAddSource] = useState(false)
  const [addingSource, setAddingSource] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState('')
  const [showPodcastOptions, setShowPodcastOptions] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadNotebook = async () => {
    try {
      const res = await fetch(`/api/openbook/notebooks/${id}`)
      const data = await res.json()
      if (data.notebook) {
        setNotebook(data.notebook)
        setTitle(data.notebook.title)
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadNotebook() }, [id])

  // Auto-poll when any source is pending/processing
  useEffect(() => {
    if (!notebook) return
    const hasProcessing = notebook.sources.some(s => s.status === 'pending' || s.status === 'processing')
    const hasGenerating = notebook.artifacts.some(a => a.status === 'pending' || a.status === 'generating')
    if (!hasProcessing && !hasGenerating) return
    const interval = setInterval(loadNotebook, 3000)
    return () => clearInterval(interval)
  }, [notebook])

  const updateTitle = async () => {
    setEditingTitle(false)
    if (!title.trim() || title === notebook?.title) return
    await fetch(`/api/openbook/notebooks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    loadNotebook()
  }

  const addTextSource = async (text: string, sourceTitle: string) => {
    setAddingSource(true)
    try {
      await fetch('/api/openbook/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notebookId: id, type: 'text', title: sourceTitle, content: text }),
      })
      setShowAddSource(false)
      loadNotebook()
    } catch {}
    setAddingSource(false)
  }

  const addUrlSource = async (url: string) => {
    setAddingSource(true)
    try {
      const res = await fetch('/api/openbook/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notebookId: id, type: 'url', url }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to add URL')
        setAddingSource(false)
        return
      }
      setShowAddSource(false)
      await loadNotebook() // Auto-poll kicks in for pending/processing
    } catch {}
    setAddingSource(false)
  }

  const addFileSource = async (file: File) => {
    setAddingSource(true)
    try {
      const formData = new FormData()
      formData.append('notebookId', id)
      formData.append('file', file)
      formData.append('title', file.name)
      await fetch('/api/openbook/sources', { method: 'POST', body: formData })
      setShowAddSource(false)
      loadNotebook()
    } catch {}
    setAddingSource(false)
  }

  const togglePin = async (sourceId: string, pinned: boolean) => {
    await fetch(`/api/openbook/sources/${sourceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !pinned }),
    })
    loadNotebook()
  }

  const deleteSource = async (sourceId: string) => {
    if (!confirm('Delete this source and all its chunks?')) return
    await fetch(`/api/openbook/sources/${sourceId}`, { method: 'DELETE' })
    loadNotebook()
  }

  const generateArtifact = async (type: string, options?: Record<string, unknown>) => {
    setGenerating(type)
    try {
      await fetch('/api/openbook/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notebookId: id, type, options }),
      })
      // Refresh to pick up pending status (auto-poll will handle the rest)
      await loadNotebook()
    } catch {}
    setGenerating(null)
  }

  const openChat = () => {
    router.push(`/openbook/${id}/chat`)
  }

  const openMindMap = () => {
    router.push(`/openbook/${id}/map`)
  }

  const openArtifact = (artifactId: string) => {
    router.push(`/openbook/${id}/artifact/${artifactId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!notebook) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500">Notebook not found</p>
      </div>
    )
  }

  const readySources = notebook.sources.filter(s => s.status === 'ready')
  const pinnedSources = notebook.sources.filter(s => s.pinned)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push('/openbook')}
            className="p-2 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-800 transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          {editingTitle ? (
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={updateTitle}
              onKeyDown={e => e.key === 'Enter' && updateTitle()}
              className="text-2xl font-semibold bg-transparent border-b-2 border-violet-500 outline-none text-gray-900 dark:text-white"
              autoFocus
            />
          ) : (
            <h1
              onClick={() => setEditingTitle(true)}
              className="text-2xl font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-violet-600 dark:hover:text-violet-400 transition"
            >
              {notebook.title}
            </h1>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={openChat}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition"
            >
              <MessageSquare className="w-4 h-4" />
              Chat
            </button>
            <button
              onClick={() => setShowAddSource(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              <Plus className="w-4 h-4" />
              Add Source
            </button>
          </div>
        </div>

        {/* Sources Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Sources
            </h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              ({pinnedSources.length} pinned, {readySources.length - pinnedSources.length} unpinned)
            </span>
          </div>

          {notebook.sources.length === 0 ? (
            <div className="p-8 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 text-center">
              <UploadCloud className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No sources yet. Add files, URLs, or text to get started.</p>
              <button
                onClick={() => setShowAddSource(true)}
                className="text-sm text-violet-600 dark:text-violet-400 font-medium hover:underline"
              >
                Add your first source
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {notebook.sources.map(src => (
                <div
                  key={src.id}
                  className={`group relative flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition ${
                    src.status === 'failed'
                      ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                      : src.status === 'pending' || src.status === 'processing'
                        ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                        : src.pinned
                          ? 'bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {src.type === 'url' ? (
                    <Globe className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  )}
                  <span className="text-gray-700 dark:text-gray-300 truncate max-w-[200px]">{src.title}</span>

                  {(src.status === 'pending' || src.status === 'processing') && (
                    <div className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                      <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                        {src.status === 'pending' ? 'Queued' : 'Processing'}
                      </span>
                    </div>
                  )}
                  {src.status === 'failed' && (
                    <span className="text-xs text-red-500 font-medium" title={src.errorMessage || 'Processing failed'}>
                      Failed
                    </span>
                  )}

                  {src.status === 'ready' && (
                    <div className="hidden group-hover:flex items-center gap-1">
                      <button
                        onClick={() => togglePin(src.id, src.pinned)}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                        title={src.pinned ? 'Unpin' : 'Pin (full context)'}
                      >
                        {src.pinned ? (
                          <PinOff className="w-3 h-3 text-violet-500" />
                        ) : (
                          <Pin className="w-3 h-3 text-gray-400" />
                        )}
                      </button>
                      <button
                        onClick={() => deleteSource(src.id)}
                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950"
                      >
                        <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Outputs Section */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Outputs
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Chat card */}
            <div
              onClick={openChat}
              className="p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm cursor-pointer transition-all"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="font-medium text-gray-900 dark:text-white text-sm">Chat</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {notebook.conversations.length > 0
                  ? `${notebook.conversations.length} conversation${notebook.conversations.length > 1 ? 's' : ''}`
                  : 'Ask questions about your sources'}
              </p>
            </div>

            {/* Generation output cards */}
            {OUTPUT_TYPES.map(out => {
              const Icon = out.icon
              const existing = notebook.artifacts.find(a => a.type === out.type && a.status === 'ready')
              const pending = notebook.artifacts.find(a => a.type === out.type && (a.status === 'pending' || a.status === 'generating'))
              const isGenerating = generating === out.type || !!pending

              return (
                <div
                  key={out.type}
                  className="p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${out.color.split(' ').slice(1).join(' ')}`}>
                        <Icon className={`w-4 h-4 ${out.color.split(' ')[0]}`} />
                      </div>
                      <span className="font-medium text-gray-900 dark:text-white text-sm">{out.label}</span>
                    </div>
                  </div>

                  {existing ? (
                    <button
                      onClick={() => openArtifact(existing.id)}
                      className="w-full mt-1 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 text-xs font-medium hover:bg-violet-100 dark:hover:bg-violet-900/40 transition"
                    >
                      View
                    </button>
                  ) : isGenerating ? (
                    <div className="flex items-center justify-center gap-2 mt-1 py-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                      <p className="text-xs text-gray-500">Generating...</p>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        if (out.type === 'podcast') {
                          setShowPodcastOptions(true)
                        } else {
                          generateArtifact(out.type)
                        }
                      }}
                      disabled={readySources.length === 0}
                      className="w-full mt-1 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      {readySources.length === 0 ? 'Add sources first' : 'Generate'}
                    </button>
                  )}
                </div>
              )
            })}

            {/* Mind Map card (special — links to map view) */}
            <div
              className="p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <Map className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <span className="font-medium text-gray-900 dark:text-white text-sm">Mind Map</span>
                </div>
              </div>
              {notebook._count.mapNodes > 0 ? (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {notebook._count.mapNodes} concepts, {notebook._count.mapEdges} connections
                  </p>
                  <button
                    onClick={openMindMap}
                    className="w-full mt-1 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 text-xs font-medium hover:bg-violet-100 dark:hover:bg-violet-900/40 transition"
                  >
                    View
                  </button>
                </div>
              ) : generating === 'mindmap' ? (
                <div className="flex items-center justify-center gap-2 mt-1 py-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                  <p className="text-xs text-gray-500">Generating...</p>
                </div>
              ) : (
                <button
                  onClick={() => generateArtifact('mindmap')}
                  disabled={readySources.length === 0}
                  className="w-full mt-1 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  {readySources.length === 0 ? 'Add sources first' : 'Generate'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Source Modal */}
      {showAddSource && (
        <AddSourceModal
          onClose={() => setShowAddSource(false)}
          onAddText={addTextSource}
          onAddUrl={addUrlSource}
          onAddFile={addFileSource}
          adding={addingSource}
          fileInputRef={fileInputRef}
        />
      )}

      {/* Podcast Options Modal */}
      {showPodcastOptions && (
        <PodcastOptionsModal
          onClose={() => setShowPodcastOptions(false)}
          onGenerate={(options) => {
            setShowPodcastOptions(false)
            generateArtifact('podcast', options)
          }}
        />
      )}
    </div>
  )
}

const AUDIENCE_LEVELS = [
  { value: 'beginner', label: 'Beginner', description: 'Simple language, analogies, sense of wonder', icon: '🌱' },
  { value: 'undergraduate', label: 'Undergraduate', description: 'Academic but accessible, Q&A dynamics', icon: '🎓' },
  { value: 'expert', label: 'Expert', description: 'Technical peer discussion, nuanced debate', icon: '🔬' },
  { value: 'executive', label: 'Executive', description: 'Bottom-line focused, strategic implications', icon: '💼' },
]

const PODCAST_LENGTHS = [
  { value: 'short', label: 'Short', description: '2-3 min' },
  { value: 'medium', label: 'Medium', description: '5-7 min' },
  { value: 'long', label: 'Long', description: '10-15 min' },
]

const OPENAI_VOICES = [
  { id: 'alloy', label: 'Alloy', desc: 'Clear, versatile', gender: 'neutral' },
  { id: 'ash', label: 'Ash', desc: 'Warm, natural', gender: 'male' },
  { id: 'coral', label: 'Coral', desc: 'Bright, expressive', gender: 'female' },
  { id: 'echo', label: 'Echo', desc: 'Warm, conversational', gender: 'male' },
  { id: 'fable', label: 'Fable', desc: 'Expressive, engaging', gender: 'female' },
  { id: 'onyx', label: 'Onyx', desc: 'Deep, authoritative', gender: 'male' },
  { id: 'nova', label: 'Nova', desc: 'Friendly, warm', gender: 'female' },
  { id: 'sage', label: 'Sage', desc: 'Calm, thoughtful', gender: 'neutral' },
  { id: 'shimmer', label: 'Shimmer', desc: 'Clear, professional', gender: 'female' },
]

const GOOGLE_VOICES = [
  { id: 'Zephyr', label: 'Zephyr', desc: 'Bright, enthusiastic', gender: 'female' },
  { id: 'Puck', label: 'Puck', desc: 'Upbeat, energetic', gender: 'male' },
  { id: 'Charon', label: 'Charon', desc: 'Deep, professional', gender: 'male' },
  { id: 'Kore', label: 'Kore', desc: 'Bright, optimistic', gender: 'female' },
  { id: 'Fenrir', label: 'Fenrir', desc: 'Warm, inquisitive', gender: 'male' },
  { id: 'Leda', label: 'Leda', desc: 'Youthful, bright', gender: 'female' },
  { id: 'Orus', label: 'Orus', desc: 'Casual, clear', gender: 'male' },
  { id: 'Aoede', label: 'Aoede', desc: 'Professional, engaging', gender: 'female' },
  { id: 'Callirrhoe', label: 'Callirrhoe', desc: 'Friendly, clear', gender: 'female' },
  { id: 'Autonoe', label: 'Autonoe', desc: 'Warm, encouraging', gender: 'female' },
  { id: 'Enceladus', label: 'Enceladus', desc: 'Confident, motivating', gender: 'male' },
  { id: 'Iapetus', label: 'Iapetus', desc: 'Confident, resonant', gender: 'male' },
  { id: 'Umbriel', label: 'Umbriel', desc: 'Resonant, inquisitive', gender: 'male' },
  { id: 'Algieba', label: 'Algieba', desc: 'Smooth, warm', gender: 'male' },
  { id: 'Despina', label: 'Despina', desc: 'Energetic, warm', gender: 'female' },
  { id: 'Erinome', label: 'Erinome', desc: 'Sophisticated, articulate', gender: 'female' },
  { id: 'Algenib', label: 'Algenib', desc: 'Smooth, calm', gender: 'male' },
  { id: 'Rasalgethi', label: 'Rasalgethi', desc: 'Energetic, clear', gender: 'male' },
  { id: 'Laomedeia', label: 'Laomedeia', desc: 'Warm, approachable', gender: 'female' },
  { id: 'Achernar', label: 'Achernar', desc: 'Warm, inviting', gender: 'female' },
  { id: 'Alnilam', label: 'Alnilam', desc: 'Energetic, optimistic', gender: 'male' },
  { id: 'Schedar', label: 'Schedar', desc: 'Casual, approachable', gender: 'male' },
  { id: 'Gacrux', label: 'Gacrux', desc: 'Warm, engaging', gender: 'female' },
  { id: 'Pulcherrima', label: 'Pulcherrima', desc: 'Energetic, youthful', gender: 'male' },
  { id: 'Achird', label: 'Achird', desc: 'Warm, professional', gender: 'male' },
  { id: 'Zubenelgenubi', label: 'Zubenelgenubi', desc: 'Deep, sophisticated', gender: 'male' },
  { id: 'Vindemiatrix', label: 'Vindemiatrix', desc: 'Gentle, smooth', gender: 'female' },
  { id: 'Sadachbia', label: 'Sadachbia', desc: 'Resonant, professional', gender: 'male' },
  { id: 'Sadaltager', label: 'Sadaltager', desc: 'Knowledgeable, calm', gender: 'male' },
  { id: 'Sulafat', label: 'Sulafat', desc: 'Warm, enthusiastic', gender: 'female' },
]

const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese',
  'Japanese', 'Chinese', 'Korean', 'Hindi', 'Arabic', 'Russian',
  'Dutch', 'Turkish', 'Polish', 'Swedish',
]

function PodcastOptionsModal({
  onClose,
  onGenerate,
}: {
  onClose: () => void
  onGenerate: (options: Record<string, unknown>) => void
}) {
  const [audienceLevel, setAudienceLevel] = useState('undergraduate')
  const [length, setLength] = useState('medium')
  const [language, setLanguage] = useState('English')
  const [ttsProvider, setTtsProvider] = useState<string>('')
  const [voice1, setVoice1] = useState('')
  const [voice2, setVoice2] = useState('')

  useEffect(() => {
    fetch('/api/openbook/settings').then(r => r.json()).then(d => {
      const p = d.ttsProvider || ''
      setTtsProvider(p)
      if (p === 'google') {
        setVoice1('Kore')
        setVoice2('Puck')
      } else {
        setVoice1('nova')
        setVoice2('echo')
      }
    }).catch(() => {})
  }, [])

  const voices = ttsProvider === 'google' ? GOOGLE_VOICES : OPENAI_VOICES

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-8" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 my-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
              <Headphones className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Generate Podcast</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Audience Level */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Audience Level
          </label>
          <div className="grid grid-cols-2 gap-2">
            {AUDIENCE_LEVELS.map(level => (
              <button
                key={level.value}
                onClick={() => setAudienceLevel(level.value)}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition ${
                  audienceLevel === level.value
                    ? 'border-rose-400 dark:border-rose-500 bg-rose-50 dark:bg-rose-950/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <span className="text-lg">{level.icon}</span>
                <div>
                  <p className={`text-xs font-medium ${
                    audienceLevel === level.value ? 'text-rose-700 dark:text-rose-300' : 'text-gray-900 dark:text-white'
                  }`}>{level.label}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">{level.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Length + Language row */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Length
            </label>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-xl p-1">
              {PODCAST_LENGTHS.map(l => (
                <button
                  key={l.value}
                  onClick={() => setLength(l.value)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${
                    length === l.value
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <div>{l.label}</div>
                  <div className="text-[10px] opacity-60">{l.description}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Language
            </label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm outline-none focus:border-rose-400"
            >
              {LANGUAGES.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Voice Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Voices
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Speaker 1 (Host)</p>
              <select
                value={voice1}
                onChange={e => setVoice1(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm outline-none focus:border-rose-400"
              >
                {voices.map(v => (
                  <option key={v.id} value={v.id}>{v.label} — {v.desc} ({v.gender})</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Speaker 2 (Guest)</p>
              <select
                value={voice2}
                onChange={e => setVoice2(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm outline-none focus:border-rose-400"
              >
                {voices.map(v => (
                  <option key={v.id} value={v.id}>{v.label} — {v.desc} ({v.gender})</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          {ttsProvider === 'google'
            ? 'Using Google Gemini TTS. 30 voices, 70+ languages.'
            : ttsProvider === 'openai'
              ? 'Using OpenAI gpt-4o-mini-tts. HD audio with natural voices.'
              : 'No TTS provider configured. Script will be generated without audio.'}
        </p>

        <button
          onClick={() => onGenerate({ audienceLevel, length, language, voice1, voice2 })}
          className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium transition"
        >
          Generate Podcast
        </button>
      </div>
    </div>
  )
}

function AddSourceModal({
  onClose, onAddText, onAddUrl, onAddFile, adding, fileInputRef,
}: {
  onClose: () => void
  onAddText: (text: string, title: string) => void
  onAddUrl: (url: string) => void
  onAddFile: (file: File) => void
  adding: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const [tab, setTab] = useState<'text' | 'url' | 'file'>('text')
  const [text, setText] = useState('')
  const [sourceTitle, setSourceTitle] = useState('')
  const [url, setUrl] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add Source</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-700/50 rounded-xl p-1">
          {(['text', 'url', 'file'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition ${
                tab === t
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}
            >
              {t === 'text' ? 'Text' : t === 'url' ? 'URL' : 'File'}
            </button>
          ))}
        </div>

        {tab === 'text' && (
          <div className="space-y-3">
            <input
              value={sourceTitle}
              onChange={e => setSourceTitle(e.target.value)}
              placeholder="Source title"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-transparent text-gray-900 dark:text-white text-sm outline-none focus:border-violet-500"
            />
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Paste your text content here..."
              rows={8}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-transparent text-gray-900 dark:text-white text-sm resize-none outline-none focus:border-violet-500"
            />
            <button
              onClick={() => onAddText(text, sourceTitle || 'Text Source')}
              disabled={!text.trim() || adding}
              className="w-full py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-gray-800 dark:hover:bg-gray-100 transition"
            >
              {adding ? 'Adding...' : 'Add Text'}
            </button>
          </div>
        )}

        {tab === 'url' && (
          <div className="space-y-3">
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-transparent text-gray-900 dark:text-white text-sm outline-none focus:border-violet-500"
              disabled={adding}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500">
              The page will be crawled and text content extracted automatically.
            </p>
            <button
              onClick={() => onAddUrl(url)}
              disabled={!url.trim() || adding}
              className="w-full py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-gray-800 dark:hover:bg-gray-100 transition"
            >
              {adding ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Adding source...
                </span>
              ) : 'Add URL'}
            </button>
          </div>
        )}

        {tab === 'file' && (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.pdf,.docx,.csv,.json"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) onAddFile(file)
              }}
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:border-violet-400 transition"
            >
              <UploadCloud className="w-8 h-8 text-gray-400 mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Click to upload a file</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">.txt, .md, .pdf, .docx, .csv, .json</p>
            </div>
            {adding && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
