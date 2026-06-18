# STEP-04: Collab Gateway (Standalone Node.js WebSocket Server)

## Mục Tiêu

Tạo Collab Gateway đơn giản - **standalone Node.js WebSocket server** sử dụng `ws` và `y-websocket/bin/utils`, không cần NestJS.

**Ưu điểm:**
- Code đơn giản, dễ debug (~100-200 lines so với 500+ lines NestJS)
- Performance tốt hơn (không có NestJS overhead)
- Tận dụng `y-websocket/bin/utils` đã có đầy đủ CRDT sync
- Dễ maintain và deploy

## Dependencies

- ✅ STEP-00 (Prerequisites)
- ✅ STEP-02 (Collab Service - HTTP API)
- ✅ STEP-03 (Meeting Service)

## Checklist

- [ ] Tạo thư mục `services_ms/apps/collab-gateway` (thay thế NestJS app)
- [ ] Cài đặt dependencies: `ws`, `y-websocket`, `ioredis`, `node-fetch`
- [ ] Implement standalone WebSocket server
- [ ] Implement JWT auth middleware
- [ ] Implement Redis cache cho role caching
- [ ] Implement HTTP client tới Identity & Collab services
- [ ] Test WebSocket connection

---

## 1. So Sánh Kiến Trúc Cũ và Mới

### 1.1. Kiến trúc cũ (NestJS + y-protocols + Socket.io)

```
┌─────────────────────────────────────────────────────────────────┐
│                         NESTJS APPLICATION                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  @WebSocketGateway (Socket.io)                               ││
│  │  ├── auth/ws-jwt.guard.ts                                   ││
│  │  ├── collab-gateway.gateway.ts                              ││
│  │  ├── collab-client/ (TCP RPC)                               ││
│  │  ├── identity-client/ (TCP RPC)                              ││
│  │  ├── room/room.service.ts                                   ││
│  │  └── cache/cache.service.ts                                 ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ❌ Quá phức tạp cho một WebSocket server                        │
│  ❌ Nhiều boilerplate code                                       │
│  ❌ Khó debug                                                    │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2. Kiến trúc mới (Standalone Node.js)

```
┌─────────────────────────────────────────────────────────────────┐
│                    STANDALONE NODE.JS SERVER                     │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  index.js                                                   ││
│  │  ├── HTTP Server (for health checks)                        ││
│  │  └── WebSocket Server (ws library)                         ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Middleware Layer                                            ││
│  │  ├── auth.js (JWT verify)                                   ││
│  │  └── role.js (Role + cache)                                ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  y-websocket/bin/utils                                      ││
│  │  ├── Room management                                       ││
│  │  ├── CRDT sync (sync protocol)                             ││
│  │  └── Awareness (presence)                                 ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  External Services                                          ││
│  │  ├── Identity Service (HTTP)                               ││
│  │  ├── Collab Service (HTTP)                                 ││
│  │  └── Redis (Cache + Pub/Sub)                               ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ✅ Đơn giản, dễ hiểu                                           │
│  ✅ Performance tốt                                              │
│  ✅ Dễ deploy                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Cài Đặt Project

### 2.1. Cấu trúc files

```
services_ms/apps/collab-gateway/
├── src/
│   ├── index.js                 # Entry point - standalone WS server
│   ├── middleware/
│   │   ├── auth.js              # JWT authentication middleware
│   │   └── role.js              # Role-based access middleware
│   ├── services/
│   │   ├── identity.js          # HTTP client to Identity Service
│   │   ├── collab.js           # HTTP client to Collab Service
│   │   └── redis.js            # Redis client for caching
│   └── utils/
│       └── logger.js            # Logging utility
├── package.json
├── Dockerfile
├── .env.example
└── README.md
```

### 2.2. package.json

```json
{
  "name": "collab-gateway",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "ws": "^8.16.0",
    "y-websocket": "^2.0.4",
    "yjs": "^13.6.11",
    "ioredis": "^5.3.2",
    "node-fetch": "^3.3.2",
    "dotenv": "^16.4.1"
  }
}
```

### 2.3. .env.example

```bash
# Server
WS_PORT=3008
HTTP_PORT=3009

# Services URLs (Docker network)
IDENTITY_SERVICE_URL=http://identity-service:3002
COLLAB_SERVICE_URL=http://collab-service:3007

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Cache
ROLE_CACHE_TTL=300

# Logging
LOG_LEVEL=info
```

