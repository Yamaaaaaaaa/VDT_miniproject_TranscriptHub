import { identityService } from '../services/identity.js';
import { redisService } from '../services/redis.js';
import { logger } from '../utils/logger.js';

const ROLE_CACHE_TTL = parseInt(process.env.ROLE_CACHE_TTL || '300', 10);

export async function roleMiddleware(meetingId, userId) {
  const cacheKey = `meeting:${meetingId}:user:${userId}:role`;

  const cachedRole = await redisService.get(cacheKey);
  if (cachedRole) {
    logger.debug(`[Role] Cache hit: ${cacheKey} = ${cachedRole}`);
    return cachedRole;
  }

  const role = await identityService.getMeetingRole(meetingId, userId);
  await redisService.set(cacheKey, role, ROLE_CACHE_TTL);
  logger.debug(`[Role] Cached role: ${cacheKey} = ${role}`);
  return role;
}
