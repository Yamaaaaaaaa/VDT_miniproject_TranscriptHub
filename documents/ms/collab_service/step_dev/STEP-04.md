# STEP-04: y-websocket Server

## Mục Tiêu

Tạo y-websocket server - một standalone Node.js server (không phải NestJS) để xử lý real-time CRDT synchronization qua WebSocket.

## Dependencies

- ✅ STEP-00 (Prerequisites)
- ✅ STEP-02 (Collab Service - TCP RPC Server)
- ✅ STEP-03 (Meeting Service - TCP RPC Client)

## Checklist

- [x] Tạo thư mục `services_ms/apps/collab-ws`
- [x] Cài đặt dependencies (y-websocket, yjs, etc.)
- [x] Implement Redis cache wrapper cho role caching
- [x] Implement JWT authentication middleware
- [x] Implement Identity Service integration (gọi HTTP để lấy role)
- [x] Implement WebSocket server với room management
- [x] Implement role-based write filtering (HOST/EDITOR allowed, VIEWER blocked)
- [x] Implement TCP RPC client để giao tiếp với Collab Service
- [x] Test WebSocket connection

---

## 1. Cài Đặt Project

### 1.1. Tạo thư mục

```bash
mkdir -p services_ms/apps/collab-ws/src
```

### 1.2. Tạo `package.json`

```json
{
  "name": "collab-ws",
  "version": "1.0.0",
  "description": "y-websocket server for collaborative editing",
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/main.js",
    "dev": "ts-node src/main.ts",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "yjs": "^13.6.0",
    "y-websocket": "^2.0.0",
    "y-protocols": "^1.0.0",
    "lib0": "^0.2.99",
    "ws": "^8.16.0",
    "jsonwebtoken": "^9.0.0",
    "ioredis": "^5.3.0"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.0",
    "@types/ws": "^8.5.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "ts-node": "^10.0.0"
  }
}
```

### 1.3. Tạo `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 1.4. Cài đặt dependencies

```bash
cd services_ms/apps/collab-ws
npm install
```

---

## 2. Implement WebSocket Server

### 2.1. Cấu hình environment

```typescript
// services_ms/apps/collab-ws/src/config.ts
export const config = {
  wsPort: parseInt(process.env.WS_PORT || '3008'),
  collabServiceHost: process.env.COLLAB_SERVICE_HOST || 'localhost',
  collabServicePort: parseInt(process.env.COLLAB_SERVICE_PORT || '3007'),
  identityServiceHost: process.env.IDENTITY_SERVICE_HOST || 'identity-service',
  identityServicePort: parseInt(process.env.IDENTITY_SERVICE_PORT || '3002'),
  jwtSecret: process.env.JWT_SECRET || 'your-jwt-secret',
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT || '6379'),
  // Cache settings
  roleCacheTtl: 300, // 5 minutes in seconds
};
```

### 2.2. Redis Cache Wrapper (cho role caching)

```typescript
// services_ms/apps/collab-ws/src/cache.ts
import Redis from 'ioredis';
import { config } from './config';

const redis = new Redis({
  host: config.redisHost,
  port: config.redisPort,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

export async function getCached<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

export async function setCache(key: string, value: any, ttl: number): Promise<void> {
  await redis.setex(key, ttl, JSON.stringify(value));
}

export async function deleteCache(key: string): Promise<void> {
  await redis.del(key);
}

export { redis };
```

### 2.3. TCP RPC Client cho Identity Service

```typescript
// services_ms/apps/collab-ws/src/identity-client.ts
import * as net from 'net';
import { config } from './config';

export interface IdentityUser {
  id: number;
  email: string;
  roles?: string[];
}

export class IdentityClient {
  private static encodeMessage(pattern: any, data: any): Buffer {
    const payload = JSON.stringify({ pattern, data });
    const buffer = Buffer.alloc(4 + Buffer.byteLength(payload));
    buffer.writeUInt32BE(Buffer.byteLength(payload), 0);
    buffer.write(payload, 4);
    return buffer;
  }

  static async send(pattern: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let responseData = '';

      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error('TCP request timeout'));
      }, 5000);

      client.connect(
        config.identityServicePort,
        config.identityServiceHost,
        () => {
          const message = this.encodeMessage({ cmd: pattern }, data);
          client.write(message);
        },
      );

      client.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      client.on('end', () => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(responseData);
          resolve(response);
        } catch (e) {
          reject(new Error('Failed to parse TCP response'));
        }
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  // Validate JWT token via Identity Service TCP
  static async validateToken(token: string): Promise<IdentityUser> {
    const response = await this.send('validate_token', { token });
    if (!response.success) {
      throw new Error(response.message || 'Token validation failed');
    }
    return response.data;
  }

  // Get user role in a specific meeting via Identity Service TCP
  static async getMeetingRole(meetingId: string, userId: number): Promise<'HOST' | 'EDITOR' | 'VIEWER'> {
    const response = await this.send('get_meeting_role', { meetingId, userId });
    if (!response.success) {
      if (response.message?.includes('not found')) {
        return 'VIEWER'; // Default to VIEWER if not found
      }
      throw new Error(response.message || 'Failed to get meeting role');
    }
    return response.data.role;
  }
}
```

