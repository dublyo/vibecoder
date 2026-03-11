/**
 * AI helpers for the research pipeline using OpenRouter
 */

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface LLMResponse {
  text: string
  inputTokens: number
  outputTokens: number
}

async function callLLM(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  options: { temperature?: number; maxTokens?: number; retries?: number } = {},
): Promise<LLMResponse> {
  const maxRetries = options.retries ?? 2
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[research-ai] Retry ${attempt}/${maxRetries} for model ${model}`)
        await new Promise(r => setTimeout(r, 2000 * attempt))
      }

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://vibecode.new',
          'X-Title': 'VibeCoder Research',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 2048,
        }),
        signal: AbortSignal.timeout(90000),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`LLM error (${res.status}): ${errText.slice(0, 200)}`)
      }

      const data = await res.json()
      const choice = data.choices?.[0]
      const usage = data.usage || {}

      return {
        text: choice?.message?.content || '',
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
      }
    } catch (err) {
      lastError = err as Error
      const isTimeout = lastError.message.includes('timeout') || lastError.message.includes('aborted')
      if (!isTimeout || attempt >= maxRetries) throw lastError
    }
  }

  throw lastError!
}

/**
 * Generate an adaptive clarifying question with 4 multiple-choice options.
 * Called 3 times iteratively — each call sees the previous answers for context.
 * On step 3, also returns a refined research summary.
 */
export async function generateClarifyingQuestion(
  query: string,
  step: number,
  previousAnswers: Array<{ question: string; answer: string }>,
  model: string,
  apiKey: string,
): Promise<{ question: string; choices: string[]; summary?: string; inputTokens: number; outputTokens: number }> {
  const previousContext = previousAnswers.length > 0
    ? `\n\nPrevious clarifications:\n${previousAnswers.map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer}`).join('\n\n')}`
    : ''

  const isLastStep = step === 3

  const result = await callLLM(
    model,
    [
      {
        role: 'system',
        content: `You are a research clarification assistant. Your job is to ask focused questions that help narrow down and deepen a research query before web research begins.

You are on step ${step} of 3.

${step === 1 ? 'Step 1: Ask about the ANGLE or PERSPECTIVE — what direction should the research take? (e.g., technical vs business, beginner vs expert, historical vs current)' : ''}
${step === 2 ? 'Step 2: Ask about the SPECIFIC SCOPE — what particular aspect or sub-topic matters most? Base this on the user\'s previous answer.' : ''}
${step === 3 ? 'Step 3: Ask about the DESIRED OUTPUT — what kind of findings or insights matter? (e.g., data-driven analysis, practical how-to, comparison, case studies). Base this on all previous answers.' : ''}

Rules:
- Generate exactly 1 question and exactly 4 concise multiple-choice options
- Each option should be meaningfully different (not overlapping)
- Options should be 5-15 words each
- The question should be specific to the user's topic, not generic
- Make options feel natural and helpful, not academic${isLastStep ? '\n- Also generate a 1-2 sentence "summary" field that captures the refined research direction based on the original query + all answers' : ''}

Return ONLY valid JSON in this exact format:
${isLastStep
  ? '{"question": "...", "choices": ["A", "B", "C", "D"], "summary": "..."}'
  : '{"question": "...", "choices": ["A", "B", "C", "D"]}'}`,
      },
      {
        role: 'user',
        content: `Research query: "${query}"${previousContext}`,
      },
    ],
    apiKey,
    { temperature: 0.5, maxTokens: 512 },
  )

  // Parse JSON response
  const jsonMatch = result.text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to parse clarifying question response')
  }

  const parsed = JSON.parse(jsonMatch[0]) as { question: string; choices: string[]; summary?: string }

  if (!parsed.question || !Array.isArray(parsed.choices) || parsed.choices.length < 2) {
    throw new Error('Invalid clarifying question format')
  }

  return {
    question: parsed.question,
    choices: parsed.choices.slice(0, 4),
    summary: parsed.summary,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  }
}

/**
 * Extract search keywords from a user query using a cheap model
 */
