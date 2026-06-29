/**
 * TCP Connection Test for Identity Service
 * 
 * This script tests the raw TCP connection to Identity Service
 */

const net = require('net');

const HOST = '::1';
const PORT = 3002;

// NestJS microservices packet format
// 4 bytes: length (big endian)
// payload: JSON { pattern: string, data: any }
function encodeMessage(pattern, data) {
  const payload = JSON.stringify({ pattern, data });
  const buffer = Buffer.alloc(4 + Buffer.byteLength(payload));
  buffer.writeUInt32BE(Buffer.byteLength(payload), 0);
  buffer.write(payload, 4);
  return buffer;
}

console.log('='.repeat(60));
console.log('TCP Connection Test - Identity Service');
console.log('='.repeat(60));
console.log(`Connecting to ${HOST}:${PORT}...`);
console.log('');

const client = new net.Socket();

let responseData = '';

client.connect({ port: PORT, host: HOST }, () => {
  console.log('✅ Connected!');
  
  // Test validate_token
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImVtYWlsIjoidGVzdEB0ZXN0LmNvbSIsInJvbGVzIjpbIlVTRVIiXSwicGVybWlzc2lvbnMiOltdLCJpYXQiOjE3ODE2NDIzMTMsImV4cCI6MTc4MTcyODcxM30.w6ezMk80ZSRze1F8H798f1tUnT6CP3e3vM6gyx4XWiQ';
  
  // Try raw JSON first
  const rawJson = JSON.stringify({ pattern: 'validate_token', data: { token } });
  console.log(`Sending raw JSON: ${rawJson}`);
  client.write(rawJson);
  
  // Also try with length-prefixed format
  setTimeout(() => {
    console.log('\nTrying with length-prefixed format...');
    const payload = JSON.stringify({ pattern: 'validate_token', data: { token } });
    const buffer = Buffer.alloc(4 + Buffer.byteLength(payload));
    buffer.writeUInt32BE(Buffer.byteLength(payload), 0);
    buffer.write(payload, 4);
    client.write(buffer);
  }, 1000);
});

client.on('data', (chunk) => {
  console.log(`\n📨 Received ${chunk.length} bytes`);
  
  // Parse packet
  const payloadLength = chunk.readUInt32BE(0);
  const payload = chunk.slice(4).toString();
  
  console.log(`Payload length from header: ${payloadLength}`);
  console.log(`Payload: ${payload}`);
  
  try {
    const response = JSON.parse(payload);
    console.log('\n✅ Parsed JSON response:');
    console.log(JSON.stringify(response, null, 2));
  } catch (e) {
    console.log('\n❌ Failed to parse JSON:', e.message);
    console.log('Raw payload:', payload);
  }
});

client.on('close', () => {
  console.log('\n🔌 Connection closed');
  process.exit(0);
});

client.on('error', (err) => {
  console.log('\n❌ Error:', err.message);
  process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('\n⏰ Timeout - no response received');
  client.destroy();
  process.exit(1);
}, 10000);
