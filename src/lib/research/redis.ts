/**
 * Redis connection for BullMQ and research progress pub/sub
 */
import IORedis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// For pub/sub, use ioredis directly
export function createSubscriberRedis(): IORedis {
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
 * Publish research progress to Redis pub/sub channel
 */
export async function publishProgress(jobId: string, data: Record<string, unknown>) {
  const r = getPubRedis()
  await r.publish(`research:${jobId}`, JSON.stringify(data))
}
