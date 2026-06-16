# STEP-04: Collab Gateway (NestJS WebSocket + y-protocols)

## Mục Tiêu

Tạo Collab Gateway - một NestJS WebSocket Gateway sử dụng `@nestjs/websockets` và **y-protocols** để xử lý real-time CRDT synchronization.

**Lưu ý quan trọng:** Chúng ta **KHÔNG dùng y-websocket server** trực tiếp. Thay vào đó, chúng ta import và sử dụng riêng **y-protocols** (sync, awareness) để:
- Tích hợp hoàn toàn với NestJS
- Kiểm soát auth và business logic
- Share TCP clients với các services khác

## Dependencies

- ✅ STEP-00 (Prerequisites)
- ✅ STEP-02 (Collab Service - TCP RPC Server)
- ✅ STEP-03 (Meeting Service - TCP RPC Client)

## Checklist

- [x] Tạo thư mục `services_ms/apps/collab-gateway`
- [x] Cài đặt NestJS app với `@nestjs/websockets`
- [x] Implement Redis cache module cho role caching
- [x] Implement JWT WebSocket Guard (lấy token từ query params)
- [x] Implement TCP client module cho Identity Service
- [x] Implement TCP client module cho Collab Service
- [x] Implement Collab Gateway (WebSocket) với y-protocols
- [x] Implement Room Service cho Yjs document management
- [x] Implement role-based write filtering (HOST/EDITOR allowed, VIEWER blocked)
- [x] Cập nhật `nest-cli.json` để include collab-gateway
- [ ] Test WebSocket connection

---

## 1. Tại Sao Dùng y-protocols Thay Vì y-websocket?

### 1.1. Sự khác nhau giữa y-websocket và y-protocols

```
┌─────────────────────────────────────────────────────────────────┐
│                         y-websocket                               │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  WebSocket Server + Protocol + Auth + Document Management  ││
│  └─────────────────────────────────────────────────────────────┘│
│  • Hoạt động độc lập                                          │
│  • Không tích hợp được với NestJS DI                          │
│  • Auth logic cứng nhắc                                        │
│  • Khó customize cho microservices architecture                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         y-protocols                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │  syncProtocol    │  │ awarenessProtocol │  │  lib0       │ │
│  │  (CRDT sync)    │  │  (Presence)      │  │  (encoding) │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
│  • Chỉ là protocol implementations                             │
│  • Dùng được với bất kỳ WebSocket server nào                  │
│  • Hoàn toàn tích hợp được với NestJS                         │
│  • Linh hoạt cho microservices                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2. Khi nào nên dùng y-websocket trực tiếp?

- ✅ Prototype nhanh
- ✅ Đơn giản, không cần microservices
- ✅ Không cần NestJS

### 1.3. Khi nào nên dùng y-protocols?

- ✅ Microservices architecture
- ✅ Cần tích hợp với NestJS
- ✅ Cần custom auth, logging, monitoring
- ✅ Cần share code với các services khác

---

## 2. Cài Đặt Project

### 2.1. Cấu trúc files

```
services_ms/apps/collab-gateway/
├── src/
│   ├── main.ts                          # Entry point
│   ├── collab-gateway.module.ts         # WebSocket module
│   ├── collab-gateway.gateway.ts        # WebSocket Gateway + y-protocols
│   ├── auth/
│   │   └── ws-jwt.guard.ts             # JWT Guard for WebSocket
│   ├── collab-client/
│   │   ├── collab-client.module.ts
│   │   └── collab-client.service.ts     # TCP client to Collab
│   ├── identity-client/
│   │   ├── identity-client.module.ts
│   │   └── identity-client.service.ts    # TCP client to Identity
│   ├── room/
│   │   ├── room.module.ts
│   │   └── room.service.ts              # Yjs room management
│   ├── cache/
│   │   ├── cache.module.ts
│   │   └── cache.service.ts             # Redis cache wrapper
│   ├── common/
│   │   ├── tcp-client.ts                # TCP RPC base class
│   │   └── ws-exception.filter.ts        # WebSocket exception filter
│   └── config/
│       └── env.config.ts                # Environment variables
├── tsconfig.app.json
└── (package.json từ root monorepo)
```

---

## 3. Chi Tiết y-protocols Implementation

### 3.1. Imports cần thiết

```typescript
// y-protocols cho CRDT sync và awareness
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';

