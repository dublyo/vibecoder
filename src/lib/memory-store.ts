import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { prisma } from './db'

// Persistent cross-conversation memory system
// Extracts facts/preferences from conversations, injects into system prompts
// Inspired by ChatGPT/Claude memory + MemGPT + LangChain semantic memory

const EXTRACTION_MODEL = 'liquid/lfm-2-24b-a2b' // ultra-cheap, same as critic
const MAX_MEMORIES_INJECTED = 40 // max memories in system prompt
const MIN_CONFIDENCE = 0.3 // prune below this
const SIMILARITY_THRESHOLD = 0.6 // dedup threshold (word overlap)

// ═══════════════════════════════════════════════
// MEMORY EXTRACTION (async, post-stream)
// ═══════════════════════════════════════════════

const EXTRACTION_PROMPT = `You extract lasting facts about the user from conversations.
Return a JSON array of memories worth remembering across future conversations.

Each memory object: {"type": "semantic"|"episodic", "category": "<category>", "content": "<fact>"}

## Categories (pick the best fit):

**About the person:**
- personal: Name, age, location, nationality, languages spoken, timezone
- family: Family members, pets, relationships, kids
- education: Schools, degrees, certifications, learning goals
- health: Dietary preferences, allergies, fitness goals, disabilities
- interests: Hobbies, sports, music, books, movies, games, travel

**Work & professional:**
- role: Job title, profession, industry, years of experience
- organization: Company name, team, department, company size/type
- skills: Technical skills, tools, frameworks, languages, platforms
- workflow: How they work, processes, methodologies, schedules
- projects: Current/past projects, goals, deadlines, challenges

**Communication & preferences:**
- preferences: How they like answers (concise, detailed, formal, casual)
- communication_style: Language preferences, tone, formatting preferences
- goals: What they're trying to achieve, aspirations, plans
- opinions: Views on topics, likes/dislikes, values

**Context:**
- domain: Industry knowledge, business context, domain-specific terms
- tools: Software, apps, services, subscriptions they use
- general: Anything else worth remembering

## Rules:
- Extract ALL meaningful lasting facts — be thorough, not just obvious ones
- Capture specific details: names, numbers, dates, places, versions
- Extract opinions and preferences ("prefers X over Y", "dislikes Z")
- Extract goals and plans ("wants to learn X", "planning to migrate to Y")
- Extract context clues ("manages a team of 5", "works remotely")
- Skip greetings, transient questions, and small talk
- Skip anything the AI said — only extract facts ABOUT the user
- Each memory should be one specific fact (1-2 sentences max)
- Return [] if nothing worth remembering
- When in doubt, extract it — more context is better

## Examples:
- {"type":"semantic","category":"personal","content":"Name is Sarah, lives in Dubai"}
- {"type":"semantic","category":"role","content":"Marketing director at a fintech startup"}
- {"type":"semantic","category":"skills","content":"Uses Next.js 16 with Prisma and SQLite"}
- {"type":"semantic","category":"preferences","content":"Prefers concise answers without preamble"}
- {"type":"semantic","category":"organization","content":"Works at WLN, a small AI company"}
- {"type":"semantic","category":"family","content":"Has a golden retriever named Rocket"}
- {"type":"semantic","category":"goals","content":"Learning Rust for systems programming"}
- {"type":"semantic","category":"interests","content":"Enjoys hiking and photography"}
- {"type":"semantic","category":"education","content":"Has a CS degree from MIT"}
- {"type":"semantic","category":"domain","content":"Building an e-commerce platform for handmade goods"}
- {"type":"semantic","category":"tools","content":"Uses Figma for design, VS Code for coding"}
- {"type":"semantic","category":"opinions","content":"Prefers PostgreSQL over MongoDB for structured data"}
- {"type":"episodic","category":"projects","content":"Implemented conversation sharing with collaborative access"}
- {"type":"episodic","category":"workflow","content":"Previously migrated from JavaScript to TypeScript"}`

interface ExtractedMemory {
  type: string
  category: string
  content: string
}