---

## 3. Chi Tiết Implementation

### 3.1. Entry Point (src/index.js)

```javascript
import http from 'http';
import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';
import { authMiddleware } from './middleware/auth.js';
import { roleMiddleware } from './middleware/role.js';
import { identityService } from './services/identity.js';
import { collabService } from './services/collab.js';
import { redisService } from './services/redis.js';
import { logger } from './utils/logger.js';

const WS_PORT = process.env.WS_PORT || 3008;
const HTTP_PORT = process.env.HTTP_PORT || 3009;

// 1. HTTP Server (for health checks)
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// 2. WebSocket Server
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', async (conn, req) => {
  // Parse URL params
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  const meetingId = url.searchParams.get('meetingId');

  // Validate required params
  if (!token || !meetingId) {
    logger.warn('Connection rejected: missing token or meetingId');
    conn.close(4001, 'Missing token or meetingId');
    return;
  }

  try {
    // 1. Authenticate user
    const user = await authMiddleware(token);
    if (!user) {
      conn.close(4001, 'Unauthorized');
      return;
    }

    // 2. Get user role
    const role = await roleMiddleware(meetingId, user.id);

    // 3. Attach metadata to connection
    conn.userId = user.id;
    conn.email = user.email;
    conn.role = role;
    conn.meetingId = meetingId;

    logger.info(`User ${user.id} joined meeting ${meetingId} as ${role}`);

    // 4. Setup Yjs connection
    // setupWSConnection handles:
    // - Room management based on URL path
    // - CRDT sync protocol
    // - Awareness protocol
    // - Automatic broadcast
    setupWSConnection(conn, req, {
      gc: true, // Garbage collect deleted items
      docName: meetingId, // Explicit document name
      // readOnly: role === 'VIEWER', // TODO: implement if needed
    });

  } catch (error) {
    logger.error('Connection error:', error.message);
    conn.close(4001, 'Authentication failed');
  }
});

// 3. Start servers
httpServer.listen(WS_PORT, () => {
  logger.info(`Collab Gateway WebSocket: ws://localhost:${WS_PORT}`);
});

httpServer.listen(HTTP_PORT, () => {
  logger.info(`Collab Gateway HTTP: http://localhost:${HTTP_PORT}`);
});

// 4. Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  wss.close();
  httpServer.close();
  await redisService.disconnect();
  process.exit(0);
});
```

### 3.2. Auth Middleware (src/middleware/auth.js)

```javascript
import { identityService } from '../services/identity.js';
import { logger } from '../utils/logger.js';

export async function authMiddleware(token) {
  try {
    const response = await identityService.verifyToken(token);

    if (!response.success) {
      logger.warn('Auth failed: invalid token');
      return null;
    }

    return response.data;
  } catch (error) {
    logger.error('Auth error:', error.message);
    return null;
  }
}
```

### 3.3. Role Middleware (src/middleware/role.js)

```javascript
import { identityService } from '../services/identity.js';
import { redisService } from '../services/redis.js';
import { logger } from '../utils/logger.js';

const CACHE_TTL = parseInt(process.env.ROLE_CACHE_TTL || '300');

export async function roleMiddleware(meetingId, userId) {
  const cacheKey = `meeting:${meetingId}:user:${userId}:role`;

  try {
    // 1. Check Redis cache
    const cachedRole = await redisService.get(cacheKey);
    if (cachedRole) {
      logger.debug(`Role cache hit: ${cacheKey} = ${cachedRole}`);
      return cachedRole;
    }

    // 2. Get from Identity Service
    const response = await identityService.getMeetingRole(meetingId, userId);
    const role = response.data?.role || 'VIEWER';

    // 3. Cache the role
    await redisService.set(cacheKey, role, CACHE_TTL);
    logger.debug(`Role cached: ${cacheKey} = ${role}`);

    return role;
  } catch (error) {
    logger.error('Role middleware error:', error.message);
    return 'VIEWER'; // Default to VIEWER on error
  }
}
```

### 3.4. Identity Service Client (src/services/identity.js)

```javascript
import fetch from 'node-fetch';

const IDENTITY_URL = process.env.IDENTITY_SERVICE_URL || 'http://identity-service:3002';

