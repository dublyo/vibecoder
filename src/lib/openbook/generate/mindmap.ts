/**
 * Mind map generation: extract concepts from sources, build evolving knowledge graph
 */

import { prisma } from '@/lib/db'
import { callLLM, parseJSON } from '../ai'
import { calculateCredits } from '@/lib/credits'
import { cosineSimilarity, generateEmbedding } from '../embeddings'

interface ConceptNode {
  label: string
  description: string
  level: number // 0=theme, 1=concept, 2=detail
  sourceIds: string[]
}

interface ConceptEdge {
  from: string // label
  to: string   // label
  type: 'supports' | 'contradicts' | 'extends' | 'examples'
}

interface ExtractedConcepts {
  nodes: ConceptNode[]
  edges: ConceptEdge[]
}

export async function generateMindMap(
  notebookId: string,
  model: string,
  apiKey: string,
  onProgress: (p: { stage: string; message: string; progress: number }) => Promise<void>,
): Promise<{ content: string; metadata?: string; credits: number }> {
  let totalCredits = 0

  await onProgress({ stage: 'generating', message: 'Analyzing sources for concepts...', progress: 10 })

  const sources = await prisma.notebookSource.findMany({
    where: { notebookId, status: 'ready' },
    select: { id: true, title: true, summary: true, rawContent: true },
    orderBy: { createdAt: 'asc' },
  })

  if (sources.length === 0) throw new Error('No ready sources')

  // Extract concepts from each source
  const allConcepts: ExtractedConcepts = { nodes: [], edges: [] }

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i]
    const content = src.summary || src.rawContent.slice(0, 5000)

    await onProgress({
      stage: 'extracting',
      message: `Extracting concepts from: ${src.title.slice(0, 40)}... (${i + 1}/${sources.length})`,
      progress: 10 + Math.round(((i + 1) / sources.length) * 40),
    })

    const result = await callLLM(
      model,
      [
        {
          role: 'system',
          content: `You are a knowledge graph builder. Extract key concepts and relationships from the given text.

Output JSON:
{
  "nodes": [
    {"label": "Concept Name", "description": "1-2 sentence description", "level": 0}
  ],
  "edges": [
    {"from": "Concept A", "to": "Concept B", "type": "supports|contradicts|extends|examples"}
  ]
}

Node levels:
- 0 = Theme (3-5 broad topics)
- 1 = Concept (8-15 specific ideas)
- 2 = Detail (key facts, findings)

Edge types:
- supports: A provides evidence for B
- contradicts: A conflicts with B
- extends: A builds on B
- examples: A is an instance of B

Extract 10-20 nodes and 5-15 edges.`,
        },
        {
          role: 'user',
          content: `Extract concepts from: "${src.title}"\n\n${content}`,
        },
      ],
      apiKey,
      { temperature: 0.3, maxTokens: 4096 },
    )

    totalCredits += calculateCredits(model, result.inputTokens, result.outputTokens)

    const extracted = parseJSON<ExtractedConcepts>(result.text)
    if (extracted) {
      for (const node of extracted.nodes) {
        node.sourceIds = [src.id]
      }
      allConcepts.nodes.push(...(extracted.nodes || []))
      allConcepts.edges.push(...(extracted.edges || []))
    }
  }

  // Merge phase: deduplicate nodes
  await onProgress({ stage: 'merging', message: 'Merging concepts across sources...', progress: 55 })

  // Clear existing map data
  await prisma.mapEdge.deleteMany({ where: { notebookId } })
  await prisma.mapNode.deleteMany({ where: { notebookId } })

  // Deduplicate by fuzzy label matching
  const mergedNodes: ConceptNode[] = []
  for (const node of allConcepts.nodes) {
    const existing = mergedNodes.find(n =>
      n.label.toLowerCase() === node.label.toLowerCase() ||
      n.label.toLowerCase().includes(node.label.toLowerCase()) ||
      node.label.toLowerCase().includes(n.label.toLowerCase())
    )
    if (existing) {
      // Merge source IDs
      for (const sid of node.sourceIds) {
        if (!existing.sourceIds.includes(sid)) existing.sourceIds.push(sid)
      }
      // Keep better description
      if (node.description.length > existing.description.length) {
        existing.description = node.description
      }
    } else {
      mergedNodes.push({ ...node })
    }
  }

  // Save nodes to DB
  await onProgress({ stage: 'saving', message: `Saving ${mergedNodes.length} concepts...`, progress: 70 })

  const nodeIdMap = new Map<string, string>() // label -> DB id

  for (const node of mergedNodes) {
    const created = await prisma.mapNode.create({
      data: {
        notebookId,
        label: node.label,
        description: node.description,
        level: node.level,
        sourceIds: JSON.stringify(node.sourceIds),
      },
    })
    nodeIdMap.set(node.label.toLowerCase(), created.id)
  }

  // Save edges
  await onProgress({ stage: 'saving', message: 'Saving relationships...', progress: 85 })

  for (const edge of allConcepts.edges) {
    const fromId = nodeIdMap.get(edge.from.toLowerCase())
    const toId = nodeIdMap.get(edge.to.toLowerCase())
    if (fromId && toId && fromId !== toId) {
      await prisma.mapEdge.create({
        data: {
          notebookId,
          fromId,
          toId,
          label: edge.type,
        },
      }).catch(() => {}) // skip duplicate edges
    }
  }

  await onProgress({ stage: 'ready', message: 'Mind map generated', progress: 100 })

  return {
    content: JSON.stringify({
      nodeCount: mergedNodes.length,
      edgeCount: allConcepts.edges.length,
    }),
    metadata: JSON.stringify({
      sourceCount: sources.length,
      nodeCount: mergedNodes.length,
    }),
    credits: totalCredits,
  }
}
