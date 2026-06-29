# y-protocols - Protocol Implementations cho Yjs

Tài liệu này giải thích **y-protocols** - các protocol implementations rời rạc mà Yjs ecosystem sử dụng để sync data và presence giữa các clients.

---

## 1. Tổng Quan

### 1.1. y-protocols là gì?

**y-protocols** là một collection các protocol implementations nhẹ được sử dụng bởi Yjs ecosystem:

```
┌─────────────────────────────────────────────────────────────────┐
│                      YJS ECOSYSTEM                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                        Yjs                               │    │
│  │   (Core CRDT implementation)                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                    │
│          ┌───────────────────┼───────────────────┐              │
│          ▼                   ▼                   ▼              │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐     │
│  │ y-protocols   │  │ y-websocket   │  │  y-indexeddb  │     │
│  │               │  │               │  │               │     │
│  │ • sync        │  │ (uses        │  │ (persistence)  │     │
│  │ • awareness   │  │  protocols)  │  │               │     │
│  │               │  │               │  │               │     │
│  └───────────────┘  └───────────────┘  └───────────────┘     │
│                                                                  │
│  Dependencies:                                                   │
│  └────────────────── lib0 (encoding/decoding)                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2. Các Packages trong y-protocols

| Package | Mô tả |
|---------|--------|
| `y-protocols/sync` | CRDT synchronization protocol |
| `y-protocols/awareness` | Presence/awareness protocol |
| `y-protocols/selection` | Selection/cursor tracking |
| `y-protocols/distributed-awareness` | Distributed awareness |

### 1.3. Dependencies: lib0

**lib0** là một series of zero-dependency libraries cho binary encoding:

```typescript
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
```

---

## 2. Binary Encoding với lib0

### 2.1. Tại sao dùng Binary?

```
┌─────────────────────────────────────────────────────────────────┐
│                   TEXT vs BINARY PROTOCOL                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TEXT PROTOCOL (JSON):                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ {                                                        │   │
│  │   "type": "sync",                                       │   │
│  │   "data": "Hello World",                                │   │
│  │   "clientId": 12345                                    │   │
│  │ }                                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│  Size: ~70 bytes + JSON parse overhead                          │
│                                                                  │
│  BINARY PROTOCOL (lib0):                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ [0x00][0x0B][48 65 6C 6C 6F 20 57 6F 72 6C 64]      │   │
│  │   │      │                                                │   │
│  │   │      └── "Hello World" (11 bytes)                    │   │
│  │   └───────── length: 11 (4 bytes BE)                      │   │
│  │   ────────── message type: 0                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│  Size: 7 bytes, no parsing needed                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2. Encoding API

```typescript
import * as encoding from 'lib0/encoding';

// ===== CREATE ENCODER =====
const encoder = encoding.createEncoder();

// ===== WRITE OPERATIONS =====

// Write unsigned integer (varint)
encoding.writeVarUint(encoder, 42);

// Write signed integer
encoding.writeVarInt(encoder, -42);

// Write string
encoding.writeVarString(encoder, 'Hello');

// Write Uint8Array
const data = new Uint8Array([1, 2, 3, 4]);
encoding.writeVarUint8Array(encoder, data);

// Write length-prefixed array
encoding.writeLength(encoder, 10);

// ===== TO BYTES =====
const bytes = encoding.toUint8Array(encoder);
console.log(bytes);  // Uint8Array [...]
```

### 2.3. Decoding API

```typescript
import * as decoding from 'lib0/decoding';

// ===== CREATE DECODER =====
const decoder = decoding.createDecoder(data);

// ===== READ OPERATIONS =====

// Read unsigned integer
const num = decoding.readVarUint(decoder);

// Read signed integer
const signed = decoding.readVarInt(decoder);

// Read string
const str = decoding.readVarString(decoder);

// Read Uint8Array
const arr = decoding.readVarUint8Array(decoder);

// ===== CHECK REMAINING =====
const remaining = decoding.length(decoder);
```

### 2.4. Example: Custom Message Encoding

