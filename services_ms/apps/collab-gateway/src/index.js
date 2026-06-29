import http from 'http';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { authMiddleware } from './middleware/auth.js';
import { roleMiddleware } from './middleware/role.js';
import { redisService } from './services/redis.js';
import { logger } from './utils/logger.js';

const PORT = parseInt(process.env.WS_PORT || '3008', 10);
const server = http.createServer();
const wss = new WebSocketServer({ server });

// ---------------------------------------------------------------------------
// y-websocket message type constants (must match y-websocket client exactly)
// ---------------------------------------------------------------------------
const messageSync = 0;        // y-websocket: sync handshake + doc updates
const messageAwareness = 1;   // y-websocket: awareness state updates

// ---------------------------------------------------------------------------
// Document store — singleton Y.Doc per meetingId, reused across connections
// ---------------------------------------------------------------------------
const docs = new Map();

function getOrCreateDoc(meetingId) {
  if (!docs.has(meetingId)) {
    const doc = new Y.Doc();
    doc.gc = true;
    docs.set(meetingId, {
      doc,
      awareness: new awarenessProtocol.Awareness(doc),
      connections: new Set(),
    });
    logger.info(`[WS] Created doc for meeting ${meetingId}`);
  }
  return docs.get(meetingId);
}

/**
 * Broadcast a Y.Doc binary update to all connections except excludeConn.
 * Uses messageSync (type 0) as required by y-websocket protocol.
 */
function broadcastUpdate(docEntry, update, excludeConn = null) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync); // type 0
  syncProtocol.writeUpdate(encoder, update);
  const msg = encoding.toUint8Array(encoder);
  docEntry.connections.forEach((conn) => {
    if (conn !== excludeConn && conn.readyState === 1) {
      conn.send(msg);
    }
  });
}

/**
 * Broadcast awareness update to all connections except excludeConn.
 * Uses messageAwareness (type 1) as required by y-websocket protocol.
 */
function broadcastAwarenessUpdate(docEntry, changedClients, excludeConn = null) {
  if (!changedClients.length) return;
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness); // type 1
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(docEntry.awareness, changedClients)
  );
  const msg = encoding.toUint8Array(encoder);
  docEntry.connections.forEach((conn) => {
    if (conn !== excludeConn && conn.readyState === 1) {
      conn.send(msg);
    }
  });
}

/**
 * Send sync step 1 (current doc state vector) to a newly connected client.
 * Uses messageSync (type 0).
 */
function sendSyncStep1(conn, doc) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync); // type 0
  syncProtocol.writeSyncStep1(encoder, doc);
  conn.send(encoding.toUint8Array(encoder));
}

/**
 * Handle an inbound binary message from a client.
 * y-websocket sends:
 *   type 0 (messageSync)      — sync step 1, step 2, and doc updates
 *   type 1 (messageAwareness) — awareness state
 */
function handleMessage(conn, docEntry, message) {
  const decoder = decoding.createDecoder(message);
  const messageType = decoding.readVarUint(decoder);

  switch (messageType) {
    case messageSync: { // 0 — sync handshake / doc update
      // Check message subtype for read-only connections
      const syncDecoder = decoding.createDecoder(message);
      decoding.readVarUint(syncDecoder); // consume messageSync (type 0)
      const syncType = decoding.readVarUint(syncDecoder);

      if (conn.isReadOnly && syncType !== 0) {
        logger.warn(`[WS] Read-only user ${conn.userId} blocked from sending sync update type ${syncType}`);
        break;
      }

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.readSyncMessage(decoder, encoder, docEntry.doc, null);
      if (encoding.length(encoder) > 1) {
        conn.send(encoding.toUint8Array(encoder));
      }
      break;
    }
    case messageAwareness: { // 1 — awareness state from client
      const update = decoding.readVarUint8Array(decoder);
      // Track which Y.js clientIDs belong to this connection for cleanup on disconnect
      try {
        const tmpDecoder = decoding.createDecoder(update);
        const numClients = decoding.readVarUint(tmpDecoder);
        for (let j = 0; j < numClients; j++) {
          const clientID = decoding.readVarUint(tmpDecoder);
          conn.awarenessClientIDs.add(clientID);
          decoding.readVarString(tmpDecoder); // skip state JSON
        }
      } catch (_) { /* ignore parse errors */ }
      // Apply and relay via the 'change' event handler
      awarenessProtocol.applyAwarenessUpdate(docEntry.awareness, update, conn);
      break;
    }
    default:
      logger.warn(`[WS] Unknown message type: ${messageType}`);
  }
}

