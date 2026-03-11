'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, BookOpen, Loader2, Trash2, FileText, ArrowLeft } from '@/components/icons'

interface Notebook {
  id: string
  title: string
  description: string | null
  createdAt: string
  updatedAt: string
  _count: { sources: number; artifacts: number; conversations: number }
}

export default function OpenBookPage() {
  const router = useRouter()
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const loadNotebooks = async () => {
    try {
      const res = await fetch('/api/openbook/notebooks')
      const data = await res.json()
      setNotebooks(data.notebooks || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadNotebooks() }, [])

  const createNotebook = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/openbook/notebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled Notebook' }),
      })
      const data = await res.json()
      if (data.notebook) {
        router.push(`/openbook/${data.notebook.id}`)
      }
    } catch {}
    setCreating(false)
  }

  const deleteNotebook = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this notebook and all its sources?')) return
    await fetch(`/api/openbook/notebooks/${id}`, { method: 'DELETE' })
    setNotebooks(prev => prev.filter(n => n.id !== id))
  }

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Link href="/vibecoder" className="p-2 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-800 transition">
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </Link>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">OpenBook</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Upload anything. Understand everything.</p>
            </div>
          </div>
          <button
            onClick={createNotebook}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            New Notebook
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {/* Empty state */}
        {!loading && notebooks.length === 0 && (
          <div className="text-center py-20">
            <BookOpen className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">No notebooks yet</h2>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">
              Create a notebook and add sources to start learning
            </p>
            <button
              onClick={createNotebook}
              disabled={creating}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition"
            >
              <Plus className="w-4 h-4" />
              Create Notebook
            </button>
          </div>
        )}

        {/* Notebook grid */}
        {!loading && notebooks.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {notebooks.map(nb => (
              <div
                key={nb.id}
                onClick={() => router.push(`/openbook/${nb.id}`)}
                className="group relative p-5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md cursor-pointer transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <FileText className="w-4.5 h-4.5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <button
                    onClick={(e) => deleteNotebook(nb.id, e)}
                    className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 opacity-0 group-hover:opacity-100 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <h3 className="font-medium text-gray-900 dark:text-white mb-1 truncate">{nb.title}</h3>
                {nb.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{nb.description}</p>
                )}

                <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                  <span>{nb._count.sources} source{nb._count.sources !== 1 ? 's' : ''}</span>
                  <span>{nb._count.artifacts} output{nb._count.artifacts !== 1 ? 's' : ''}</span>
                  <span className="ml-auto">{timeAgo(nb.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