```typescript
// ===== ENCODE =====
function encodeMessage(type: number, payload: string, clientId: number): Uint8Array {
  const encoder = encoding.createEncoder();

  // Message format: [type][payload_length][payload][clientId]
  encoding.writeVarUint(encoder, type);           // 1 byte
  encoding.writeVarString(encoder, payload);       // length + string
  encoding.writeVarUint(encoder, clientId);       // 1-8 bytes

  return encoding.toUint8Array(encoder);
}

// ===== DECODE =====
function decodeMessage(data: Uint8Array) {
  const decoder = decoding.createDecoder(data);

  const type = decoding.readVarUint(decoder);
  const payload = decoding.readVarString(decoder);
  const clientId = decoding.readVarUint(decoder);

  return { type, payload, clientId };
}

// Usage
const msg = encodeMessage(1, 'Hello', 12345);
const decoded = decodeMessage(msg);
console.log(decoded);  // { type: 1, payload: 'Hello', clientId: 12345 }
```

---

## 3. Sync Protocol (`y-protocols/sync`)

### 3.1. Mục đích

Sync protocol xử lý việc đồng bộ CRDT state giữa client và server.

```
┌─────────────────────────────────────────────────────────────────┐
│                       SYNC PROTOCOL                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CLIENT                                              SERVER       │
│  ┌─────────┐                                     ┌─────────┐  │
│  │ Y.Doc  │                                     │ Y.Doc  │  │
│  └────┬────┘                                     └────┬────┘  │
│       │                                               │        │
│       │ 1. sync-step-1 (full state request)        │        │
│       │ ─────────────────────────────────────────▶ │        │
│       │                                               │        │
│       │ 2. sync-step-1 (full state response)       │        │
│       │ ◀───────────────────────────────────────── │        │
│       │                                               │        │
│       │ 3. sync-step-2 (diff/updates)              │        │
│       │ ─────────────────────────────────────────▶ │        │
│       │                                               │        │
│       │ 4. (optional) sync-update                  │        │
│       │ ◀───────────────────────────────────────── │        │
│       │                                               │        │
└───────┴───────────────────────────────────────────────────────┘
```

### 3.2. Message Types

```typescript
import * as syncProtocol from 'y-protocols/sync';

// Sync message types
const messageYjsSyncStep1 = 0;    // Full state request/response
const messageYjsSyncStep2 = 1;    // Incremental update
const messageYjsUpdate = 2;        // Incremental update (alternative)
```

### 3.3. Server Implementation

```typescript
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

function handleSyncMessage(decoder: decoding.Decoder, doc: Y.Doc, client: WebSocket) {
  // Get encoder for response
  const encoder = encoding.createEncoder();

  // Read sync message type
  const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, doc, client);

  // Encode response if needed
  if (encoding.length(encoder) > 1) {
    const response = encoding.toUint8Array(encoder);
    client.send(response);
  }
}
```

### 3.4. Client Implementation

```typescript
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

function sendSyncStep1(doc: Y.Doc, socket: WebSocket) {
  // Gửi request cho full state
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep1);
  syncProtocol.writeSyncStep1(encoder, doc);

  socket.send(encoding.toUint8Array(encoder));
}

function handleServerMessage(data: Uint8Array, doc: Y.Doc) {
  const decoder = decoding.createDecoder(data);
  const encoder = encoding.createEncoder();

  // Xử lý message và apply updates
  syncProtocol.readSyncMessage(decoder, encoder, doc, null);
}
```

### 3.5. Sync Step 1 Chi Tiết

**Sync Step 1** được dùng để:
1. Client request full state từ server
2. Server respond với full document state

```typescript
// SERVER: Gửi full state
function sendSyncStep1(doc: Y.Doc, socket: WebSocket) {
  const encoder = encoding.createEncoder();

  // Write message type
  encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep1);

  // Write full document state
  syncProtocol.writeSyncStep1(encoder, doc);

  socket.send(encoding.toUint8Array(encoder));
}
```

### 3.6. Sync Step 2 Chi Tiết

**Sync Step 2** được dùng để:
1. Client gửi updates mà client có nhưng server chưa có
2. Server apply updates và respond với những gì client miss

```typescript
// CLIENT: Gửi local updates
function sendSyncStep2(doc: Y.Doc, socket: WebSocket) {
  const encoder = encoding.createEncoder();

  encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep2);

  // writeSyncStep2 computes diff và writes updates
  syncProtocol.writeSyncStep2(encoder, doc);

  socket.send(encoding.toUint8Array(encoder));
}
```

