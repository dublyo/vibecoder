import Redis from 'ioredis'

let redis: Redis | null = null

export function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })
    redis.on('error', (err) => {
      console.error('Redis connection error:', err.message)
    })
  }
  return redis
}

export async function cacheGet(key: string): Promise<string | null> {
  const r = getRedis()
  if (!r) return null
  try {
    return await r.get(key)
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds = 300): Promise<void> {
  const r = getRedis()
  if (!r) return
  try {
    await r.set(key, value, 'EX', ttlSeconds)
  } catch {
    // silently fail - cache is not critical
  }
}
