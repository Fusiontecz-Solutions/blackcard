import Redis from 'ioredis';

let redisClient: Redis | null = null;

/**
 * Get Redis client. Returns null if REDIS_URL is not set or connection failed.
 */
export function getRedisClient(): Redis | null {
  return redisClient;
}

export function isRedisAvailable(): boolean {
  return redisClient !== null;
}

/**
 * Connect to Redis when REDIS_URL is set. Logs success/failure; does not crash the app.
 */
export async function testRedisConnection(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url || !url.trim()) {
    return;
  }

  try {
    const client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    client.on('error', (err) => {
      console.error('❌ Redis client error:', err.message);
    });
    client.on('connect', () => {
      console.log('✅ Redis client connected');
    });
    client.on('close', () => {
      console.warn('⚠️ Redis client connection closed');
    });

    await client.ping();
    redisClient = client;
    console.log('✅ Redis connected successfully');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Redis connection failed:', message);
    redisClient = null;
  }
}