---

## 4. Awareness Protocol (`y-protocols/awareness`)

### 4.1. Mục đích

Awareness protocol xử lý **presence** - thông tin về trạng thái của users trong collaborative session.

```
┌─────────────────────────────────────────────────────────────────┐
│                    AWARENESS FEATURES                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  USER PRESENCE:                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  👤 John (editing segment 3)                          │    │
│  │  👤 Jane (idle)                                       │    │
│  │  👤 Bob (viewing)                                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  CURSOR POSITIONS:                                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  "Hello [cursor:John] world"                          │    │
│  │  "He[cursor:Jane]llo world"                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  SELECTION HIGHLIGHTING:                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  [John: ████████████]                                 │    │
│  │  [Jane: ████████     ]                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2. Awareness Class

```typescript
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';

class Awareness {
  constructor(doc: Y.Doc);

  // Local state management
  getLocalState(): Object | null;
  setLocalState(state: Object | null): void;
  setLocalStateField(field: string, value: any): void;

  // Remote states
  getStates(): Map<number, Object>;  // clientId -> state
  getLocalState(): Object | null;

  // Events
  on(event: 'change', handler: (changes: { added: number[], updated: number[], removed: number[] }) => void): void;
  off(event: 'change', handler: Function): void;

  // Cleanup
  destroy(): void;
}
```

### 4.3. Basic Usage

```typescript
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';

// Tạo awareness cho document
const awareness = new awarenessProtocol.Awareness(doc);

// ===== SET LOCAL STATE =====
awareness.setLocalState({
  user: {
    name: 'John',
    color: '#ff0000',
  },
  cursor: {
    index: 10,
    length: 5,
  },
  isTyping: true,
});

// ===== UPDATE PARTIAL STATE =====
awareness.setLocalStateField('cursor', { index: 20, length: 0 });

// ===== GET ALL STATES =====
const states = awareness.getStates();
states.forEach((state, clientId) => {
  console.log(`Client ${clientId}:`, state);
});

// ===== OBSERVE CHANGES =====
awareness.on('change', ({ added, updated, removed }) => {
  console.log('Added:', added);
  console.log('Updated:', updated);
  console.log('Removed:', removed);
});
```

### 4.4. Awareness Update Encoding

```typescript
// ===== ENCODE UPDATE =====
const encoder = encoding.createEncoder();
encoding.writeVarUint(encoder, msgAwareness);

// Encode awareness states
encoding.writeVarUint8Array(
  encoder,
  awarenessProtocol.encodeAwarenessUpdate(
    awareness,
    [clientId1, clientId2],  // Clients to include
  ),
);

socket.send(encoding.toUint8Array(encoder));

// ===== DECODE UPDATE =====
function handleAwarenessMessage(data: Uint8Array) {
  const decoder = decoding.createDecoder(data);
  decoding.readVarUint(decoder);  // Skip message type

  const update = decoding.readVarUint8Array(decoder);
  awarenessProtocol.applyAwarenessUpdate(awareness, update, client);
}
```

### 4.5. Cleaning Up

```typescript
// Khi client disconnect
awarenessProtocol.removeAwarenessStates(
  awareness,
  [clientId],
  null,  // origin (optional)
);

// Khi document destroyed
awareness.destroy();
```

### 4.6. Trong Collab Gateway

```typescript
// services_ms/apps/collab-gateway/src/room/room.service.ts
import * as awarenessProtocol from 'y-protocols/awareness';

export class RoomService {
  private awarenessMap = new Map<string, awarenessProtocol.Awareness>();

  getOrCreateDoc(meetingId: string) {
    if (!this.awarenessMap.has(meetingId)) {
      const doc = new Y.Doc();
      const awareness = new awarenessProtocol.Awareness(doc);
      this.awarenessMap.set(meetingId, awareness);
      return { doc, awareness };
    }

    return {
      doc: this.docs.get(meetingId),
      awareness: this.awarenessMap.get(meetingId),
    };
  }
}

