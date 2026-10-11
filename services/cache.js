import Redis from 'ioredis';

const TTL_SECONDS = Number(process.env.ASSISTANT_CACHE_TTL_SECONDS) || 120;

let client;
let connectPromise;

async function redisClient() {
  if (!process.env.REDIS_URL) return null;
  if (!client) {
    client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    client.on('error', (error) => {
      console.error('Redis error', error.message);
    });
  }

  if (client.status === 'wait' || client.status === 'end') {
    connectPromise = connectPromise || client.connect().catch((error) => {
      connectPromise = null;
      console.error('Redis connection failed', error.message);
      return null;
    });
    if ((await connectPromise) === null) return null;
  }

  return client.status === 'ready' ? client : null;
}

function cacheKey(userId, question) {
  return `assistant:${userId}:${question.trim().toLowerCase()}`;
}

export async function getCachedAnswer(userId, question) {
  try {
    const redis = await redisClient();
    if (!redis) return null;
    const saved = await redis.get(cacheKey(userId, question));
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.error('Redis read failed', error.message);
    return null;
  }
}

export async function setCachedAnswer(userId, question, answer) {
  try {
    const redis = await redisClient();
    if (!redis) return;
    await redis.set(cacheKey(userId, question), JSON.stringify({ answer }), 'EX', TTL_SECONDS);
  } catch (error) {
    console.error('Redis write failed', error.message);
  }
}

export async function invalidateUserCache(userId) {
  try {
    const redis = await redisClient();
    if (!redis || !userId) return;
    const pattern = `assistant:${userId}:*`;
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== '0');
  } catch (error) {
    console.error('Redis cache clear failed', error.message);
  }
}
