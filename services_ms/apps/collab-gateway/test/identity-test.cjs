/**
 * Identity Service HTTP API Test
 *
 * Tests the REST endpoints exposed by the Identity Service.
 * The collab-gateway uses these HTTP endpoints (not TCP anymore).
 *
 * Usage: node test/identity-test.js
 */

const http = require('http');

const BASE_URL = process.env.IDENTITY_SERVICE_URL || 'http://localhost:3009';

/**
 * Make an HTTP request with a promise interface.
 */
function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || 3002,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = body;
        }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

/**
 * Generate a test JWT (same logic as generate-token.js but synchronous).
 */
function makeTestToken() {
  const crypto = require('crypto');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub: 1, email: 'test@test.com', roles: ['USER'], iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', 'th_jwt_s3cr3t_k3y_x9mK2pL8qR4nW6vY1bZ5cE0aF7gH3jN').update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

async function run() {
  console.log('='.repeat(60));
  console.log('Identity Service HTTP API Test');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log('');

  const token = makeTestToken();
  console.log(`Test token: ${token.substring(0, 50)}...`);
  console.log('');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`[TEST] ${name}... `);
    try {
      await fn();
      console.log('PASS');
      passed++;
    } catch (err) {
      console.log(`FAIL — ${err.message}`);
      failed++;
    }
  }

  // 1. Health check
  await test('GET /health', async () => {
    const res = await request('/health');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  // 2. Token validation via HTTP
  await test('POST /auth/verify', async () => {
    const res = await request('/auth/verify', {
      method: 'POST',
      body: { token },
    });
    if (res.status !== 200 && res.status !== 201) throw new Error(`Expected 2xx, got ${res.status}`);
  });

  // 3. Get meeting role (no real meeting in DB — expect 404 or role fallback)
  await test('GET /meetings/test-meeting-123/role?userId=1', async () => {
    const res = await request('/meetings/test-meeting-123/role?userId=1');
    // 200 = found, 404 = not found, both acceptable for test
    if (![200, 404].includes(res.status)) throw new Error(`Expected 200/404, got ${res.status}`);
  });

  console.log('');
  console.log('─'.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
