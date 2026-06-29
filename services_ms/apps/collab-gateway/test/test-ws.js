/**
 * Collab Gateway WebSocket Test Script
 * Tests the standalone Node.js WebSocket gateway using native `ws` library.
 *
 * Usage:
 * 1. Ensure collab-gateway is running: docker compose up -d collab-gateway
 * 2. Run this script: node --experimental-vm-modules test/test-ws.js
 *    (or: node test/test-ws.js if ws is installed globally)
 */

import WebSocket from 'ws';
import jwt from 'jsonwebtoken';

// --- Configuration ---
const WS_URL = process.env.WS_URL || 'ws://localhost:3008';
const MEETING_ID = process.env.MEETING_ID || 'test-meeting-123';
const JWT_SECRET = process.env.JWT_SECRET || 'th_jwt_s3cr3t_k3y_x9mK2pL8qR4nW6vY1bZ5cE0aF7gH3jN';

// Generate a short-lived test token
const payload = { sub: 1, email: 'test@test.com', roles: ['USER'] };
const testToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

const wsUrl = `${WS_URL}?token=${encodeURIComponent(testToken)}&meetingId=${encodeURIComponent(MEETING_ID)}`;

console.log('='.repeat(60));
console.log('Collab Gateway WebSocket Test');
console.log('='.repeat(60));
console.log(`URL:  ${WS_URL}`);
console.log(`Meeting ID: ${MEETING_ID}`);
console.log(`Token: ${testToken.substring(0, 40)}...`);
console.log('');

// Connect
const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('[WS] Connected');
  console.log('[WS] Sending CRDT sync ping...');

  // y-websocket uses a simple message format.
  // sync-step-1 is encoded as: [0, 0] (msgSync=0, syncStep1=0)
  const syncStep1 = new Uint8Array([0, 0]);
  ws.send(syncStep1);
});

ws.on('message', (data) => {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  console.log(`[WS] Received ${buf.length} bytes: ${buf.slice(0, 8).toString('hex')}...`);
});

ws.on('close', (code, reason) => {
  console.log(`[WS] Closed code=${code} reason=${reason || '(none)'}`);
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('[WS] Error:', err.message);
  process.exit(1);
});

// Auto disconnect after 8 seconds
setTimeout(() => {
  console.log('[Test] Timeout - disconnecting');
  ws.close(1000, 'test done');
}, 8000);
