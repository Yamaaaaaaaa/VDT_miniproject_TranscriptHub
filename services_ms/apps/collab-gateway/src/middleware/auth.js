import { identityService } from '../services/identity.js';
import { logger } from '../utils/logger.js';

export async function authMiddleware(token) {
  if (!token) {
    return null;
  }
  const response = await identityService.verifyToken(token);
  if (!response.success) {
    logger.warn(`[Auth] Token verification failed: ${response.error}`);
    return null;
  }
  return response.data;
}
