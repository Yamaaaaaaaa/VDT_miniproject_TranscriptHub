import http from 'http';
import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';
import { authMiddleware } from './middleware/auth.js';
import { roleMiddleware } from './middleware/role.js';
import { redisService } from './services/redis.js';
import { logger } from './utils/logger.js';

const PORT = parseInt(process.env.WS_PORT || '3008', 10);
const server = http.createServer();

// Standalone WebSocket Server
const wss = new WebSocketServer({ server });

// Health check endpoint
server.on('request', (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'collab-gateway' }));
    return;
  }
});

wss.on('connection', async (conn, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  const meetingId = url.searchParams.get('meetingId');

  if (!token || !meetingId) {
    conn.close(4001, 'Missing token or meetingId');
    logger.warn('[WS] Rejected: missing token or meetingId');
    return;
  }

  try {
    // 1. Authenticate JWT
    const user = await authMiddleware(token);
    if (!user) {
      conn.close(4001, 'Unauthorized');
      return;
    }

    // 2. Get role (with Redis cache)
    const role = await roleMiddleware(meetingId, user.id);

    // 3. Attach metadata to connection
    conn.userId = user.id;
    conn.email = user.email;
    conn.role = role;
    conn.meetingId = meetingId;
    conn.isReadOnly = (role === 'VIEWER');

    // 4. setupWSConnection handles CRDT sync, awareness, room management.
    //    y-websocket/bin/utils auto-creates/loads Y.Doc per room (meetingId).
    setupWSConnection(conn, req, {
      gc: true,
      docName: meetingId,
    });

    logger.info(`[WS] User ${user.id} (${role}) joined meeting ${meetingId}`);

    // 5. Intercept incoming messages for VIEWER read-only enforcement
    const originalOnMessage = conn.on.bind(conn);
    conn.on('message', (message) => {
      if (conn.isReadOnly) {
        logger.debug(`[WS] VIEWER ${user.id} message dropped`);
        return;
      }
      // y-websocket's setupWSConnection handles all further CRDT sync internally
    });

  } catch (error) {
    logger.error(`[WS] Connection error: ${error.message}`);
    conn.close(4001, 'Authentication failed');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Collab Gateway running on ws://0.0.0.0:${PORT}`);
  logger.info(`Health check: http://0.0.0.0:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  wss.close();
  server.close();
  process.exit(0);
});
