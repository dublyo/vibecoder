import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma, conversationAccessWhere } from '@/lib/db'
import { getOpenRouterKey } from '@/lib/openrouter'
import { calculateCredits, deductCredits } from '@/lib/credits'
import { getMemoryBlock } from '@/lib/memory-store'
import { connectUserMcpServers, executeMcpToolCall, disconnectAll } from '@/lib/mcp-client'

const MAX_ITERATIONS = 15
const TOOL_TIMEOUT_MS = 30_000

interface ToolCallEvent {
  id: string
  server: string
  serverIcon: string
  tool: string
  args: Record<string, unknown>
  status?: 'success' | 'error'
  result?: string
  durationMs?: number
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()

  try {
    const body = await req.json()
    const { conversationId, message } = body as {
      conversationId: string
      message: string
    }

    if (!conversationId || !message?.trim()) {
      return new Response(JSON.stringify({ error: 'conversationId and message required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const [user, apiKey] = await Promise.all([requireAuth(), getOpenRouterKey()])
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OpenRouter API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const conversation = await prisma.conversation.findFirst({
      where: conversationAccessWhere(conversationId, user.id),
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })

    if (!conversation || conversation.chatType !== 'mcp') {
      return new Response(JSON.stringify({ error: 'MCP conversation not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const model = conversation.activeModel
    if (!model) {
      return new Response(JSON.stringify({ error: 'No model selected' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Save user message
    await prisma.message.create({
      data: {
        conversationId,
        userId: user.id,
        role: 'user',
        content: message,
      },
    })

    // Load memory
    const memoryBlock = await getMemoryBlock(user.id)

    // Connect to user's MCP servers
    const servers = await connectUserMcpServers(user.id)

    // Build OpenAI-compatible tool definitions
    const toolDefs: Array<{
      type: 'function'
      function: { name: string; description: string; parameters: Record<string, unknown> }
    }> = []

    for (const [, server] of servers) {
      for (const tool of server.tools) {
        toolDefs.push({
          type: 'function',
          function: {
            name: `${server.slug}__${tool.name}`,
            description: `[${server.name}] ${tool.description}`,
            parameters: tool.inputSchema,
          },
        })
      }
    }

    // Build conversation history
    const historyMessages = conversation.messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system' | 'tool',
      content: m.content,
    }))
    historyMessages.push({ role: 'user', content: message })

    const systemPrompt = [
      memoryBlock,
      'You are VibeCoder with MCP tool access. You can call tools from connected servers to help the user.',
      'When you need information or want to perform actions, use the available tools.',
      'After getting tool results, synthesize the information into a helpful response.',
      'If a tool fails, explain the error and try an alternative approach if possible.',
      toolDefs.length > 0
        ? `You have ${toolDefs.length} tools available from ${servers.size} server(s).`
        : 'No MCP servers are connected. Tell the user to install servers from the /mcp marketplace.',
    ]
      .filter(Boolean)
      .join('\n\n')

    // SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }

        let totalCredits = 0
        let totalToolCalls = 0
        let iteration = 0
        let finalTextContent = ''
        const allToolCallEvents: ToolCallEvent[] = []
        const startTime = Date.now()

        // Get budget limit (min of all active installations)
        const installations = await prisma.mcpInstallation.findMany({
          where: { userId: user.id, isActive: true },
          select: { budgetLimit: true },
        })
        const budgetLimit = installations.length > 0
          ? Math.min(...installations.map((i) => i.budgetLimit))
          : 5

        let loopMessages: Array<{
          role: string
          content: string
          tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
          tool_call_id?: string
        }> = [
          { role: 'system', content: systemPrompt },
          ...historyMessages,
        ]

        try {
          while (iteration < MAX_ITERATIONS) {
            iteration++

            // Call LLM with tools
            const llmResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://vibecode.new',
                'X-Title': 'VibeCoder',
              },
              body: JSON.stringify({
                model,
                messages: loopMessages,
                tools: toolDefs.length > 0 ? toolDefs : undefined,
                tool_choice: toolDefs.length > 0 ? 'auto' : undefined,
                temperature: 0.7,
                max_tokens: 4096,
              }),
            })

            if (!llmResponse.ok) {
              const errText = await llmResponse.text()
              send('error', { message: `LLM error: ${errText}` })
              break
            }

            const llmData = await llmResponse.json()
            const choice = llmData.choices?.[0]
            const usage = llmData.usage || {}

            // Track credits
            const inputTokens = usage.prompt_tokens || 0
            const outputTokens = usage.completion_tokens || 0
            const iterCost = calculateCredits(model, inputTokens, outputTokens)
            totalCredits += iterCost

            // Check if LLM returned tool calls
            const toolCalls = choice?.message?.tool_calls
            const finishReason = choice?.finish_reason

            if (!toolCalls || toolCalls.length === 0 || finishReason === 'stop') {
              // LLM is done — stream the final text response
              const text = choice?.message?.content || ''
              finalTextContent = text
              send('text', { content: text })
              break
            }

            // Add assistant message with tool_calls to history
            loopMessages.push({
              role: 'assistant',
              content: choice.message.content || '',
              tool_calls: toolCalls,
            })

            // Execute each tool call
            for (const tc of toolCalls) {
              const namespacedName = tc.function.name
              let args: Record<string, unknown> = {}
              try {
                args = typeof tc.function.arguments === 'string'
                  ? JSON.parse(tc.function.arguments)
                  : tc.function.arguments
              } catch {
                args = {}
              }

              // Parse server info from namespaced name
              const sepIdx = namespacedName.indexOf('__')
              const serverSlug = sepIdx >= 0 ? namespacedName.slice(0, sepIdx) : namespacedName
              const toolName = sepIdx >= 0 ? namespacedName.slice(sepIdx + 2) : namespacedName
              const server = servers.get(serverSlug)

              const tcEvent: ToolCallEvent = {
                id: tc.id,
                server: serverSlug,
                serverIcon: server?.icon || 'terminal',
                tool: toolName,
                args,
              }

              send('tool_call_start', tcEvent)
              totalToolCalls++

              const callStart = Date.now()

              // Execute with timeout
              const timeoutPromise = new Promise<{ result: string; isError: boolean }>((resolve) =>
                setTimeout(() => resolve({ result: 'Tool call timed out', isError: true }), TOOL_TIMEOUT_MS)
              )

              const { result, isError } = await Promise.race([
                executeMcpToolCall(servers, namespacedName, args),
                timeoutPromise,
              ])

              const durationMs = Date.now() - callStart

              // Truncate very long results
              const truncatedResult = result.length > 8000
                ? result.slice(0, 8000) + `\n... [truncated, ${result.length} chars total]`
                : result

              const resultEvent: ToolCallEvent = {
                ...tcEvent,
                status: isError ? 'error' : 'success',
                result: truncatedResult,
                durationMs,
              }

              send('tool_call_result', resultEvent)
              allToolCallEvents.push(resultEvent)

              // Add tool result to conversation history
              loopMessages.push({
                role: 'tool',
                content: truncatedResult,
                tool_call_id: tc.id,
              })
            }

            // Budget check
            if (totalCredits >= budgetLimit) {
              send('budget_warning', { totalCredits, budgetLimit })
              // One more call without tools to summarize
              const finalMessages = [
                ...loopMessages,
                { role: 'system', content: 'Budget limit reached. Summarize your findings and respond to the user with what you have so far. Do not call any more tools.' },
              ]

              const finalResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${apiKey}`,
                  'HTTP-Referer': 'https://vibecode.new',
                  'X-Title': 'VibeCoder',
                },
                body: JSON.stringify({
                  model,
                  messages: finalMessages,
                  temperature: 0.7,
                  max_tokens: 4096,
                }),
              })

              if (finalResp.ok) {
                const finalData = await finalResp.json()
                const budgetFinalText = finalData.choices?.[0]?.message?.content || ''
                const finalUsage = finalData.usage || {}
                totalCredits += calculateCredits(model, finalUsage.prompt_tokens || 0, finalUsage.completion_tokens || 0)
                finalTextContent = budgetFinalText
                send('text', { content: budgetFinalText })
              }
              break
            }
          }
        } catch (err) {
          send('error', { message: (err as Error).message })
        }

        // Cleanup
        await disconnectAll(servers)

        const latencyMs = Date.now() - startTime

        // Send done event
        send('mcp_done', {
          totalCredits,
          toolCalls: totalToolCalls,
          loopIterations: iteration,
          model,
          latencyMs,
        })

        // Save assistant message with tool call log
        const toolCallLog = allToolCallEvents.map((tc) => ({
          server: tc.server,
          tool: tc.tool,
          args: tc.args,
          status: tc.status,
          durationMs: tc.durationMs,
          resultPreview: tc.result?.slice(0, 200),
        }))

        await prisma.message.create({
          data: {
            conversationId,
            userId: user.id,
            role: 'assistant',
            content: finalTextContent || `[MCP Chat - ${totalToolCalls} tool calls]`,
            modelUsed: model,
            routingMode: 'mcp',
            routingTier: 'mcp',
            creditsCost: totalCredits,
            latencyMs,
            pipelineLog: JSON.stringify({
              type: 'mcp',
              toolCalls: toolCallLog,
              iterations: iteration,
              budgetLimit,
            }),
          },
        })

        await deductCredits(user.id, totalCredits, `MCP Chat: ${model}`)

        await prisma.conversation.update({
          where: { id: conversationId },
          data: {
            totalCreditsUsed: { increment: totalCredits },
            messageCount: { increment: 2 },
            updatedAt: new Date(),
            ...(conversation.messageCount === 0 ? { title: message.slice(0, 100) } : {}),
          },
        })

        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Model': model,
        'X-Chat-Type': 'mcp',
      },
    })
  } catch (err) {
    const msg = (err as Error).message
    return new Response(JSON.stringify({ error: msg }), {
      status: msg.includes('Unauthorized') || msg.includes('disabled') ? 401 : 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