// lib0 cho binary encoding/decoding
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
```

### 3.2. Message Types

y-protocols định nghĩa 2 message types cơ bản:

```typescript
const msgSync = 0;        // CRDT synchronization messages
const msgAwareness = 1;   // Presence/awareness messages
```

### 3.3. Binary Protocol Format

Mỗi message có format:

```
┌────────────┬─────────────────────────┐
│ byte 0    │ bytes 1-4 + payload    │
├────────────┼─────────────────────────┤
│ msgType   │ length (4 bytes BE)    │
│ (1 byte)  │ + JSON/binary data     │
└────────────┴─────────────────────────┘
```

**Ví dụ encoding:**

```typescript
// Tạo encoder
const encoder = encoding.createEncoder();

// Viết message type (1 byte)
encoding.writeVarUint(encoder, msgSync);

// Viết sync step 1 (CRDT state)
syncProtocol.writeSyncStep1(encoder, doc);

// Chuyển thành Uint8Array để gửi qua WebSocket
const message = encoding.toUint8Array(encoder);
client.send(message);
```

**Ví dụ decoding:**

```typescript
// Khi nhận được message
const data: Uint8Array = ...;

// Tạo decoder
const decoder = decoding.createDecoder(data);

// Đọc message type
const messageType = decoding.readVarUint(decoder);

if (messageType === msgSync) {
  // Xử lý sync message
  syncProtocol.readSyncMessage(decoder, encoder, doc, client);
} else if (messageType === msgAwareness) {
  // Xử lý awareness message
  const awarenessData = decoding.readVarUint8Array(decoder);
  awarenessProtocol.applyAwarenessUpdate(awareness, awarenessData, client);
}
```

### 3.4. Sync Protocol Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      SYNC PROTOCOL FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. CLIENT CONNECT                                                │
│  ┌─────────┐                           ┌──────────────┐        │
│  │ Client  │  ──── sync-step-1 ────▶  │   Gateway    │        │
│  │         │  ◀────── ack ───────────│   (Y.Doc)   │        │
│  └─────────┘                           └──────────────┘        │
│                                                                  │
│  2. CLIENT EDIT (CRDT UPDATE)                                    │
│  ┌─────────┐                           ┌──────────────┐        │
│  │ Client  │  ──── sync-step-2 ────▶  │   Gateway    │        │
│  │         │  ◀──── broadcast ────────│   (Y.Doc)   │        │
│  └─────────┘     (to all peers)       └──────────────┘        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Sync Step 1 (Server gửi initial state):**

```typescript
// Khi client join, gửi full document state
const encoder = encoding.createEncoder();
encoding.writeVarUint(encoder, msgSync);
syncProtocol.writeSyncStep1(encoder, doc);
client.send(encoding.toUint8Array(encoder));
```

**Sync Step 2 (Client gửi local updates):**

```typescript
// Xử lý update từ client
const encoder = encoding.createEncoder();
encoding.writeVarUint(encoder, msgSync);
const syncType = syncProtocol.readSyncMessage(decoder, encoder, doc, client);

// Nếu là sync-step-2, broadcast cho các clients khác
if (syncType === syncProtocol.messageYjsSyncStep2) {
  this.broadcastToRoom(data);
}
```

### 3.5. Awareness Protocol Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    AWARENESS PROTOCOL FLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AWARENESS STATE STRUCTURE:                                      │
│  {                                                              │
│    userId: 123,                                                 │
│    name: "John",                                                │
│    color: "#ff0000",                                            │
│    cursor: { index: 10, length: 5 },  // optional               │
│    isTyping: true                       // optional              │
│  }                                                              │
│                                                                  │
│  FLOW:                                                          │
│  ┌─────────┐                           ┌──────────────┐        │
│  │ Client  │  ── awareness update ──▶  │   Gateway    │        │
│  │         │  ◀─── broadcast ──────────│  (Awareness) │        │
│  └─────────┘                           └──────────────┘        │
│                                                                  │
│  USAGE:                                                          │
│  - Show online users (avatars)                                   │
│  - Show cursor positions                                         │
│  - Show who's editing what segment                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Set local awareness:**

```typescript
// Khi user join, set awareness state
awareness.setLocalStateField('user', {
  userId: userData.userId,
  role: userData.role,
  name: `User ${userData.userId}`,
  color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
});