export async function extractMemories(
  userId: string,
  userMessage: string,
  assistantResponse: string,
  conversationId: string,
  apiKey: string,
): Promise<void> {
  // Skip short/trivial messages
  if (userMessage.length < 20) return

  try {
    const openrouter = createOpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      headers: {
        'HTTP-Referer': 'https://vibecode.new',
        'X-Title': 'VibeCoder',
      },
    })

    const { text } = await generateText({
      model: openrouter.chat(EXTRACTION_MODEL),
      system: EXTRACTION_PROMPT,
      messages: [
        {
          role: 'user',
          content: `User said: "${userMessage.slice(0, 1000)}"\n\nAssistant responded: "${assistantResponse.slice(0, 1000)}"\n\nExtract memories about the user. Return JSON array only.`,
        },
      ],
      maxOutputTokens: 500,
    })

    // Parse extracted memories
    const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    let memories: ExtractedMemory[]
    try {
      const parsed = JSON.parse(cleaned)
      memories = Array.isArray(parsed) ? parsed : []
    } catch {
      return // unparseable, skip
    }

    if (memories.length === 0) return

    // Load existing memories for dedup
    const existing = await prisma.memory.findMany({
      where: { userId },
      select: { id: true, content: true, confidence: true },
    })

    for (const mem of memories) {
      if (!mem.content || typeof mem.content !== 'string' || mem.content.length < 5) continue

      const validTypes = ['semantic', 'episodic']
      const validCategories = [
        // About the person
        'personal', 'family', 'education', 'health', 'interests',
        // Work & professional
        'role', 'organization', 'skills', 'workflow', 'projects',
        // Communication & preferences
        'preferences', 'communication_style', 'goals', 'opinions',
        // Context
        'domain', 'tools', 'general',
        // Legacy (keep backward compat)
        'facts', 'tech_stack',
      ]
      const type = validTypes.includes(mem.type) ? mem.type : 'semantic'
      const category = validCategories.includes(mem.category) ? mem.category : 'general'

      // Check for duplicates using word overlap
      const duplicate = findDuplicate(mem.content, existing)

      if (duplicate) {
        // Bump confidence of existing memory
        await prisma.memory.update({
          where: { id: duplicate.id },
          data: {
            confidence: Math.min(1, duplicate.confidence + 0.05),
            updatedAt: new Date(),
          },
        })
      } else {
        // Create new memory
        const created = await prisma.memory.create({
          data: {
            userId,
            type,
            category,
            content: mem.content.slice(0, 500),
            source: conversationId,
            confidence: 0.8,
          },
        })
        existing.push({ id: created.id, content: created.content, confidence: 0.8 })
      }
    }

    // Prune low-confidence memories
    await prisma.memory.deleteMany({
      where: { userId, confidence: { lt: MIN_CONFIDENCE } },
    })

    console.log(`[memory] Extracted ${memories.length} memories for user ${userId}`)
  } catch (err) {
    console.error('[memory] Extraction error:', (err as Error).message)
  }
}

// ═══════════════════════════════════════════════
// MEMORY INJECTION (into system prompt)
// ═══════════════════════════════════════════════

export async function getMemoryBlock(userId: string): Promise<string> {
  const memories = await prisma.memory.findMany({
    where: { userId },
    orderBy: [
      { confidence: 'desc' },
      { accessCount: 'desc' },
      { lastUsedAt: 'desc' },
    ],
    take: MAX_MEMORIES_INJECTED,
  })

  if (memories.length === 0) return ''

  // Bump access counts
  const ids = memories.map(m => m.id)
  await prisma.memory.updateMany({
    where: { id: { in: ids } },
    data: {
      accessCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  })

  // Group by category for clean formatting
  const grouped: Record<string, string[]> = {}
  for (const m of memories) {
    const cat = m.category || 'general'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(m.content)
  }

  const lines: string[] = ['[User Memory]']
  for (const [category, items] of Object.entries(grouped)) {
    const label = category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    lines.push(`${label}:`)
    for (const item of items) {
      lines.push(`- ${item}`)
    }
  }

  return lines.join('\n')
}

// ═══════════════════════════════════════════════
// MEMORY CRUD (for API / settings UI)
// ═══════════════════════════════════════════════

export async function getUserMemories(userId: string) {
  return prisma.memory.findMany({
    where: { userId },
    orderBy: [{ category: 'asc' }, { confidence: 'desc' }],
  })
}

export async function updateMemory(id: string, userId: string, content: string) {
  return prisma.memory.updateMany({
    where: { id, userId },
    data: { content: content.slice(0, 500), updatedAt: new Date() },
  })
}

export async function deleteMemory(id: string, userId: string) {
  return prisma.memory.deleteMany({
    where: { id, userId },
  })
}

export async function deleteAllMemories(userId: string) {
  return prisma.memory.deleteMany({
    where: { userId },
  })
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function findDuplicate(
  content: string,
  existing: { id: string; content: string; confidence: number }[],
): { id: string; confidence: number } | null {
  const words = new Set(content.toLowerCase().split(/\s+/).filter(w => w.length > 2))

  for (const mem of existing) {
    const existingWords = new Set(mem.content.toLowerCase().split(/\s+/).filter(w => w.length > 2))
    const intersection = [...words].filter(w => existingWords.has(w))
    const union = new Set([...words, ...existingWords])
    const similarity = union.size > 0 ? intersection.length / union.size : 0

    if (similarity >= SIMILARITY_THRESHOLD) {
      return { id: mem.id, confidence: mem.confidence }
    }
  }

  return null
}