export async function extractKeywords(
  query: string,
  count: number,
  model: string,
  apiKey: string,
): Promise<{ keywords: string[]; inputTokens: number; outputTokens: number }> {
  const result = await callLLM(
    model,
    [
      {
        role: 'system',
        content: `You are a search keyword extractor for deep web research. Given a user query, generate exactly ${count} diverse search keywords/phrases that would help find comprehensive information about the topic.

Rules:
- Each keyword should target a different angle or aspect of the topic
- Use specific, searchable phrases (2-5 words each)
- Include both broad and specific terms
- Include terms that would find recent/authoritative sources
- Return ONLY a JSON array of strings, nothing else

Example: For "What are the best practices for React performance optimization?"
["React performance optimization best practices", "React memo useMemo useCallback guide", "React rendering performance 2025", "virtual DOM optimization techniques", "React lazy loading code splitting"]`,
      },
      { role: 'user', content: query },
    ],
    apiKey,
    { temperature: 0.4, maxTokens: 512 },
  )

  // Parse the JSON array from the response
  const match = result.text.match(/\[[\s\S]*\]/)
  if (!match) {
    // Fallback: split by newlines/commas
    const fallback = result.text
      .split(/[\n,]/)
      .map(s => s.replace(/^[\s\-*"]+|[\s"]+$/g, '').trim())
      .filter(s => s.length > 2)
      .slice(0, count)
    return { keywords: fallback.length > 0 ? fallback : [query], inputTokens: result.inputTokens, outputTokens: result.outputTokens }
  }

  try {
    const keywords = JSON.parse(match[0]) as string[]
    return {
      keywords: keywords.slice(0, count),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    }
  } catch {
    return { keywords: [query], inputTokens: result.inputTokens, outputTokens: result.outputTokens }
  }
}

/**
 * Summarize a single crawled page using a cheap model
 */
export async function summarizePage(
  pageContent: string,
  pageTitle: string,
  pageUrl: string,
  originalQuery: string,
  model: string,
  apiKey: string,
): Promise<{ summary: string; inputTokens: number; outputTokens: number }> {
  const result = await callLLM(
    model,
    [
      {
        role: 'system',
        content: `You are a research assistant. Summarize the following web page content as it relates to the research query.
Focus on extracting key facts, data points, expert opinions, and actionable insights.
Be concise but thorough. Include specific numbers, dates, and names when relevant.
If the content is not relevant to the query, say "Not relevant to query."
Max 300 words.`,
      },
      {
        role: 'user',
        content: `Research query: "${originalQuery}"

Page: ${pageTitle}
URL: ${pageUrl}

Content:
${pageContent.slice(0, 6000)}`,
      },
    ],
    apiKey,
    { temperature: 0.2, maxTokens: 1024 },
  )

  return { summary: result.text, inputTokens: result.inputTokens, outputTokens: result.outputTokens }
}

/**
 * Synthesize all summaries into a final research report using the maestro model
 */
export async function synthesizeReport(
  originalQuery: string,
  summaries: Array<{ url: string; title: string; summary: string }>,
  model: string,
  apiKey: string,
): Promise<{ report: string; inputTokens: number; outputTokens: number }> {
  const sourcesBlock = summaries
    .map((s, i) => `### Source ${i + 1}: ${s.title}\nURL: ${s.url}\n\n${s.summary}`)
    .join('\n\n---\n\n')

  const result = await callLLM(
    model,
    [
      {
        role: 'system',
        content: `You are a world-class research analyst. Write a comprehensive, well-structured research report based on the provided source summaries.

Requirements:
1. Start with a clear executive summary (2-3 sentences)
2. Organize findings into logical sections with clear headings (## headings)
3. For EVERY claim or finding, cite the source using [Source N] format where N is the source number
4. Include specific data points, statistics, and expert quotes when available
5. End with a "Key Takeaways" section with 3-5 bullet points
6. End with a "Sources" section listing all URLs used

Format the report in clean markdown. Be thorough but avoid redundancy.
If sources conflict, note the disagreement and present both perspectives.`,
      },
      {
        role: 'user',
        content: `Research Query: "${originalQuery}"

I have gathered information from ${summaries.length} sources. Please synthesize these into a comprehensive research report.

${sourcesBlock}`,
      },
    ],
    apiKey,
    { temperature: 0.3, maxTokens: 4096 },
  )

  return { report: result.text, inputTokens: result.inputTokens, outputTokens: result.outputTokens }
}