// Encode và gửi cho client
const awarenessEncoder = encoding.createEncoder();
encoding.writeVarUint(awarenessEncoder, msgAwareness);
encoding.writeVarUint8Array(
  awarenessEncoder,
  awarenessProtocol.encodeAwarenessUpdate(
    awareness,
    Array.from(awareness.getStates().keys()),
  ),
);
client.send(encoding.toUint8Array(awarenessEncoder));
```

**Apply remote awareness:**

```typescript
// Khi nhận awareness update từ client khác
awarenessProtocol.applyAwarenessUpdate(
  awareness,
  decoding.readVarUint8Array(decoder),
  client,
);

// Broadcast cho các clients khác
this.broadcastToRoom(userData.meetingId, data, client.id);
```

---

## 4. Source Files Chi Tiết

### 4.1. WebSocket Gateway (Main) - Giải thích từng phần

```typescript
// services_ms/apps/collab-gateway/src/collab-gateway.gateway.ts
import {
  WebSocketGateway,          // Decorator để đánh dấu class là WebSocket gateway
  WebSocketServer,           // Inject server instance
  SubscribeMessage,          // Decorator để subscribe message
  OnGatewayConnection,       // Lifecycle hook khi client connect
  OnGatewayDisconnect,      // Lifecycle hook khi client disconnect
  MessageBody,               // Decorator để lấy message body
  ConnectedSocket,           // Decorator để lấy socket instance
} from '@nestjs/websockets';

import { Server, Socket } from 'socket.io';  // Socket.io types

