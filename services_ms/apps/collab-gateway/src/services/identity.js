import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'th_jwt_s3cr3t_k3y_x9mK2pL8qR4nW6vY1bZ5cE0aF7gH3jN';
const IDENTITY_SERVICE_URL = process.env.IDENTITY_SERVICE_URL || 'http://identity-service:3002';

/**
 * Verify JWT locally (synchronous) + optionally validate with Identity Service.
 * For production, the Identity Service token verify endpoint should be called.
 * For now we trust the JWT signature locally to avoid network dependency at handshake.
 */
export const identityService = {
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return {
        success: true,
        data: {
          id: parseInt(decoded.sub, 10),
          email: decoded.email || 'unknown',
        },
      };
    } catch (err) {
      // Fallback: try Identity Service HTTP endpoint
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(`${IDENTITY_SERVICE_URL}/auth/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (response.ok) {
          const data = await response.json();
          if (data.valid) {
            return { success: true, data: { id: data.user.id, email: data.user.email } };
          }
        }
      } catch (_) {
        // network unavailable, fall through to fail
      }
      return { success: false, error: err.message };
    }
  },

  async getMeetingRole(meetingId, userId) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(
        `${IDENTITY_SERVICE_URL}/meetings/${meetingId}/role?userId=${userId}`,
        { method: 'GET', signal: controller.signal },
      );
      clearTimeout(timeout);
      if (response.ok) {
        const data = await response.json();
        if (data.role && ['HOST', 'EDITOR', 'VIEWER'].includes(data.role)) {
          return data.role;
        }
      }
      throw new Error(`Identity service returned status ${response.status}`);
    } catch (err) {
      throw new Error(`Access Denied: Unable to verify meeting membership. Detail: ${err.message}`);
    }
  },
};