// ---------------------------------------------------------------------------
// Connection setup
// ---------------------------------------------------------------------------
wss.on('connection', async (conn, req) => {
  // y-websocket sends room name as URL path: ws://host/{meetingId}?token=xxx
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  const meetingId = url.pathname.replace(/^\//, '').replace(/^socket\.io\//, ''); // e.g. "/{uuid}" or "/socket.io/{uuid}" → "{uuid}"

  if (!token || !meetingId) {
    conn.close(4001, 'Missing token or meetingId');
    logger.warn(`[WS] Rejected: token=${!!token} meetingId="${meetingId}"`);
    return;
  }

  try {
    const user = await authMiddleware(token);
    if (!user) {
      conn.close(4001, 'Unauthorized');
      return;
    }

    const role = await roleMiddleware(meetingId, user.id);

    const docEntry = getOrCreateDoc(meetingId);
    docEntry.connections.add(conn);
    conn.userId = user.id;
    conn.role = role;
    conn.meetingId = meetingId;
    conn.awarenessClientIDs = new Set(); // track Y.js clientIDs from this conn

    logger.info(`[WS] User ${user.id} (${role}) joined meeting ${meetingId}`);

    if (role === 'VIEWER') {
      conn.isReadOnly = true;
    }

    // Relay awareness changes to all other connections
    const awarenessHandler = ({ added, updated, removed }) => {
      const changedClients = [...added, ...updated, ...removed];
      broadcastAwarenessUpdate(docEntry, changedClients, conn);
    };
    docEntry.awareness.on('change', awarenessHandler);

    // Relay doc updates to all other connections
    const updateHandler = (update, origin) => {
      if (origin !== conn) {
        broadcastUpdate(docEntry, update, origin);
      }
    };
    docEntry.doc.on('update', updateHandler);

    // Receive and dispatch messages from this client
    conn.on('message', (rawMessage) => {
      try {
        handleMessage(conn, docEntry, new Uint8Array(rawMessage));
      } catch (err) {
        logger.error(`[WS] Message error: ${err.message}`);
      }
    });

    // Cleanup on disconnect
    conn.on('close', () => {
      docEntry.connections.delete(conn);
      if (conn.awarenessClientIDs.size > 0) {
        awarenessProtocol.removeAwarenessStates(
          docEntry.awareness,
          [...conn.awarenessClientIDs],
          conn
        );
      }
      docEntry.awareness.off('change', awarenessHandler);
      docEntry.doc.off('update', updateHandler);
      logger.info(`[WS] User ${user.id} left meeting ${meetingId}`);
    });

    // Send current doc state to new client (sync step 1)
    sendSyncStep1(conn, docEntry.doc);

    // Send current awareness states to new client
    const awarenessStates = docEntry.awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness); // type 1
      const updateData = awarenessProtocol.encodeAwarenessUpdate(
        docEntry.awareness,
        Array.from(awarenessStates.keys())
      );
      encoding.writeVarUint8Array(encoder, updateData);
      conn.send(encoding.toUint8Array(encoder));
    }

  } catch (error) {
    logger.error(`[WS] Connection error: ${error.message}`);
    conn.close(4001, 'Authentication failed');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Collab Gateway running on ws://0.0.0.0:${PORT}`);
  logger.info(`Health check: http://0.0.0.0:${PORT}/health`);
});

// Health check endpoint
server.on('request', (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'collab-gateway',
      activeRooms: docs.size,
    }));
    return;
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  wss.close();
  server.close();
  process.exit(0);
});

function pickColor(seed) {
  const colors = ['#E53E3E', '#DD6B20', '#D69E2E', '#38A169', '#3182CE', '#805AD5', '#D53F8C', '#00B5D8'];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