// services_ms/apps/collab-gateway/src/collab-gateway.gateway.ts
awareness.setLocalStateField('user', {
  userId: userData.userId,
  role: userData.role,
  name: `User ${userData.userId}`,
  color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
});
```

---

## 5. Message Format Specification

### 5.1. Message Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                     WEBSOCKET MESSAGE FORMAT                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────┬──────────────────────────────────────────────────┐│
│  │ Byte 0 │ Bytes 1-4      │ Bytes 5+                         ││
│  ├────────┼────────────────┼──────────────────────────────────┤│
│  │ Type   │ Length         │ Payload                          ││
│  │ (1B)   │ (4B, BE)      │ (Variable)                      ││
│  └────────┴────────────────┴──────────────────────────────────┘│
│                                                                  │
│  Type = 0: Sync message (y-protocols/sync)                       │
│  Type = 1: Awareness message (y-protocols/awareness)              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2. Sync Message Payload

```
SYNC STEP 1:
┌─────────────────────────────────────────────────────────────────┐
│  [svClock: StateVector] [update: Update]                       │
├─────────────────────────────────────────────────────────────────┤
│  svClock: Client's state vector (what client has)               │
│  update: Server's full document state                           │
└─────────────────────────────────────────────────────────────────┘

SYNC STEP 2:
┌─────────────────────────────────────────────────────────────────┐
│  [update: Update]                                                │
├─────────────────────────────────────────────────────────────────┤
│  update: Client's updates since last sync                        │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3. Awareness Message Payload

```
AWARENESS:
┌─────────────────────────────────────────────────────────────────┐
│  [clientId1: Uint] [clock1: Uint] [state1: JSON]               │
│  [clientId2: Uint] [clock2: Uint] [state2: JSON]               │
│  ...                                                            │
│  [0x0] (terminator)                                            │
├─────────────────────────────────────────────────────────────────┤
│  clientId: Client identifier                                    │
│  clock: Lamport clock for conflict resolution                   │
│  state: JSON-encoded awareness state                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Complete Example

### 6.1. Simple Sync Server

```typescript
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { WebSocketServer, WebSocket } from 'ws';

const docs = new Map<string, Y.Doc>();
const awarenessMap = new Map<string, awarenessProtocol.Awareness>();
const connections = new Map<WebSocket, { docName: string; clientId: number }>();

const msgSync = 0;
const msgAwareness = 1;

function getDoc(docName: string) {
  if (!docs.has(docName)) {
    const doc = new Y.Doc();
    docs.set(docName, doc);
    awarenessMap.set(docName, new awarenessProtocol.Awareness(doc));
  }
  return docs.get(docName)!;
}

function handleMessage(ws: WebSocket, message: Uint8Array) {
  const info = connections.get(ws)!;
  const doc = getDoc(info.docName);
  const awareness = awarenessMap.get(info.docName)!;
  const decoder = decoding.createDecoder(message);
  const messageType = decoding.readVarUint(decoder);

  if (messageType === msgSync) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, msgSync);
    syncProtocol.readSyncMessage(decoder, encoder, doc, ws);

    if (encoding.length(encoder) > 1) {
      ws.send(encoding.toUint8Array(encoder));
    }
  } else if (messageType === msgAwareness) {
    awarenessProtocol.applyAwarenessUpdate(
      awareness,
      decoding.readVarUint8Array(decoder),
      ws,
    );
  }
}

const wss = new WebSocketServer({ port: 3000 });

wss.on('connection', (ws) => {
  const docName = 'default';
  const clientId = Math.floor(Math.random() * 1000000);

  connections.set(ws, { docName, clientId });
  const awareness = awarenessMap.get(docName)!;

  // Send sync step 1
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, msgSync);
  syncProtocol.writeSyncStep1(encoder, getDoc(docName));
  ws.send(encoding.toUint8Array(encoder));

  // Send awareness
  const awarenessEncoder = encoding.createEncoder();
  encoding.writeVarUint(awarenessEncoder, msgAwareness);
  encoding.writeVarUint8Array(
    awarenessEncoder,
    awarenessProtocol.encodeAwarenessUpdate(awareness, [clientId]),
  );
  ws.send(encoding.toUint8Array(awarenessEncoder));

  ws.on('message', (data) => handleMessage(ws, new Uint8Array(data)));
  ws.on('close', () => {
    awarenessProtocol.removeAwarenessStates(awareness, [clientId], null);
    connections.delete(ws);
  });
});
```

### 6.2. Client Usage

```typescript
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const doc = new Y.Doc();
const yText = doc.getText('content');
const awareness = new awarenessProtocol.Awareness(doc);
const socket = new WebSocket('ws://localhost:3000');