### 2.4. TCP RPC Client Wrapper cho Collab Service

```typescript
// services_ms/apps/collab-ws/src/collab-client.ts
import * as net from 'net';
import { config } from './config';

export interface TcpRpcResult {
  success: boolean;
  data?: any;
  message?: string;
}

export class CollabClient {
  private static encodeMessage(pattern: any, data: any): Buffer {
    const payload = JSON.stringify({ pattern, data });
    const buffer = Buffer.alloc(4 + Buffer.byteLength(payload));
    buffer.writeUInt32BE(Buffer.byteLength(payload), 0);
    buffer.write(payload, 4);
    return buffer;
  }

  static async send(pattern: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let responseData = '';

      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error('TCP request timeout'));
      }, 5000);

      client.connect(
        config.collabServicePort,
        config.collabServiceHost,
        () => {
          const message = this.encodeMessage({ cmd: pattern }, data);
          client.write(message);
        },
      );

      client.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      client.on('end', () => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(responseData);
          resolve(response);
        } catch (e) {
          reject(new Error('Failed to parse TCP response'));
        }
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  static async getTranscript(meetingId: string): Promise<any> {
    return this.send('get-transcript', { meetingId });
  }

  static async saveTranscript(
    meetingId: string,
    rawText: string,
    structuredContent: any,
  ): Promise<any> {
    return this.send('save-transcript', { meetingId, rawText, structuredContent });
  }

  static async createSnapshot(
    meetingId: string,
    userId: number,
    versionName: string,
  ): Promise<any> {
    return this.send('create-snapshot', { meetingId, userId, versionName });
  }
}
```

### 2.3. Room Manager

```typescript
// services_ms/apps/collab-ws/src/room-manager.ts
import * as Y from 'yjs';
import { CollabClient } from './collab-client';

interface UserInfo {
  id: number;
  role: 'HOST' | 'EDITOR' | 'VIEWER';
  name?: string;
  color?: string;
}

interface Room {
  doc: Y.Doc;
  awareness: Map<number, UserInfo>;
  users: Set<any>;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  async getOrCreateRoom(meetingId: string): Promise<Room> {
    if (this.rooms.has(meetingId)) {
      return this.rooms.get(meetingId)!;
    }

    const doc = new Y.Doc();

    // Load initial document state from Collab Service
    try {
      const response = await CollabClient.getTranscript(meetingId);
      if (response.success && response.data) {
        this.initializeDocFromContent(doc, response.data);
      }
    } catch (err) {
      console.error('Failed to load initial document:', err);
    }

    const room: Room = {
      doc,
      awareness: new Map(),
      users: new Set(),
    };

    this.rooms.set(meetingId, room);
    return room;
  }

  private initializeDocFromContent(doc: Y.Doc, content: any) {
    const yText = doc.getText('transcript');
    const ySegments = doc.getArray('segments');

    if (content.rawText) {
      yText.insert(0, content.rawText);
    }

    if (content.structuredContent?.segments) {
      ySegments.insert(0, content.structuredContent.segments);
    }
  }

  getRoom(meetingId: string): Room | undefined {
    return this.rooms.get(meetingId);
  }

  removeUser(meetingId: string, ws: any) {
    const room = this.rooms.get(meetingId);
    if (room) {
      room.users.delete(ws);
      if (room.users.size === 0) {
        // Optionally persist on empty room
        this.rooms.delete(meetingId);
      }
    }
  }
}

export const roomManager = new RoomManager();
```

### 2.5. JWT Auth & Identity Service Integration (TCP RPC)