// y-protocols imports
import * as syncProtocol from 'y-protocols/sync';        // CRDT sync
import * as awarenessProtocol from 'y-protocols/awareness'; // Presence
import * as encoding from 'lib0/encoding';                 // Binary encoding
import * as decoding from 'lib0/decoding';                 // Binary decoding
```

**Message Type Constants:**

```typescript
// y-protocols định nghĩa các message types này
// Chúng ta dùng constants để dễ đọc
const msgSync = 0;        // 0 = sync protocol message
const msgAwareness = 1;   // 1 = awareness protocol message
```

**@WebSocketGateway Decorator:**

```typescript
@WebSocketGateway({
  cors: {
    origin: '*',  // Cho phép CORS từ mọi origin
  },
})
export class CollabGatewayGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;  // Socket.io server instance
```

**OnGatewayConnection:**

```typescript
// Được gọi khi client kết nối
handleConnection(client: Socket) {
  // client.id = unique socket ID
  // client.handshake = { query: { token, meetingId }, headers: {...} }
  this.logger.log(`Client connected: ${client.id}`);
}
```

**Sync Message Handler:**

```typescript
@UseGuards(WsJwtGuard)  // Áp dụng JWT auth guard
@SubscribeMessage('sync')  // Listen for 'sync' events
async handleSync(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: number[],  // Binary data từ Socket.io
) {
  const userData = client.data.user;

  // 1. Check write permission (VIEWER cannot edit)
  if (!this.roomService.canEdit(userData.role)) {
    this.logger.warn(`User ${userData.userId} tried to edit - denied`);
    return;
  }

  // 2. Get Y.Doc cho meeting
  const { doc } = this.roomService.getOrCreateDoc(userData.meetingId);

  // 3. Decode binary message
  const uint8Data = new Uint8Array(data);
  const decoder = decoding.createDecoder(uint8Data);
  const messageType = decoding.readVarUint(decoder);

  // 4. Xử lý sync message
  if (messageType === msgSync) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, msgSync);

    // syncProtocol.readSyncMessage xử lý:
    // - Nếu là sync-step-1: trả về doc state
    // - Nếu là sync-step-2: apply updates, broadcast
    const syncType = syncProtocol.readSyncMessage(
      decoder, encoder, doc, client
    );

    // Gửi response nếu cần
    if (encoding.length(encoder) > 1) {
      client.send(encoding.toUint8Array(encoder));
    }

    // Broadcast nếu là update (sync-step-2)
    if (syncType === syncProtocol.messageYjsSyncStep2) {
      this.broadcastToRoom(userData.meetingId, data, client.id);
    }
  }
}
```

**Sync Step 1 Handler (Initial Connection):**

```typescript
@UseGuards(WsJwtGuard)
@SubscribeMessage('sync-step-1')
async handleSyncStep1(@ConnectedSocket() client: Socket) {
  const userData = client.data.user;
  const { doc, awareness } = this.roomService.getOrCreateDoc(userData.meetingId);

  // 1. Set awareness state cho user
  awareness.setLocalStateField('user', {
    userId: userData.userId,
    role: userData.role,
    name: `User ${userData.userId}`,
    color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
  });

  // 2. Gửi sync-step-1 (full document state)
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, msgSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  client.send(encoding.toUint8Array(encoder));

  // 3. Gửi awareness state
  const awarenessEncoder = encoding.createEncoder();
  encoding.writeVarUint(awarenessEncoder, msgAwareness);
  encoding.writeVarUint8Array(
    awarenessEncoder,
    awarenessProtocol.encodeAwarenessUpdate(
      awareness,
      Array.from(awareness.getStates().keys()),
    ),
  );
  client.send(encoding.toUint8Array(awarenessEncoder));

  this.logger.log(`User ${userData.userId} joined meeting ${userData.meetingId}`);
}
```

**Awareness Message Handler:**

```typescript
@UseGuards(WsJwtGuard)
@SubscribeMessage('awareness')
handleAwareness(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: number[],
) {
  const userData = client.data.user;
  const { awareness } = this.roomService.getOrCreateDoc(userData.meetingId);

  // Apply awareness update (cursor, selection, etc.)
  awarenessProtocol.applyAwarenessUpdate(
    awareness,
    new Uint8Array(data),
    client,
  );

  // Broadcast cho các clients khác
  this.broadcastToRoom(userData.meetingId, data, client.id);
}
```

**Broadcast Helper:**

```typescript
private broadcastToRoom(meetingId: string, data: any, excludeClientId: string) {
  // Emit cho tất cả clients trong room
  // Lưu ý: Trong production, cần dùng Redis adapter để
  // broadcast qua nhiều instances
  this.server.emit('sync', data);
}
```

---

## 5. JWT Guard Chi Tiết

### 5.1. Tại sao cần WebSocket Guard?

```
HTTP Guard:                                    WebSocket Guard:
┌──────────────┐                              ┌──────────────┐
│ Request      │                              │ Connection   │
│ Headers      │                              │ handshake    │
│ Authorization│                              │ query.token  │
└──────────────┘                              └──────────────┘
       │                                             │
       ▼                                             ▼
  @UseGuards(Guard)                           @UseGuards(WsJwtGuard)
       │                                             │
       ▼                                             ▼
  canActivate()                                 canActivate()
  - Read headers                                - Read handshake.query
  - Validate JWT                               - Validate JWT
  - Attach user                                - Attach user to socket.data
```

### 5.2. Implementation

```typescript
@Injectable()
export class WsJwtGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Lấy socket từ context
    const client: Socket = context.switchToWs().getClient();

    // 2. Lấy token và meetingId từ query params
    // (WebSocket không có headers, chỉ có query)
    const token = client.handshake.query.token as string;
    const meetingId = client.handshake.query.meetingId as string;

    if (!token || !meetingId) {
      throw new WsException('Missing token or meetingId');
    }

    try {
      // 3. Validate token qua Identity Service
      const user = await this.identityClient.validateToken(token);

      // 4. Get user role với caching
      const role = await this.getUserRoleWithCache(meetingId, user.id);

      // 5. Attach user info vào socket.data
      // (socket.data sẽ persist trong suốt connection)
      client.data.user = {
        userId: user.id,
        email: user.email,
        role,
        meetingId,
      };

      return true;
    } catch (error) {
      throw new WsException('Unauthorized');
    }
  }
}
```

---

## 6. Room Service Chi Tiết

### 6.1. Room Management

```typescript
@Injectable()
export class RoomService implements OnModuleDestroy {
  // Map<meetingId, Y.Doc>
  private docs = new Map<string, Y.Doc>();

  // Map<meetingId, Awareness>
  private awarenessMap = new Map<string, awarenessProtocol.Awareness>();

