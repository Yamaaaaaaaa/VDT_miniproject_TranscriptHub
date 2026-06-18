import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
});

redis.on('connect', () => logger.info('[Redis] Connected'));
redis.on('error', (err) => logger.error('[Redis] Error:', err.message));

export const redisService = {
  async get(key) {
    return redis.get(key);
  },

  async set(key, value, ttlSeconds) {
    return redis.set(key, value, 'EX', ttlSeconds);
  },

  async del(key) {
    return redis.del(key);
  },

  async ping() {
    return redis.ping();
  },
};

export { redis };
