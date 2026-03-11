/**
 * Serper.dev API client for web search
 */

export interface SerperResult {
  title: string
  link: string
  snippet: string
  position: number
  date?: string
}

export interface SerperResponse {
  searchParameters: { q: string }
  organic: SerperResult[]
  credits: number
}

export async function searchSerper(
  query: string,
  apiKey: string,
  options: { num?: number; gl?: string; hl?: string } = {},
): Promise<SerperResponse> {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      num: options.num || 10,
      gl: options.gl,
      hl: options.hl,
    }),
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) {
    throw new Error(`Serper API error: ${res.status} ${res.statusText}`)
  }

  return res.json()
}

export async function checkSerperCredits(apiKey: string): Promise<{ balance: number; rateLimit: number }> {
  const res = await fetch('https://google.serper.dev/account', {
    headers: { 'X-API-KEY': apiKey },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error('Invalid Serper API key')
  return res.json()
}
