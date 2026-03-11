/**
 * Redis pub/sub for OpenBook progress events
 * Reuses the same Redis instance pattern as research/redis.ts
 */

import IORedis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export function createOpenBookSubscriber(): IORedis {
  return new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })
}

let pubRedis: IORedis | null = null

function getPubRedis(): IORedis {
  if (!pubRedis) {
    pubRedis = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
  }
  return pubRedis
}

/**
 * Publish progress to Redis channel.
 * Key format: "source:<sourceId>" or "artifact:<artifactId>"
 */
export async function publishOpenBookProgress(key: string, data: Record<string, unknown>) {
  const r = getPubRedis()
  await r.publish(`openbook:${key}`, JSON.stringify(data))
}