```typescript
// services_ms/apps/collab-ws/src/auth.ts
import * as jwt from 'jsonwebtoken';
import { config } from './config';
import { getCached, setCache } from './cache';
import { IdentityClient } from './identity-client';

export interface AuthResult {
  valid: boolean;
  userId?: number;
  email?: string;
  role?: 'HOST' | 'EDITOR' | 'VIEWER';
  error?: string;
}

export interface UserInfo {
  userId: number;
  role: 'HOST' | 'EDITOR' | 'VIEWER';
  meetingId: string;
}

// Verify JWT token via Identity Service TCP RPC
export async function verifyToken(token: string): Promise<AuthResult> {
  try {
    // Call Identity Service via TCP RPC for full validation
    const user = await IdentityClient.validateToken(token);
    return {
      valid: true,
      userId: user.id,
      email: user.email,
    };
  } catch (err) {
    return {
      valid: false,
      error: 'Invalid or expired token',
    };
  }
}

// Get user role from Identity Service with Redis caching
export async function getUserRole(
  userId: number,
  meetingId: string,
): Promise<'HOST' | 'EDITOR' | 'VIEWER'> {
  const cacheKey = `meeting:${meetingId}:user:${userId}:role`;

  // Check Redis cache first
  const cachedRole = await getCached<'HOST' | 'EDITOR' | 'VIEWER'>(cacheKey);
  if (cachedRole) {
    console.log(`[Auth] Role cache hit: ${cacheKey} = ${cachedRole}`);
    return cachedRole;
  }

  // Call Identity Service via TCP RPC
  try {
    const role = await IdentityClient.getMeetingRole(meetingId, userId);

    // Cache the role for 5 minutes
    await setCache(cacheKey, role, config.roleCacheTtl);
    console.log(`[Auth] Role cached: ${cacheKey} = ${role}`);

    return role;
  } catch (err) {
    console.error(`[Auth] Failed to get role from Identity Service:`, err);
    // Fallback to VIEWER on error (conservative approach)
    return 'VIEWER';
  }
}

// Invalidate role cache (call when user role changes)
export async function invalidateRoleCache(meetingId: string, userId: number): Promise<void> {
  const cacheKey = `meeting:${meetingId}:user:${userId}:role`;
  const { deleteCache } = await import('./cache');
  await deleteCache(cacheKey);
  console.log(`[Auth] Role cache invalidated: ${cacheKey}`);
}
```

### 2.6. Main WebSocket Server

```typescript
// services_ms/apps/collab-ws/src/main.ts
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { config } from './config';
import { CollabClient } from './collab-client';
import { RoomManager, roomManager } from './room-manager';
import { verifyToken, getUserRole, UserInfo } from './auth';
import { IdentityClient } from './identity-client';

const msgSync = 0;
const msgAwareness = 1;

interface ConnectionInfo {
  meetingId: string;
  userId: number;
  role: 'HOST' | 'EDITOR' | 'VIEWER';
}

// Check if user can edit (HOST or EDITOR can write)
function canEdit(role: string): boolean {
  return role === 'HOST' || role === 'EDITOR';
}

const docs = new Map<string, Y.Doc>();
const awarenessMap = new Map<string, awarenessProtocol.Awareness>();
const connections = new Map<WebSocket, ConnectionInfo>();

function getDoc(meetingId: string): Y.Doc {
  if (!docs.has(meetingId)) {
    const doc = new Y.Doc();
    docs.set(meetingId, doc);
    awarenessMap.set(meetingId, new awarenessProtocol.Awareness(doc));
  }
  return docs.get(meetingId)!;
}

async function handleConnection(ws: WebSocket, meetingId: string, token: string) {
  // Step 1: Verify JWT token
  const authResult = await verifyToken(token);
  if (!authResult.valid || !authResult.userId) {
    console.log(`[WS] Auth failed: ${authResult.error}`);
    ws.close(4001, 'Unauthorized');
    return;
  }

  // Step 2: Get user role from Identity Service (with Redis caching)
  const role = await getUserRole(authResult.userId, meetingId);
  console.log(`[WS] User ${authResult.userId} connected to meeting ${meetingId} with role ${role}`);

  // Attach user info to socket
  connections.set(ws, {
    meetingId,
    userId: authResult.userId,
    role,
  });

  const doc = getDoc(meetingId);
  const awareness = awarenessMap.get(meetingId)!;

  // Set awareness state with user info
  awarenessProtocol.setLocalAwarenessField(
    awareness,
    authResult.userId,
    {
      userId: authResult.userId,
      role: role,
      name: `User ${authResult.userId}`,
      color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
    } as UserInfo
  );

  // Gửi sync step 1
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, msgSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  ws.send(encoding.toUint8Array(encoder));

  // Gửi awareness state
  const awarenessEncoder = encoding.createEncoder();
  encoding.writeVarUint(awarenessEncoder, msgAwareness);
  encoding.writeVarUint8Array(
    awarenessEncoder,
    awarenessProtocol.encodeAwarenessUpdate(
      awareness,
      Array.from(awareness.getStates().keys()),
    ),
  );
  ws.send(encoding.toUint8Array(awarenessEncoder));

  ws.on('message', (message: Buffer) => {
    const data = new Uint8Array(message);
    const decoder = decoding.createDecoder(data);
    const messageType = decoding.readVarUint(decoder);

    const info = connections.get(ws);
    if (!info) return;

    switch (messageType) {
      case msgSync:
        // Step 3: Validate write permission before applying update
        if (!canEdit(info.role)) {
          console.log(`[WS] User ${info.userId} (${info.role}) tried to edit - denied`);
          return; // VIEWER cannot send updates
        }

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, msgSync);
        const syncMessageType = syncProtocol.readSyncMessage(
          decoder,
          encoder,
          doc,
          ws,
        );

        if (encoding.length(encoder) > 1) {
          ws.send(encoding.toUint8Array(encoder));
        }

        // Broadcast update to other clients
        if (syncMessageType === syncProtocol.messageYjsSyncStep2) {
          broadcastUpdate(meetingId, data, ws);
          console.log(`[WS] Broadcast update from user ${info.userId}`);
        }
        break;

      case msgAwareness:
        awarenessProtocol.applyAwarenessUpdate(
          awareness,
          decoding.readVarUint8Array(decoder),
          ws,
        );
        broadcastAwareness(meetingId, data, ws);
        break;
    }
  });

  ws.on('close', () => {
    const info = connections.get(ws);
    if (info) {
      console.log(`[WS] User ${info.userId} disconnected from meeting ${info.meetingId}`);
      roomManager.removeUser(info.meetingId, ws);
      // Clear awareness state
      awarenessProtocol.removeLocalAwarenessState(awareness, info.userId, null);
      connections.delete(ws);
    }
  });
}

function broadcastUpdate(meetingId: string, data: Uint8Array, sender: WebSocket) {
  connections.forEach((info, ws) => {
    if (info.meetingId === meetingId && ws !== sender && ws.readyState === WebSocket.OPEN) {
      ws.send(Buffer.from(data));
    }
  });
}

function broadcastAwareness(meetingId: string, data: Uint8Array, sender: WebSocket) {
  connections.forEach((info, ws) => {
    if (info.meetingId === meetingId && ws !== sender && ws.readyState === WebSocket.OPEN) {
      ws.send(Buffer.from(data));
    }
  });
}

// Start WebSocket server
const wss = new WebSocketServer({ port: config.wsPort });

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url || '', `http://localhost:${config.wsPort}`);
  const meetingId = url.searchParams.get('meetingId');
  const token = url.searchParams.get('token');

  if (!meetingId || !token) {
    ws.close(4000, 'Missing meetingId or token');
    return;
  }

  console.log(`[WS] New connection: meetingId=${meetingId}`);
  await handleConnection(ws, meetingId, token);
});

