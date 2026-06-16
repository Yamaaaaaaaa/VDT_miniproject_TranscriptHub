/**
 * Collab Gateway WebSocket Test Script
 * 
 * Usage:
 * 1. Start collab-gateway: npm run start -- collab-gateway
 * 2. Run this script: node test/test-ws.js
 * 
 * Requirements:
 * - Identity Service running on localhost:3002
 * - Collab Service running on localhost:3007
 * - Redis running on localhost:6379
 * 
 * Note: You need a valid JWT token from Identity Service
 */

const { io } = require('socket.io-client');

// Configuration - UPDATE THESE VALUES
const WS_URL = 'http://localhost:3008';
const MEETING_ID = 'test-meeting-123';
const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImVtYWlsIjoidGVzdEB0ZXN0LmNvbSIsInJvbGVzIjpbIlVTRVIiXSwicGVybWlzc2lvbnMiOltdLCJpYXQiOjE3ODE2NDIzMTMsImV4cCI6MTc4MTcyODcxM30.w6ezMk80ZSRze1F8H798f1tUnT6CP3e3vM6gyx4XWiQ';

console.log('='.repeat(60));
console.log('Collab Gateway WebSocket Test');
console.log('='.repeat(60));
console.log(`URL: ${WS_URL}`);
console.log(`Meeting ID: ${MEETING_ID}`);
console.log('');

// Create socket connection with query params
const socket = io(WS_URL, {
  query: {
    meetingId: MEETING_ID,
    token: JWT_TOKEN,
  },
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 3,
  reconnectionDelay: 1000,
});

// Track message counts
let syncMessageCount = 0;
let awarenessMessageCount = 0;

socket.on('connect', () => {
  console.log('✅ Connected to Collab Gateway');
  console.log(`   Socket ID: ${socket.id}`);
  console.log('');

  // Request sync step 1 (initial document state)
  console.log('📤 Sending sync-step-1 request...');
  socket.emit('sync-step-1');

  // Don't send awareness update yet - just test sync
});

socket.on('connect_error', (error) => {
  console.log('❌ Connection error:', error.message);
  if (error.message.includes('Unauthorized')) {
    console.log('');
    console.log('💡 Hint: JWT token is invalid or expired.');
    console.log('   Get a valid token from Identity Service.');
  }
});

socket.on('sync', (data) => {
  syncMessageCount++;
  console.log(`📨 Received sync message #${syncMessageCount} (${data?.byteLength || data?.length || 0} bytes)`);
});

socket.on('awareness', (data) => {
  awarenessMessageCount++;
  console.log(`👥 Received awareness message #${awarenessMessageCount} (${data?.byteLength || data?.length || 0} bytes)`);
});

socket.on('error', (error) => {
  console.log('❌ Error:', error);
});

socket.on('disconnect', (reason) => {
  console.log('');
  console.log('🔌 Disconnected:', reason);
  console.log('');
  console.log('Summary:');
  console.log(`   - Sync messages received: ${syncMessageCount}`);
  console.log(`   - Awareness messages received: ${awarenessMessageCount}`);
});

// Auto disconnect after 10 seconds
setTimeout(() => {
  console.log('');
  console.log('⏰ Auto-disconnecting after 10 seconds...');
  socket.disconnect();
  process.exit(0);
}, 10000);

console.log('Waiting for connection and sync messages...');
