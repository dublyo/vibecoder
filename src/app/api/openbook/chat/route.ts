import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getOpenRouterKey, streamChatCompletion } from '@/lib/openrouter'
import { assembleContext } from '@/lib/openbook/context'
import { calculateCredits, deductCredits } from '@/lib/credits'

// POST /api/openbook/chat — Send message with streaming response
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const { notebookId, conversationId, message } = body as {
      notebookId: string
      conversationId?: string
      message: string
    }

    if (!notebookId || !message?.trim()) {
      return new Response(JSON.stringify({ error: 'notebookId and message required' }), { status: 400 })
    }

    const apiKey = await getOpenRouterKey()
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OpenRouter API key not configured' }), { status: 500 })
    }

    // Verify notebook ownership
    const notebook = await prisma.notebook.findFirst({
      where: { id: notebookId, userId: user.id },
    })
    if (!notebook) {
      return new Response(JSON.stringify({ error: 'Notebook not found' }), { status: 404 })
    }

    // Get or create conversation
    let convId = conversationId
    if (!convId) {
      const conv = await prisma.conversation.create({
        data: {
          userId: user.id,
          title: message.slice(0, 100),
          chatType: 'openbook',
          notebookId,
          routingMode: 'auto',
        },
      })
      convId = conv.id
    }

    // Assemble context from pinned sources + RAG
    const ctx = await assembleContext(message, notebookId, apiKey)

    // Get chat history
    const history = await prisma.message.findMany({
      where: { conversationId: convId },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: { role: true, content: true },
    })

    // Get model from settings or default
    const settings = await prisma.settings.findMany({
      where: { key: { in: ['openbook_cheap_model', 'research_cheap_model'] } },
    })
    const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]))
    const model = settingsMap.openbook_cheap_model || settingsMap.research_cheap_model || 'qwen/qwen3.5-flash-02-23'

    // Build messages
    const messages = [
      {
        role: 'system' as const,
        content: `You are a knowledgeable research assistant helping the user understand their notebook materials. You have access to their uploaded sources.

When answering:
- Reference specific sources using [Source N] citations
- Be precise and factual based on the provided context
- If information isn't in the sources, say so clearly
- Be concise but thorough

${ctx.pinnedSourceCount > 0 ? `The user has ${ctx.pinnedSourceCount} pinned source(s) providing full context.` : ''}
${ctx.ragChunkCount > 0 ? `${ctx.ragChunkCount} relevant excerpt(s) were retrieved from unpinned sources.` : ''}

CONTEXT:
${ctx.fullContext}`,
      },
      ...history.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: message },
    ]

    // Save user message
    await prisma.message.create({
      data: {
        conversationId: convId,
        userId: user.id,
        role: 'user',
        content: message,
      },
    })

    // Stream response
    const stream = await streamChatCompletion(model, messages, apiKey, {
      temperature: 0.3,
      maxTokens: 4096,
    })

    // Collect streamed response for saving
    let fullResponse = ''
    let inputTokens = 0
    let outputTokens = 0

    const transformedStream = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk)

        // Parse SSE chunks to extract text
        const text = new TextDecoder().decode(chunk)
        const lines = text.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6))
              const delta = data.choices?.[0]?.delta?.content
              if (delta) fullResponse += delta
              if (data.usage) {
                inputTokens = data.usage.prompt_tokens || 0
                outputTokens = data.usage.completion_tokens || 0
              }
            } catch {}
          }
        }
      },
      async flush() {
        // Save assistant message after stream completes
        const credits = calculateCredits(model, inputTokens, outputTokens)
        await prisma.message.create({
          data: {
            conversationId: convId!,
            userId: user.id,
            role: 'assistant',
            content: fullResponse,
            modelUsed: model,
            routingMode: 'openbook',
            routingTier: 'openbook',
            inputTokens,
            outputTokens,
            creditsCost: credits,
          },
        })

        await prisma.conversation.update({
          where: { id: convId! },
          data: {
            messageCount: { increment: 2 },
            totalCreditsUsed: { increment: credits },
            updatedAt: new Date(),
          },
        })

        if (credits > 0) {
          await deductCredits(user.id, credits, `OpenBook chat: ${model}`)
        }
      },
    })

    const responseStream = stream.pipeThrough(transformedStream)

    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Conversation-Id': convId,
      },
    })
  } catch (err) {
    const msg = (err as Error).message
    return new Response(JSON.stringify({ error: msg }), {
      status: msg.includes('Unauthorized') ? 401 : 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