console.log(`[WS] y-websocket server running on port ${config.wsPort}`);
```
```

---

## 3. File Cần Tạo

```
services_ms/apps/collab-ws/
├── package.json
├── tsconfig.json
├── src/
│   ├── main.ts              # Entry point
│   ├── config.ts            # Environment config
│   ├── cache.ts             # Redis cache wrapper (role caching)
│   ├── identity-client.ts   # TCP RPC client to Identity Service
│   ├── collab-client.ts     # TCP RPC client to Collab Service
│   ├── auth.ts              # JWT authentication + Identity Service integration
│   └── room-manager.ts     # Room management
└── dist/                    # Build output
```

---

## Làm Sao Để Test?

### Test 1: Build collab-ws

```bash
cd services_ms/apps/collab-ws
npm run build
```

**Expected:** Build thành công không có errors

### Test 2: Start collab-ws

```bash
cd services_ms/apps/collab-ws
npm run dev
```

**Expected:**
```
y-websocket server running on port 3008
```

### Test 3: WebSocket Connection Test

Tạo file `test-ws.js`:

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3008/ws/collab?meetingId=test-123&token=test-token');

ws.on('open', () => {
  console.log('Connected to y-websocket');
});

ws.on('message', (data) => {
  console.log('Received message:', data.toString('hex').substring(0, 100));
});

ws.on('close', (code, reason) => {
  console.log('Disconnected:', code, reason);
});

ws.on('error', (err) => {
  console.log('Error:', err.message);
});

// Disconnect after 5 seconds
setTimeout(() => {
  ws.close();
}, 5000);
```

```bash
node test-ws.js
```

**Expected:**
```
Connected to y-websocket
Received message: <binary data>
```

---

## Output Sau Step Này

Sau khi hoàn thành STEP-04:

1. ✅ y-websocket server chạy trên port 3008
2. ✅ JWT authentication được implement
3. ✅ Room management với Yjs document
4. ✅ TCP RPC client để giao tiếp với Collab Service

---

## Tiếp Theo

👉 **[STEP-05: Frontend Integration](./STEP-05.md)** - Tích hợp collaborative editor vào Next.js frontend