  getOrCreateDoc(meetingId: string): { doc: Y.Doc; awareness: awarenessProtocol.Awareness } {
    if (!this.docs.has(meetingId)) {
      // Tạo mới Y.Doc
      const doc = new Y.Doc();

      // Tạo awareness instance cho document
      // Awareness tự động sync presence state
      const awareness = new awarenessProtocol.Awareness(doc);

      // Lưu vào maps
      this.docs.set(meetingId, doc);
      this.awarenessMap.set(meetingId, awareness);

      // Load initial state từ Collab Service
      this.loadDocument(meetingId, doc);

      return { doc, awareness };
    }

    return {
      doc: this.docs.get(meetingId)!,
      awareness: this.awarenessMap.get(meetingId)!,
    };
  }

  // Check quyền edit dựa trên role
  canEdit(role: string): boolean {
    return role === 'HOST' || role === 'EDITOR';
  }

  onModuleDestroy() {
    // Cleanup khi service shutdown
    this.docs.forEach((doc) => doc.destroy());
  }
}
```

### 6.2. Initialize Document từ Content

```typescript
private initializeDocFromContent(doc: Y.Doc, content: any) {
  // Y.Text cho raw transcript
  const yText = doc.getText('transcript');
  if (content.rawText) {
    yText.insert(0, content.rawText);
  }

  // Y.Array cho structured segments
  const ySegments = doc.getArray('segments');
  if (content.structuredContent?.segments) {
    ySegments.insert(0, content.structuredContent.segments);
  }
}
```

---

## 7. Environment Variables

**Collab Gateway:**
```
WS_PORT=3008
COLLAB_SERVICE_HOST=collab-service
COLLAB_SERVICE_TCP_PORT=3007
IDENTITY_SERVICE_HOST=identity-service
IDENTITY_SERVICE_TCP_PORT=3002
REDIS_HOST=redis
REDIS_PORT=6379
ROLE_CACHE_TTL=300
```

---

## 8. Test WebSocket Connection

### 8.1. Test Script

```javascript
// test-ws.js
const { io } = require('socket.io-client');

const socket = io('http://localhost:3008', {
  query: {
    meetingId: 'test-123',
    token: 'your-jwt-token',
  },
});

socket.on('connect', () => {
  console.log('✅ Connected to Collab Gateway');

  // Request sync step 1 (initial document state)
  socket.emit('sync-step-1');
});

socket.on('sync', (data) => {
  console.log('📨 Received sync message:', data.byteLength, 'bytes');
});

socket.on('awareness', (data) => {
  console.log('👥 Received awareness update:', data.byteLength, 'bytes');
});

socket.on('error', (err) => {
  console.log('❌ Error:', err);
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

### 8.2. Chạy test

```bash
# Start collab-gateway
cd services_ms
npm run start:dev -- collab-gateway

# Run test (in another terminal)
node test-ws.js
```

---

## 9. Troubleshooting

### 9.1. Client không nhận được sync message

1. Check JWT token có hợp lệ không
2. Check meetingId có đúng format không
3. Check `sync-step-1` event được emit chưa

### 9.2. Awareness không hoạt động

1. Check awareness instance được tạo cho mỗi document
2. Check `setLocalStateField` được gọi khi join
3. Check `applyAwarenessUpdate` được gọi khi nhận

### 9.3. Role-based edit không hoạt động

1. Check `canEdit()` method
2. Check role được attach vào socket.data
3. Check `WsJwtGuard` chạy trước message handlers

---

## 10. Output Sau Step Này

Sau khi hoàn thành STEP-04:

1. ✅ Collab Gateway (NestJS) chạy trên port 3008
2. ✅ JWT authentication được implement (WsJwtGuard)
3. ✅ Room management với Yjs document
4. ✅ TCP RPC client để giao tiếp với Collab Service
5. ✅ Role-based write filtering (HOST/EDITOR allowed, VIEWER blocked)
6. ✅ y-protocols integration (sync + awareness)
7. ✅ Binary protocol với lib0 encoding

---

## 11. Tiếp Theo

👉 **[STEP-05: Frontend Integration](./STEP-05.md)** - Tích hợp collaborative editor vào Next.js frontend
