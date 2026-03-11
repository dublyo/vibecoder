'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Map as MapIcon } from '@/components/icons'

interface MapNodeData {
  id: string
  label: string
  description: string | null
  level: number
  sourceIds: string[]
  x: number | null
  y: number | null
}

interface MapEdgeData {
  id: string
  fromId: string
  toId: string
  label: string | null
  weight: number
}

export default function MindMapView({ params }: { params: Promise<{ id: string }> }) {
  const { id: notebookId } = use(params)
  const router = useRouter()
  const [nodes, setNodes] = useState<MapNodeData[]>([])
  const [edges, setEdges] = useState<MapEdgeData[]>([])
  const [loading, setLoading] = useState(true)
  const svgRef = useRef<SVGSVGElement>(null)
  const markmapRef = useRef<unknown>(null)

  useEffect(() => {
    fetch(`/api/openbook/map/${notebookId}`)
      .then(r => r.json())
      .then(d => {
        setNodes(d.nodes || [])
        setEdges(d.edges || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [notebookId])

  useEffect(() => {
    if (nodes.length === 0 || !svgRef.current) return

    const renderMarkmap = async () => {
      const svg = svgRef.current!
      const container = svg.parentElement
      if (!container) return

      // Set explicit pixel dimensions to avoid SVGLength relative-length error
      const { width, height } = container.getBoundingClientRect()
      if (width === 0 || height === 0) return
      svg.setAttribute('width', String(width))
      svg.setAttribute('height', String(height))

      const { Transformer } = await import('markmap-lib')
      const { Markmap } = await import('markmap-view')

      const markdown = nodesToMarkdown(nodes, edges)
      const transformer = new Transformer()
      const { root } = transformer.transform(markdown)

      // Clear previous render
      svg.innerHTML = ''

      markmapRef.current = Markmap.create(svg, {
        autoFit: true,
        duration: 500,
        maxWidth: 300,
        paddingX: 16,
        spacingHorizontal: 80,
        spacingVertical: 8,
      }, root)
    }

    // Delay slightly to ensure container has layout dimensions
    const raf = requestAnimationFrame(() => renderMarkmap())
    return () => cancelAnimationFrame(raf)
  }, [nodes, edges])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
        <MapIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
        <p className="text-gray-500 mb-4">No mind map data yet. Generate one from your notebook dashboard.</p>
        <button
          onClick={() => router.push(`/openbook/${notebookId}`)}
          className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm"
        >
          Back to Notebook
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <button
          onClick={() => router.push(`/openbook/${notebookId}`)}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <MapIcon className="w-5 h-5 text-violet-600 dark:text-violet-400" />
        <h1 className="text-sm font-medium text-gray-900 dark:text-white">Mind Map</h1>
        <span className="text-xs text-gray-500">{nodes.length} concepts, {edges.length} connections</span>
      </div>

      {/* Markmap SVG */}
      <div className="flex-1 relative" style={{ minHeight: 'calc(100vh - 56px)' }}>
        <svg
          ref={svgRef}
          className="absolute inset-0"
        />
      </div>
    </div>
  )
}

/**
 * Convert MapNode/MapEdge data into a markdown hierarchy for markmap.
 * Level 0 = root themes, Level 1 = concepts, Level 2 = details.
 * Edges are shown as sub-items under their target nodes.
 */
function nodesToMarkdown(nodes: MapNodeData[], edges: MapEdgeData[]): string {
  // Build adjacency: parent -> children
  const childMap = new Map<string, MapNodeData[]>()
  const roots: MapNodeData[] = []

  // Group by level, build tree from edges
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Find which nodes are children (have incoming edges from higher-level nodes)
  const hasParent = new Set<string>()
  for (const edge of edges) {
    const from = nodeMap.get(edge.fromId)
    const to = nodeMap.get(edge.toId)
    if (from && to && from.level < to.level) {
      hasParent.add(to.id)
      if (!childMap.has(from.id)) childMap.set(from.id, [])
      childMap.get(from.id)!.push(to)
    }
  }

  // Roots are level-0 nodes, or any node without a parent
  for (const node of nodes) {
    if (node.level === 0 || !hasParent.has(node.id)) {
      roots.push(node)
    }
  }

  // If no clear hierarchy, just use level-based grouping
  if (roots.length === 0 && nodes.length > 0) {
    const l0 = nodes.filter(n => n.level === 0)
    if (l0.length > 0) {
      roots.push(...l0)
    } else {
      // Create a virtual root
      const lines: string[] = ['# Mind Map']
      for (const n of nodes) {
        const indent = '#'.repeat(Math.min(n.level + 2, 6))
        lines.push(`${indent} ${n.label}`)
        if (n.description) lines.push(`${indent}# ${n.description}`)
      }
      return lines.join('\n')
    }
  }

  const lines: string[] = []

  function renderNode(node: MapNodeData, depth: number) {
    const prefix = '#'.repeat(Math.min(depth, 6))
    lines.push(`${prefix} ${node.label}`)
    if (node.description) {
      lines.push('')
      lines.push(node.description)
      lines.push('')
    }

    const children = childMap.get(node.id) || []
    // Also add orphan nodes that connect to this node but aren't in childMap
    for (const child of children) {
      renderNode(child, depth + 1)
    }
  }

  // If single root, use it as h1
  if (roots.length === 1) {
    renderNode(roots[0], 1)
  } else {
    // Multiple roots — create a virtual root
    lines.push('# Mind Map')
    for (const root of roots) {
      renderNode(root, 2)
    }
  }

  return lines.join('\n')
}
