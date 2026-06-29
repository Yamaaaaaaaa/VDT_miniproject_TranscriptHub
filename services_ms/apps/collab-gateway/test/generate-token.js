/**
 * Generate Test JWT Token for Collab Gateway Testing
 * 
 * This script generates a valid JWT token for testing purposes.
 * In production, tokens should come from Identity Service.
 */

const jwt = require('jsonwebtoken');

// JWT secret from .env or default
const JWT_SECRET = process.env.JWT_SECRET || 'access_secret_123';  // Must match Identity Service

// Test user payload - MUST match what Identity Service expects
const payload = {
  sub: 1,           // User ID (must be 'sub' not 'id')
  email: 'test@test.com',
  roles: ['USER'],   // Must be uppercase
  permissions: [],    // Empty permissions for testing
};

console.log('='.repeat(60));
console.log('JWT Token Generator for Testing');
console.log('='.repeat(60));
console.log('');

// Generate access token (expires in 1 day)
const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });

// Generate refresh token (expires in 7 days)
const refreshToken = jwt.sign({ sub: payload.sub }, 'refresh_secret_123', { expiresIn: '7d' });

console.log('Access Token:');
console.log(accessToken);
console.log('');
console.log('Refresh Token:');
console.log(refreshToken);
console.log('');
console.log('Payload:', JSON.stringify(payload, null, 2));
console.log('');
console.log('Copy the Access Token and use it in test-ws.js');
console.log('');

// Also export for use in other scripts
module.exports = { accessToken, refreshToken, payload };
