// Simple in-memory rate limiter (no external deps)
// For production with multiple instances, swap to Redis-based

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key)
  }
}, 5 * 60 * 1000)

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

export const RATE_LIMITS = {
  login: { maxRequests: 5, windowMs: 15 * 60 * 1000 } as RateLimitConfig,     // 5 per 15 min
  setup: { maxRequests: 3, windowMs: 15 * 60 * 1000 } as RateLimitConfig,     // 3 per 15 min
  chat: { maxRequests: 30, windowMs: 60 * 1000 } as RateLimitConfig,          // 30 per min
  multimodel: { maxRequests: 5, windowMs: 60 * 1000 } as RateLimitConfig,     // 5 per min
  skillInstall: { maxRequests: 10, windowMs: 60 * 1000 } as RateLimitConfig,  // 10 per min
  api: { maxRequests: 60, windowMs: 60 * 1000 } as RateLimitConfig,           // 60 per min (default)
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + config.windowMs })
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs }
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt }
}

export function rateLimitResponse(resetAt: number) {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000)
  return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfter),
    },
  })
}