const msgSync = 0;
const msgAwareness = 1;

// Send sync step 1
function sendSyncStep1() {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, msgSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  socket.send(encoding.toUint8Array(encoder));
}

// Send awareness
function sendAwareness() {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, msgAwareness);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(awareness, []),
  );
  socket.send(encoding.toUint8Array(encoder));
}

// Handle messages
socket.onmessage = (event) => {
  const data = new Uint8Array(event.data);
  const decoder = decoding.createDecoder(data);
  const messageType = decoding.readVarUint(decoder);

  if (messageType === msgSync) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, msgSync);
    syncProtocol.readSyncMessage(decoder, encoder, doc, socket);
    if (encoding.length(encoder) > 1) {
      socket.send(encoding.toUint8Array(encoder));
    }
  } else if (messageType === msgAwareness) {
    awarenessProtocol.applyAwarenessUpdate(
      awareness,
      decoding.readVarUint8Array(decoder),
      socket,
    );
  }
};

// Set awareness state
awareness.setLocalState({ name: 'John', color: '#ff0000' });

// Observe changes
yText.observe(() => {
  console.log('Text changed:', yText.toString());
});
```

---

## 7. Performance Considerations

### 7.1. Efficient Updates

```typescript
// Bad: Nhiều small updates
yText.insert(0, 'H');
yText.insert(1, 'e');
yText.insert(2, 'l');

// Good: Batch updates
doc.transact(() => {
  yText.insert(0, 'H');
  yText.insert(1, 'e');
  yText.insert(2, 'l');
});
```

### 7.2. Awareness Optimization

```typescript
// Bad: Update awareness on every keystroke
yText.observe(() => {
  awareness.setLocalStateField('cursor', newPosition);
});

// Good: Debounce awareness updates
let timeout;
yText.observe(() => {
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    awareness.setLocalStateField('cursor', newPosition);
  }, 50);
});
```

### 7.3. Selective Awareness

```typescript
// Chỉ encode awareness cho một số clients
const encoder = encoding.createEncoder();
encoding.writeVarUint8Array(
  encoder,
  awarenessProtocol.encodeAwarenessUpdate(
    awareness,
    [clientId1, clientId2],  // Chỉ gửi cho 2 clients này
  ),
);
```

---

## 8. Trong TranscriptHub Collab Gateway

### 8.1. Implementation Summary

```
┌─────────────────────────────────────────────────────────────────┐
│              COLLAB GATEWAY - y-protocols USAGE                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Room Service tạo Y.Doc + Awareness per meeting              │
│                                                                  │
│  2. WebSocket Gateway xử lý messages:                          │
│     • msgSync (0): syncProtocol.readSyncMessage()               │
│     • msgAwareness (1): applyAwarenessUpdate()                   │
│                                                                  │
│  3. Binary encoding/decoding với lib0                          │
│     • encoding.writeVarUint() / readVarUint()                   │
│     • encoding.toUint8Array()                                   │
│                                                                  │
│  4. Broadcast updates tới all clients in room                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2. Key Code Snippets

```typescript
// Gateway message handler
@SubscribeMessage('sync')
handleSync(@ConnectedSocket() client: Socket, @MessageBody() data: number[]) {
  const { doc, awareness } = this.roomService.getOrCreateDoc(meetingId);
  const uint8Data = new Uint8Array(data);
  const decoder = decoding.createDecoder(uint8Data);
  const messageType = decoding.readVarUint(decoder);

  if (messageType === msgSync) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, msgSync);
    syncProtocol.readSyncMessage(decoder, encoder, doc, client);

    if (encoding.length(encoder) > 1) {
      client.send(encoding.toUint8Array(encoder));
    }
  }
}
```

---

## 9. References

- [y-protocols GitHub](https://github.com/yjs/y-protocols)
- [lib0 GitHub](https://github.com/dmonad/lib0)
- [Yjs Documentation](https://docs.yjs.dev/)
- [Sync Protocol Specification](https://github.com/yjs/y-protocols/blob/master/sync/README.md)
- [Awareness Protocol Specification](https://github.com/yjs/y-protocols/blob/master/awareness/README.md)