export const identityService = {
  async verifyToken(token) {
    try {
      const response = await fetch(`${IDENTITY_URL}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();
      return { success: response.ok, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async getMeetingRole(meetingId, userId) {
    try {
      const response = await fetch(
        `${IDENTITY_URL}/meetings/${meetingId}/role?userId=${userId}`
      );

      const data = await response.json();
      return { success: response.ok, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};
```

### 3.5. Collab Service Client (src/services/collab.js)

```javascript
import fetch from 'node-fetch';

const COLLAB_URL = process.env.COLLAB_SERVICE_URL || 'http://collab-service:3007';

export const collabService = {
  async getTranscript(meetingId) {
    try {
      const response = await fetch(`${COLLAB_URL}/transcripts/${meetingId}`);
      const data = await response.json();
      return { success: response.ok, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async saveTranscript(meetingId, content) {
    try {
      const response = await fetch(`${COLLAB_URL}/transcripts/${meetingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content),
      });
      const data = await response.json();
      return { success: response.ok, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};
```

### 3.6. Redis Service (src/services/redis.js)

```javascript
import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'redis';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

export const redisService = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

redisService.on('error', (err) => {
  console.error('Redis error:', err.message);
});

redisService.on('connect', () => {
  console.log('Redis connected');
});

export const redis = {
  async get(key) {
    const value = await redisService.get(key);
    return value || null;
  },

  async set(key, value, ttlSeconds) {
    if (ttlSeconds) {
      await redisService.setex(key, ttlSeconds, value);
    } else {
      await redisService.set(key, value);
    }
  },

  async del(key) {
    await redisService.del(key);
  },

  async disconnect() {
    await redisService.quit();
  },
};
```

### 3.7. Logger (src/utils/logger.js)

```javascript
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function log(level, ...args) {
  if (levels[level] <= levels[LOG_LEVEL]) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}]`, ...args);
  }
}

export const logger = {
  error: (...args) => log('error', ...args),
  warn: (...args) => log('warn', ...args),
  info: (...args) => log('info', ...args),
  debug: (...args) => log('debug', ...args),
};
```

---

## 4. Docker Configuration

### 4.1. Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY src/ ./src/
COPY .env.example .env

# Expose ports
EXPOSE 3008 3009

# Start
CMD ["node", "src/index.js"]
```

### 4.2. docker-compose.yml (update)

```yaml
services:
  collab-gateway:
    build:
      context: ./services_ms/apps/collab-gateway
      dockerfile: Dockerfile
    ports:
      - "3008:3008"
      - "3009:3009"
    environment:
      - WS_PORT=3008
      - HTTP_PORT=3009
      - IDENTITY_SERVICE_URL=http://identity-service:3002
      - COLLAB_SERVICE_URL=http://collab-service:3007
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - ROLE_CACHE_TTL=300
      - LOG_LEVEL=info
    depends_on:
      - redis
      - identity-service
      - collab-service
    networks:
      - app-network

networks:
  app-network:
    external: true
```

---

## 5. Test WebSocket Connection

### 5.1. Test Script

```javascript
// test-ws.js
import { io } from 'socket.io-client';

const socket = io('http://localhost:3008', {
  query: {
    meetingId: 'test-meeting-123',
    token: 'your-jwt-token-here',
  },
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('✅ Connected to Collab Gateway');
});

socket.on('sync', (data) => {
  console.log('📨 Received sync message:', data.byteLength, 'bytes');
});

socket.on('awareness', (data) => {
  console.log('👥 Received awareness update');
});

socket.on('error', (error) => {
  console.log('❌ Error:', error.message);
});

socket.on('disconnect', () => {
  console.log('🔌 Disconnected');
});

// Auto disconnect after 30 seconds
setTimeout(() => {
  socket.disconnect();
  process.exit(0);
}, 30000);
```

### 5.2. Chạy test

```bash
# Start collab-gateway
cd services_ms/apps/collab-gateway
npm install
npm start

# Run test (in another terminal)
node test/test-ws.js
```

---

## 6. Luồng Xử Lý Chi Tiết

### 6.1. Connection Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONNECTION FLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. CLIENT CONNECT                                               │
│  ┌─────────┐                                                   │
│  │ Client  │ ──── WS connect ──────────────────────────────┐  │
│  │         │      (token + meetingId in URL)               │  │
│  └─────────┘                                                 │  │
│                                                                  │
│  2. SERVER HANDLES CONNECTION                                   │
│  │                                                            │  │
│  │  ┌─────────────────────────────────────────────────────┐│  │
│  │  │  Parse token + meetingId from URL                  ││  │
│  │  └─────────────────────────────────────────────────────┘│  │
│  │                         │                               │  │
│  │                         ▼                               │  │
│  │  ┌─────────────────────────────────────────────────────┐│  │
│  │  │  Call Identity Service to verify JWT               ││  │
│  │  │  POST /auth/verify { token }                       ││  │
│  │  └─────────────────────────────────────────────────────┘│  │
│  │                         │                               │  │
│  │                         ▼                               │  │
│  │  ┌─────────────────────────────────────────────────────┐│  │
│  │  │  Get role from Redis cache or Identity Service      ││  │
│  │  │  Cache key: meeting:X:user:Y:role                  ││  │
│  │  └─────────────────────────────────────────────────────┘│  │
│  │                         │                               │  │
│  │                         ▼                               │  │
│  │  ┌─────────────────────────────────────────────────────┐│  │
│  │  │  Attach user metadata to connection                 ││  │
│  │  │  conn.userId, conn.role, conn.meetingId            ││  │
│  │  └─────────────────────────────────────────────────────┘│  │
│  │                         │                               │  │
│  │                         ▼                               │  │
│  │  ┌─────────────────────────────────────────────────────┐│  │
│  │  │  Call setupWSConnection (y-websocket/bin/utils)   ││  │
│  │  │  • Create/join room based on meetingId            ││  │
│  │  │  • Send sync-step-1 to client                      ││  │
│  │  │  • Setup awareness protocol                        ││  │
│  │  └─────────────────────────────────────────────────────┘│  │
│  │                         │                               │  │
│  │                         ▼                               │  │
│  │  ┌─────────┐                                                 │
│  │  │ Client  │ ◀──── sync-step-1 (full document state)  │  │
│  │  └─────────┘                                                 │
│  │                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2. Real-time Edit Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    REAL-TIME EDIT FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. CLIENT SENDS EDIT                                           │
│  ┌─────────┐                                                   │
│  │ Client  │ ──── CRDT update ──────────────────────────────┐  │
│  │         │      (binary via WebSocket)                     │  │
│  └─────────┘                                                 │  │
│                                                                  │
│  2. SERVER RECEIVES                                            │
│  │                                                            │  │
│  │  ┌─────────────────────────────────────────────────────┐│  │
│  │  │  y-websocket/bin/utils handles:                     ││  │
│  │  │  • Decode binary message                            ││  │
│  │  │  • Apply update to Y.Doc                            ││  │
│  │  │  • Broadcast to other clients in room               ││  │
│  │  └─────────────────────────────────────────────────────┘│  │
│  │                         │                               │  │
│  │                         ▼                               │  │
│  │  ┌─────────┐                                                 │
│  │  │ Client2 │ ◀──── CRDT update (broadcasted)         │  │
│  │  └─────────┘                                                 │
│  │                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Troubleshooting

### 7.1. Client không nhận được sync message

1. Check JWT token có hợp lệ không
2. Check meetingId có đúng format không
3. Check `setupWSConnection` được gọi đúng chưa

### 7.2. Awareness không hoạt động

1. Check `setupWSConnection` được gọi với options đúng
2. Check awareness instance được tạo tự động

### 7.3. Role-based edit không hoạt động

1. Check `roleMiddleware` trả về đúng role
2. Check role được attach vào `conn.role`
3. TODO: Implement read-only mode cho VIEWER role

---

## 8. Output Sau Step Này

Sau khi hoàn thành STEP-04 (phiên bản mới):

1. ✅ Collab Gateway (Standalone Node.js) chạy trên port 3008
2. ✅ JWT authentication được implement (HTTP call to Identity Service)
3. ✅ Role caching với Redis
4. ✅ HTTP clients tới Identity & Collab services
5. ✅ y-websocket/bin/utils cho CRDT sync + awareness
6. ✅ Đơn giản, dễ maintain, performance tốt

---

## 9. Tiếp Theo

👉 **[STEP-05: Frontend Integration](./STEP-05.md)** - Tích hợp collaborative editor vào Next.js frontend
