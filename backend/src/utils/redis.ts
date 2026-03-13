import Redis from 'ioredis';

let redis: Redis | null = null;

export const initRedis = () => {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
  });

  redis.on('error', (err) => {
    console.error('Redis error:', err);
  });

  redis.on('connect', () => {
    console.log('✅ Connected to Redis');
  });

  return redis;
};

export const getRedis = (): Redis => {
  if (!redis) {
    return initRedis();
  }
  return redis;
};

export const closeRedis = async () => {
  if (redis) {
    await redis.quit();
    redis = null;
  }
};

// Cache keys
export const getFlagCacheKey = (environmentId: string, flagKey: string) => 
  `flag:${environmentId}:${flagKey}`;

export const getAllFlagsCacheKey = (environmentId: string) => 
  `flags:${environmentId}:all`;

export const invalidateFlagCache = async (environmentId: string, flagKey?: string) => {
  const client = getRedis();
  if (flagKey) {
    await client.del(getFlagCacheKey(environmentId, flagKey));
  }
  await client.del(getAllFlagsCacheKey(environmentId));
};
