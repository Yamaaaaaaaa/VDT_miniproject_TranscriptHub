# STEP-04: y-websocket Server

## Mục Tiêu

Tạo y-websocket server - một standalone Node.js server (không phải NestJS) để xử lý real-time CRDT synchronization qua WebSocket.

## Dependencies

- ✅ STEP-00 (Prerequisites)
- ✅ STEP-02 (Collab Service - TCP RPC Server)
- ✅ STEP-03 (Meeting Service - TCP RPC Client)

## Checklist

- [ ] Tạo thư mục `services_ms/apps/collab-ws`
- [ ] Cài đặt dependencies (y-websocket, yjs, etc.)
- [ ] Implement JWT authentication middleware
- [ ] Implement WebSocket server với room management
- [ ] Implement TCP RPC client để giao tiếp với Collab Service
- [ ] Test WebSocket connection

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
  jwtSecret: process.env.JWT_SECRET || 'your-jwt-secret',
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT || '6379'),
  identityServiceUrl: process.env.IDENTITY_SERVICE_URL || 'http://localhost:3002',
};
```

### 2.2. TCP RPC Client Wrapper

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

  canEdit(role: string): boolean {
    return role === 'HOST' || role === 'EDITOR';
  }
}

export const roomManager = new RoomManager();
```

### 2.4. JWT Auth Middleware

```typescript
// services_ms/apps/collab-ws/src/auth.ts
import * as jwt from 'jsonwebtoken';
import { config } from './config';

export interface AuthResult {
  valid: boolean;
  userId?: number;
  role?: 'HOST' | 'EDITOR' | 'VIEWER';
  error?: string;
}

export async function verifyToken(token: string): Promise<AuthResult> {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    return {
      valid: true,
      userId: decoded.sub || decoded.userId,
    };
  } catch (err) {
    return {
      valid: false,
      error: 'Invalid token',
    };
  }
}

export async function getUserRole(
  userId: number,
  meetingId: string,
): Promise<'HOST' | 'EDITOR' | 'VIEWER'> {
  // TODO: Gọi Identity Service để lấy role
  // Hiện tại trả về EDITOR để test
  return 'EDITOR';
}
```

### 2.5. Main WebSocket Server

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
import { verifyToken, getUserRole } from './auth';

const msgSync = 0;
const msgAwareness = 1;

interface ConnectionInfo {
  meetingId: string;
  userId: number;
  role: string;
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
  const authResult = await verifyToken(token);
  if (!authResult.valid || !authResult.userId) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  const role = await getUserRole(authResult.userId, meetingId);

  connections.set(ws, {
    meetingId,
    userId: authResult.userId,
    role,
  });

  const doc = getDoc(meetingId);
  const awareness = awarenessMap.get(meetingId)!;

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
      roomManager.removeUser(info.meetingId, ws);
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

  console.log(`New connection: meetingId=${meetingId}`);
  await handleConnection(ws, meetingId, token);
});

console.log(`y-websocket server running on port ${config.wsPort}`);
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
│   ├── auth.ts              # JWT authentication
│   ├── collab-client.ts     # TCP RPC client
│   └── room-manager.ts      # Room management
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
