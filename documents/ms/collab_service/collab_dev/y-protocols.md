# y-protocols — Tài liệu kỹ thuật chuyên sâu

> **Phiên bản:** 1.0  
> **Cập nhật:** 2026-06-19  
> **Thư viện:** `y-protocols@1.0.7`, `lib0@0.2.117`, `yjs@13.6.31`  
> **Liên quan:** `services_ms/apps/collab-gateway/src/index.js`

---

## Mục lục

1. [y-protocols là gì?](#1-y-protocols-là-gì)
2. [lib0 — Binary Encoding Layer](#2-lib0--binary-encoding-layer)
3. [Message Types — Phân loại tin nhắn](#3-message-types--phân-loại-tin-nhắn)
4. [Sync Protocol chi tiết](#4-sync-protocol-chi-tiết)
5. [Awareness Protocol chi tiết](#5-awareness-protocol-chi-tiết)
6. [Wire Format — Bytes thực tế trên đường truyền](#6-wire-format--bytes-thực-tế-trên-đường-truyền)
7. [Triển khai trong Collab Gateway](#7-triển-khai-trong-collab-gateway)
8. [State Vector — Cơ chế đồng bộ thông minh](#8-state-vector--cơ-chế-đồng-bộ-thông-minh)
9. [Awareness State Machine](#9-awareness-state-machine)
10. [Garbage Collection & Doc.gc](#10-garbage-collection--docgc)
11. [So sánh với các giải pháp khác](#11-so-sánh-với-các-giải-pháp-khác)
12. [Debugging — Đọc hiểu binary frames](#12-debugging--đọc-hiểu-binary-frames)

---

## 1. y-protocols là gì?

`y-protocols` là thư viện định nghĩa **giao thức truyền thông** giữa các Y.js clients. Nó **không** quản lý transport (WebSocket, WebRTC, ...) — việc đó thuộc về `y-websocket`, `y-webrtc`, v.v.

### Vai trò trong hệ sinh thái

```
┌──────────────────────────────────────────────────────┐
│                   Application Layer                   │
│         (TranscriptHub Collab Gateway)                │
└───────────────────┬──────────────────────────────────┘
                    │ dùng
┌───────────────────▼──────────────────────────────────┐
│                  y-protocols                          │
│   ┌──────────────────┐  ┌────────────────────────┐  │
│   │  sync.js         │  │  awareness.js           │  │
│   │  - writeSyncStep1│  │  - encodeAwarenessUpdate│  │
│   │  - writeSyncStep2│  │  - decodeAwarenessUpdate│  │
│   │  - writeUpdate   │  │  - applyAwarenessUpdate │  │
│   │  - readSyncMessage│  │  - removeAwarenessStates│ │
│   └──────────────────┘  └────────────────────────┘  │
└───────────────────┬──────────────────────────────────┘
                    │ dùng
┌───────────────────▼──────────────────────────────────┐
│                    lib0                               │
│   ┌──────────────────┐  ┌────────────────────────┐  │
│   │  encoding.js     │  │  decoding.js            │  │
│   │  - createEncoder │  │  - createDecoder        │  │
│   │  - writeVarUint  │  │  - readVarUint           │  │
│   │  - writeVarUint8 │  │  - readVarUint8Array     │  │
│   │    Array         │  │  - readVarString         │  │
│   └──────────────────┘  └────────────────────────┘  │
└───────────────────┬──────────────────────────────────┘
                    │ encode/decode
┌───────────────────▼──────────────────────────────────┐
│              Uint8Array (raw bytes)                   │
│         (gửi qua WebSocket binary frame)              │
└──────────────────────────────────────────────────────┘
```

### Hai giao thức chính

| Giao thức | Module | Mục đích |
|-----------|--------|---------|
| **Sync** | `y-protocols/sync` | Đồng bộ Y.Doc state giữa peers |
| **Awareness** | `y-protocols/awareness` | Chia sẻ trạng thái ephemeral (cursor, presence) |

---

## 2. lib0 — Binary Encoding Layer

`lib0` cung cấp các primitive để encode/decode dữ liệu thành binary. Hiểu `lib0` là nền tảng để đọc được bất kỳ message y-protocols nào.

### 2.1 Variable-length Integer (VarUint)

Thay vì dùng số nguyên cố định 4 byte, `lib0` dùng **variable-length encoding** — số nhỏ dùng ít byte hơn.

```
Số 0–127:   1 byte   (bit cao nhất = 0 → không còn byte nào)
Số 128–16383: 2 byte (bit cao nhất = 1 → còn 1 byte nữa)
Số > 16383: 3+ byte

VD: Số 300 (= 0b100101100):
  Binary: 10 0101100
  Chunk 1 (7 bit thấp): 0101100 = 44 → có byte tiếp → 1_0101100 = 0xAC
  Chunk 2 (phần còn lại): 10 = 2 → không còn byte → 0_0000010 = 0x02
  Kết quả: [0xAC, 0x02]
```

Triển khai trong JavaScript:
```javascript
// Đọc 1 VarUint từ decoder
function readVarUint(decoder) {
  let num = 0;
  let mult = 1;
  while (true) {
    const r = decoder.arr[decoder.pos++];
    num += (r & 0b01111111) * mult; // 7 bit thấp là data
    mult *= 128;
    if (r < 0b10000000) break; // bit cao = 0 → đây là byte cuối
  }
  return num;
}
```

### 2.2 VarUint8Array

Dùng để encode một mảng byte với độ dài biến:

```
[length: VarUint][...bytes]

VD: Uint8Array [0x01, 0x02, 0x03]
  → length = 3 → VarUint(3) = 0x03
  → kết quả: [0x03, 0x01, 0x02, 0x03]
```

### 2.3 VarString

```
[byteLength: VarUint][...UTF-8 bytes]

VD: "HOST"
  → UTF-8 bytes: [0x48, 0x4F, 0x53, 0x54]  (4 bytes)
  → length = 4 → VarUint(4) = 0x04
  → kết quả: [0x04, 0x48, 0x4F, 0x53, 0x54]
```

### 2.4 Encoder/Decoder API

```javascript
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

// === Tạo message ===
const encoder = encoding.createEncoder();
encoding.writeVarUint(encoder, 42);           // ghi số 42
encoding.writeVarUint8Array(encoder, myBytes);// ghi byte array
encoding.writeVarString(encoder, "hello");    // ghi string
const bytes = encoding.toUint8Array(encoder); // xuất thành Uint8Array

// === Đọc message ===
const decoder = decoding.createDecoder(bytes);
const num = decoding.readVarUint(decoder);    // đọc số
const arr = decoding.readVarUint8Array(decoder); // đọc byte array
const str = decoding.readVarString(decoder);  // đọc string

// Kiểm tra encoder có data không (ngoài byte đầu tiên):
encoding.length(encoder) > 1  // true nếu có payload
```

---

## 3. Message Types — Phân loại tin nhắn

y-websocket định nghĩa các loại message ở byte **đầu tiên** của mỗi frame:

```javascript
// Constants trong y-websocket (phải tuân thủ chính xác)
const messageSync             = 0;  // Sync protocol (step1, step2, update)
const messageAwareness        = 1;  // Awareness state updates
const messageAuth             = 2;  // Authentication (ít dùng)
const messageQueryAwareness   = 3;  // Query toàn bộ awareness states

// ⚠️ CRITICAL BUG POTENTIAL:
// Nếu dùng 1 cho sync, 2 cho awareness thay vì 0/1:
//   - Client gửi type=0 (sync) → Server đọc case 0 → nhưng nội dung encode khác → crash
//   - Client gửi type=1 (awareness) → Server đọc case 1 là "doc update" → 
//     gọi Y.applyUpdate với awareness bytes → "contentRefs is not a function"
```

### Cấu trúc tổng quát mỗi frame

```
┌─────────────┬─────────────────────────────────────────┐
│ messageType │              payload                     │
│  (VarUint)  │           (tùy theo type)               │
└─────────────┴─────────────────────────────────────────┘
  1-3 bytes              n bytes
```

---

## 4. Sync Protocol chi tiết

### 4.1 Tổng quan 3-way handshake

Khi 2 peers kết nối, chúng cần đồng bộ trạng thái Y.Doc. Quá trình dùng **2-step sync**:

```
Client (mới connect)              Server (có sẵn doc)
      │                                 │
      │                                 │ sendSyncStep1(conn, doc):
      │◄── [type=0][step1][stateVector] ─│ "Tôi có những state này, bạn còn thiếu gì?"
      │                                 │
      │ readSyncMessage() sinh ra step2:│
      │── [type=0][step2][missingUpdates]►│ "Đây là những thứ bạn chưa có"
      │                                 │ Y.applyUpdate(missingUpdates)
      │                                 │
      │ Sau này khi có update mới:      │
      │── [type=0][update][deltaUpdate] ─►│ "Tôi vừa thay đổi"
      │◄── broadcast to others ─────────│
```

### 4.2 Sub-types trong messageSync

Khi `messageType = 0`, byte tiếp theo là **sync sub-type**:

```
[0x00][syncSubType][payload]

syncSubType:
  0 = syncStep1  → payload là State Vector
  1 = syncStep2  → payload là Doc Update (missing updates)
  2 = syncUpdate → payload là Doc Update (incremental update)
```

Xem trong code y-protocols:
```javascript
// y-protocols/src/sync.js (giản lược)

export const messageYjsSyncStep1 = 0;
export const messageYjsSyncStep2 = 1;
export const messageYjsUpdate    = 2;

export const writeSyncStep1 = (encoder, doc) => {
  encoding.writeVarUint(encoder, messageYjsSyncStep1);          // 0x00
  encoding.writeVarUint8Array(encoder, Y.encodeStateVector(doc)); // state vector
};

export const writeSyncStep2 = (encoder, doc, encodedStateVector) => {
  encoding.writeVarUint(encoder, messageYjsSyncStep2);           // 0x01
  encoding.writeVarUint8Array(
    encoder,
    Y.encodeStateAsUpdate(doc, encodedStateVector) // diff: what client doesn't have
  );
};

export const writeUpdate = (encoder, update) => {
  encoding.writeVarUint(encoder, messageYjsUpdate);  // 0x02
  encoding.writeVarUint8Array(encoder, update);
};
```

### 4.3 `readSyncMessage` — Hàm xử lý tất cả sync sub-types

```javascript
export const readSyncMessage = (decoder, encoder, doc, transactionOrigin) => {
  const messageType = decoding.readVarUint(decoder); // đọc sub-type (0, 1, hoặc 2)

  switch (messageType) {
    case messageYjsSyncStep1: {
      // Nhận state vector của peer → tính ra những gì peer còn thiếu → gửi syncStep2
      const encodedStateVector = decoding.readVarUint8Array(decoder);
      writeSyncStep2(encoder, doc, encodedStateVector);
      break;
    }
    case messageYjsSyncStep2:
    case messageYjsUpdate: {
      // Nhận doc update → apply vào local doc
      const update = decoding.readVarUint8Array(decoder);
      Y.applyUpdate(doc, update, transactionOrigin);
      break;
    }
    default:
      throw new Error(`Unknown message type: ${messageType}`);
  }

  return messageType; // Trả về sub-type để caller biết loại message
};
```

### 4.4 Dùng trong Collab Gateway

```javascript
// Trong handleMessage() — case 0 (messageSync):
case messageSync: {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync); // Phản hồi cũng là messageSync

  // readSyncMessage xử lý 1 trong 3 cases:
  // - Nếu là step1: ghi step2 vào encoder (auto)
  // - Nếu là step2/update: apply vào doc, encoder giữ nguyên (không phản hồi)
  syncProtocol.readSyncMessage(decoder, encoder, docEntry.doc, null);

  // Chỉ gửi phản hồi nếu encoder có data (tức là message vừa xử lý là step1)
  // encoding.length(encoder) > 1 vì byte đầu tiên là messageSync type đã được write sẵn
  if (encoding.length(encoder) > 1) {
    conn.send(encoding.toUint8Array(encoder));
  }
  break;
}
```

### 4.5 Broadcast doc update khi Y.Doc thay đổi

```javascript
// Server subscribe vào doc.on('update'):
docEntry.doc.on('update', (update, origin) => {
  if (origin !== conn) { // Không broadcast lại cho người gửi
    broadcastUpdate(docEntry, update, origin);
  }
});

function broadcastUpdate(docEntry, update, excludeConn = null) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);      // type = 0
  syncProtocol.writeUpdate(encoder, update);         // sub-type = 2, rồi payload
  //                                    └─ [0x02][length][update bytes]
  const msg = encoding.toUint8Array(encoder);

  docEntry.connections.forEach((c) => {
    if (c !== excludeConn && c.readyState === 1 /* OPEN */) {
      c.send(msg);
    }
  });
}
```

---

## 5. Awareness Protocol chi tiết

### 5.1 Awareness là gì?

Awareness là cơ chế chia sẻ trạng thái **ephemeral** (không lưu vào Y.Doc, mất khi disconnect):

- Vị trí con trỏ (cursor position)
- Tên và màu user đang online  
- Trạng thái "đang gõ" (typing indicator)
- Bất kỳ metadata tạm thời nào

**Khác biệt so với Y.Doc:**

| | Y.Doc (CRDT) | Awareness |
|-|--------------|-----------|
| Lưu trữ | Persistent, trong doc | Ephemeral, in-memory |
| Khi disconnect | Giữ nguyên | Xóa ngay |
| Conflict resolution | CRDT tự merge | Last-write-wins |
| Dữ liệu | Text, Array, Map | Arbitrary JSON |

### 5.2 Awareness State per Client

Mỗi Y.js client (mỗi tab/connection) có 1 **clientID** tự sinh (số nguyên lớn):

```
Awareness States Map:
  clientID_1 (Tab 1 Admin) → { clock: 5, state: { user: { name: "Admin", color: "#E53E3E" } } }
  clientID_2 (Tab 2 us1)   → { clock: 3, state: { user: { name: "us1", color: "#3182CE" } } }
  clientID_3 (Tab 1 Admin) → null  ← user đã disconnect (state = null)
```

**clock** là counter tăng dần mỗi lần state thay đổi, dùng để detect stale updates.

### 5.3 Wire Format của Awareness Update

```
[messageAwareness=1][updatePayload: VarUint8Array]

Bên trong updatePayload:
  [numClients: VarUint]
  [clientID_1: VarUint][clock_1: VarUint][stateJSON_1: VarString]
  [clientID_2: VarUint][clock_2: VarUint][stateJSON_2: VarString]
  ...
```

Ví dụ cụ thể:
```
Payload: 1 client đang online
  numClients = 1
  clientID   = 1234567890  (Y.js auto-generated)
  clock      = 5           (lần thứ 5 update state)
  stateJSON  = '{"user":{"id":"1","name":"Admin","color":"#E53E3E"}}'
```

### 5.4 API của `awarenessProtocol`

```javascript
import * as awarenessProtocol from 'y-protocols/awareness';

// === Tạo Awareness instance ===
const awareness = new awarenessProtocol.Awareness(doc);

// === Set trạng thái local ===
// Client (FE) gọi:
provider.awareness.setLocalState({
  user: { name: "Admin", color: "#E53E3E" }
});
// Tự động encode và gửi đến server qua WebSocket

// === Đọc toàn bộ states ===
const states = awareness.getStates();
// → Map<clientID, { user: {...} }>
states.forEach((state, clientID) => {
  console.log(clientID, state.user?.name);
});

// === Apply update từ remote peer ===
awarenessProtocol.applyAwarenessUpdate(awareness, updateBytes, origin);
// Cập nhật Map internal, fire 'change' event nếu có thay đổi

// === Encode toàn bộ states thành bytes ===
const bytes = awarenessProtocol.encodeAwarenessUpdate(
  awareness,
  Array.from(awareness.getStates().keys()) // clientIDs cần encode
);

// === Xóa states khi disconnect ===
awarenessProtocol.removeAwarenessStates(awareness, [clientID1, clientID2], origin);
// Set state = null, tăng clock, broadcast cho peers
```

### 5.5 Awareness 'change' Event

```javascript
awareness.on('change', ({ added, updated, removed }) => {
  // added:   clientIDs vừa online
  // updated: clientIDs vừa cập nhật state
  // removed: clientIDs vừa offline (state = null)

  const changedClients = [...added, ...updated, ...removed];

  // Broadcast đến tất cả connections (trừ người gửi)
  broadcastAwarenessUpdate(docEntry, changedClients, originConn);
});
```

### 5.6 Vấn đề quan trọng: Track clientIDs per connection

```javascript
// Y.js clientID ≠ User ID (database ID)
// Mỗi WebSocket connection có 1 clientID riêng tự sinh:
//   doc.clientID = 1234567890 (random int, sinh khi tạo Y.Doc)

// Khi connection disconnect, phải xóa đúng clientID đó:
awarenessProtocol.removeAwarenessStates(
  awareness,
  [clientID_of_this_connection],  // ← PHẢI là Y.js clientID
  conn
);

// Vấn đề: Server không biết clientID của connection là bao nhiêu
// Vì clientID được sinh ở phía client (FE), không phải server

// Giải pháp: Parse clientIDs từ awareness update message khi nhận được
function trackAwarenessClientIDs(conn, update) {
  // update là raw bytes của awareness update
  const decoder = decoding.createDecoder(update);
  const numClients = decoding.readVarUint(decoder); // số lượng clients trong message
  
  for (let i = 0; i < numClients; i++) {
    const clientID = decoding.readVarUint(decoder);  // clientID của client này
    conn.awarenessClientIDs.add(clientID);            // track lại
    decoding.readVarUint(decoder);                    // skip clock
    decoding.readVarString(decoder);                  // skip stateJSON
  }
}

// Khi nhận awareness update:
case messageAwareness: {
  const update = decoding.readVarUint8Array(decoder);
  trackAwarenessClientIDs(conn, update); // Lưu clientIDs vào conn
  awarenessProtocol.applyAwarenessUpdate(awareness, update, conn);
  break;
}

// Khi disconnect:
conn.on('close', () => {
  awarenessProtocol.removeAwarenessStates(
    awareness,
    [...conn.awarenessClientIDs], // Dùng tracked clientIDs
    conn
  );
});
```

---

## 6. Wire Format — Bytes thực tế trên đường truyền

Đây là phần giúp bạn đọc được WebSocket binary frames trong DevTools.

### 6.1 Sync Step 1 (Client → Server)

```
Frame: [0x00][0x00][stateVector bytes...]
         │     │
         │     └─ Sub-type: syncStep1 (0)
         └─ messageSync (0)

VD cụ thể (Y.Doc mới, rỗng):
  [0x00]  messageSync
  [0x00]  syncStep1
  [0x01]  VarUint8Array length = 1 (stateVector của doc rỗng)
  [0x00]  stateVector = [0x00]
```

### 6.2 Sync Step 2 (Server → Client)

```
Frame: [0x00][0x01][length: VarUint][update bytes...]
         │     │
         │     └─ Sub-type: syncStep2 (1)
         └─ messageSync (0)

VD: Server không có data mới (doc đồng bộ):
  [0x00]  messageSync
  [0x01]  syncStep2
  [0x01]  length = 1 (update rỗng)
  [0x00]  empty update
```

### 6.3 Doc Update (Client → Server → broadcast)

```
Frame: [0x00][0x02][length: VarUint][Y.Doc update bytes...]
         │     │
         │     └─ Sub-type: syncUpdate (2)
         └─ messageSync (0)

VD: User gõ chữ "A" vào Y.Text:
  [0x00]  messageSync
  [0x02]  syncUpdate
  [0x?? ...]  Y.Doc binary update (định dạng CRDT internal của Y.js)
```

### 6.4 Awareness Update (Client → Server → broadcast)

```
Frame: [0x01][length: VarUint][awarenessUpdate bytes...]
         │
         └─ messageAwareness (1)

Bên trong awarenessUpdate:
  [0x01]  numClients = 1
  [0x?? ...]  clientID (VarUint, thường là số lớn)
  [0x05]  clock = 5
  [0x?? ...]  stateJSON length (VarUint)
  [0x7B 0x22 ...]  stateJSON bytes (UTF-8 JSON)

VD cụ thể (clientID=1, clock=1, user=Admin):
  [0x01]      numClients = 1
  [0x01]      clientID = 1 (giản lược, thực tế lớn hơn)
  [0x01]      clock = 1
  [0x2F]      stateJSON length = 47
  [0x7B...]   {"user":{"id":"1","name":"Admin","color":"#E53E3E"}}
```

### 6.5 Awareness Disconnect (state = null)

```
Khi user disconnect, server gọi:
removeAwarenessStates(awareness, [clientID], conn)

Tự động gửi awareness update với stateJSON = "null":
  [0x01]      numClients = 1
  [0x?? ...]  clientID
  [incremented clock]
  [0x04]      stateJSON length = 4
  [0x6E 0x75 0x6C 0x6C]  "null"
```

---

## 7. Triển khai trong Collab Gateway

Đây là toàn bộ luồng xử lý trong `index.js` với giải thích chi tiết:

### 7.1 Gửi Sync Step 1 cho client mới

```javascript
function sendSyncStep1(conn, doc) {
  const encoder = encoding.createEncoder();
  
  // Frame header
  encoding.writeVarUint(encoder, messageSync); // type = 0
  
  // Nội dung: sync step 1 = state vector của server doc
  syncProtocol.writeSyncStep1(encoder, doc);
  // ↑ Bên trong writeSyncStep1:
  //   encoding.writeVarUint(encoder, 0); // syncStep1 sub-type
  //   encoding.writeVarUint8Array(encoder, Y.encodeStateVector(doc));

  conn.send(encoding.toUint8Array(encoder));
  // Client nhận được → readSyncMessage() → gửi lại syncStep2 (missing updates)
}
```

### 7.2 Xử lý message inbound từ client

```javascript
function handleMessage(conn, docEntry, message) {
  // message là Uint8Array nhận từ WebSocket
  const decoder = decoding.createDecoder(message);
  
  // Đọc byte đầu tiên = messageType
  const messageType = decoding.readVarUint(decoder);

  switch (messageType) {
    case messageSync: { // 0
      // Tạo encoder để phản hồi (nếu là syncStep1 → cần gửi syncStep2)
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync); // phản hồi cũng là type 0
      
      // readSyncMessage xử lý theo sub-type:
      // - syncStep1 (0): ghi syncStep2 vào encoder, apply state vector
      // - syncStep2 (1): apply missing updates vào doc
      // - syncUpdate (2): apply incremental update vào doc
      syncProtocol.readSyncMessage(decoder, encoder, docEntry.doc, null);
      
      // Chỉ gửi phản hồi nếu có nội dung (chỉ syncStep1 mới sinh ra response)
      if (encoding.length(encoder) > 1) {
        conn.send(encoding.toUint8Array(encoder));
      }
      break;
    }

    case messageAwareness: { // 1
      const update = decoding.readVarUint8Array(decoder);
      
      // Track clientIDs trước khi apply (cho cleanup khi disconnect)
      try {
        const tmpDec = decoding.createDecoder(update);
        const n = decoding.readVarUint(tmpDec);
        for (let j = 0; j < n; j++) {
          conn.awarenessClientIDs.add(decoding.readVarUint(tmpDec));
          decoding.readVarUint(tmpDec);   // skip clock
          decoding.readVarString(tmpDec); // skip stateJSON
        }
      } catch (_) { /* ignore parse errors — awareness is best-effort */ }
      
      // Apply update → trigger 'change' event → broadcast đến peers
      awarenessProtocol.applyAwarenessUpdate(docEntry.awareness, update, conn);
      break;
    }
    
    default:
      logger.warn(`[WS] Unknown message type: ${messageType}`);
  }
}
```

### 7.3 Broadcast doc update

```javascript
function broadcastUpdate(docEntry, update, excludeConn = null) {
  // Encode theo y-websocket format
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync); // type = 0
  syncProtocol.writeUpdate(encoder, update);   // sub-type = 2, rồi update bytes

  const msg = encoding.toUint8Array(encoder);
  
  docEntry.connections.forEach((c) => {
    if (c !== excludeConn && c.readyState === 1 /* WebSocket.OPEN */) {
      c.send(msg);
    }
  });
}
```

### 7.4 Broadcast awareness update

```javascript
// Được gọi từ awareness 'change' event handler
function broadcastAwarenessUpdate(docEntry, changedClientIDs, excludeConn = null) {
  if (!changedClientIDs.length) return;
  
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness); // type = 1
  
  // Encode chỉ những clientIDs vừa thay đổi (không encode toàn bộ)
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(docEntry.awareness, changedClientIDs)
  );
  
  const msg = encoding.toUint8Array(encoder);
  
  docEntry.connections.forEach((c) => {
    if (c !== excludeConn && c.readyState === 1) {
      c.send(msg);
    }
  });
}
```

### 7.5 Gửi current awareness cho client mới

```javascript
// Client mới kết nối cần biết các user đang online
const awarenessStates = docEntry.awareness.getStates();
if (awarenessStates.size > 0) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness); // type = 1
  
  // Encode toàn bộ awareness hiện tại
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(
      docEntry.awareness,
      Array.from(awarenessStates.keys()) // tất cả clientIDs
    )
  );
  
  newConn.send(encoding.toUint8Array(encoder));
}
```

---

## 8. State Vector — Cơ chế đồng bộ thông minh

### 8.1 State Vector là gì?

State Vector là "bản tóm tắt" của Y.Doc — liệt kê mỗi client đã contribute bao nhiêu updates:

```javascript
Y.encodeStateVector(doc)
// Returns Uint8Array encoding:
// {
//   clientID_1: 150,  // client này đã gửi 150 operations
//   clientID_2: 87,   // client kia đã gửi 87 operations
//   ...
// }
```

### 8.2 Cách sync hoạt động với State Vector

```
Server doc state: { client_A: 100, client_B: 50 }
Client mới state: { client_A: 80 }   ← client_A thiếu 20 ops, chưa có client_B

Step 1: Client gửi state vector { client_A: 80 }

Step 2: Server tính diff:
  client_A: server có 100, client có 80 → gửi 20 ops của client_A
  client_B: server có 50, client có 0  → gửi 50 ops của client_B
  Kết quả: Y.encodeStateAsUpdate(doc, clientStateVector)

Client nhận step2 → Y.applyUpdate() → doc giờ đầy đủ
```

### 8.3 Ưu điểm của State Vector

- **Bandwidth tối ưu:** Chỉ gửi những gì còn thiếu, không gửi toàn bộ doc
- **Idempotent:** Apply cùng update nhiều lần → kết quả không đổi (Y.js tự dedup)
- **Không cần server lưu history:** Mỗi client có state vector của mình

---

## 9. Awareness State Machine

### 9.1 Vòng đời của 1 Awareness State

```
                ┌─────────────────┐
                │   Client online │
                │  setLocalState  │
                │   (clock = 1)   │
                └────────┬────────┘
                         │ gửi awareness update
                         ▼
               ┌──────────────────┐
               │   State active   │
               │  clock tăng dần  │◄──── setLocalState() lại
               │  30s heartbeat   │      (khi cursor di chuyển...)
               └────────┬─────────┘
                        │
            ┌───────────┴───────────┐
            │                       │
            ▼                       ▼
   ┌─────────────────┐   ┌──────────────────────┐
   │ Explicit        │   │ Timeout              │
   │ disconnect      │   │ (30s không heartbeat)│
   │ setLocalState   │   │                      │
   │ (null)          │   │                      │
   └────────┬────────┘   └──────────┬───────────┘
            │                        │
            └───────────┬────────────┘
                        │
                        ▼
             ┌─────────────────────┐
             │  State = null       │
             │  clock++            │
             │  Broadcast xóa      │
             └─────────────────────┘
```

### 9.2 30-second Heartbeat (y-websocket client)

y-websocket client tự động gửi awareness update định kỳ để xác nhận vẫn online:

```javascript
// Trong y-websocket client (tự động):
const resyncInterval = setInterval(() => {
  // Gửi lại local state để server không timeout
  if (provider.wsconnected) {
    provider.awareness.setLocalState(provider.awareness.getLocalState());
  }
}, 30000); // mỗi 30 giây
```

### 9.3 Server-side cleanup khi connection đóng

```javascript
conn.on('close', () => {
  // 1. Xóa connection khỏi pool
  docEntry.connections.delete(conn);
  
  // 2. Xóa awareness states của connection này
  if (conn.awarenessClientIDs.size > 0) {
    awarenessProtocol.removeAwarenessStates(
      docEntry.awareness,
      [...conn.awarenessClientIDs],
      conn
    );
    // removeAwarenessStates làm gì:
    //   → Set state = null cho các clientIDs đó
    //   → Tăng clock
    //   → Emit 'change' { removed: [clientIDs] }
    //   → broadcastAwarenessUpdate gửi đến peers → họ xóa user khỏi UI
  }
  
  // 3. Cleanup event handlers để tránh memory leak
  docEntry.awareness.off('change', awarenessHandler);
  docEntry.doc.off('update', updateHandler);
});
```

---

## 10. Garbage Collection & Doc.gc

### 10.1 Y.Doc GC hoạt động thế nào?

CRDT giữ lại **lịch sử** của mọi thay đổi (để có thể merge với peers offline). Điều này tốn memory. GC (Garbage Collection) xóa các deletions đã được tất cả peers acknowledge.

```javascript
const doc = new Y.Doc();
doc.gc = true; // Bật GC (mặc định là true)
               // false: giữ toàn bộ lịch sử (dùng khi cần undo history dài)
```

### 10.2 Khi nào không dùng GC?

```javascript
// Nếu muốn hỗ trợ undo/redo lịch sử dài:
doc.gc = false;

// Nếu có clients offline lâu (>session time):
// Với gc=true: khi client reconnect, server có thể thiếu dữ liệu để sync
// Với gc=false: giữ đủ history để sync dù client offline lâu
```

### 10.3 Memory management trong Gateway

```javascript
// In-memory docs tồn tại mãi mãi trong session → memory leak nếu không clean up
// Hiện tại: doc tồn tại cho đến khi process restart hoặc tab cuối cùng disconnect

// Cleanup khi tab cuối cùng disconnect:
conn.on('close', () => {
  docEntry.connections.delete(conn);
  
  if (docEntry.connections.size === 0) {
    // Option: xóa doc khỏi memory sau N giây (dùng setTimeout)
    // Hiện tại giữ trong memory để client reconnect nhanh
    // Trong production nên thêm: docs.delete(meetingId) sau TTL
  }
});
```

---

## 11. So sánh với các giải pháp khác

### 11.1 Y.js vs Operational Transform (OT)

| | Y.js (CRDT) | OT (như Google Docs) |
|-|-------------|---------------------|
| **Server role** | Chỉ relay, không cần xử lý | Server must transform ops |
| **Offline support** | Native | Phức tạp, cần special handling |
| **Conflict resolution** | Tự động (deterministic) | Cần server arbitrate |
| **Complexity** | Protocol đơn giản | Algorithm phức tạp |
| **History** | Tích hợp sẵn | Cần implement riêng |
| **Ví dụ** | Y.js, Automerge | ShareDB, Firepad |

### 11.2 y-protocols vs Socket.IO custom events

```javascript
// Cách tiếp cận không dùng y-protocols (anti-pattern):
socket.on('text-change', (delta) => {
  // Broadcast delta đến tất cả clients
  // → Race condition khi 2 user edit cùng lúc
  // → Không có CRDT → conflict không được resolve
  socket.broadcast.emit('text-change', delta);
});

// y-protocols approach:
// → Y.Doc CRDT tự resolve conflicts
// → Server chỉ relay binary frames, không cần hiểu nội dung
// → Không có race condition
```

### 11.3 y-websocket vs Custom WebSocket Server

| | y-websocket (server package) | Custom (như TranscriptHub) |
|-|------------------------------|---------------------------|
| **Setup** | `require('y-websocket/bin/server')` | Tự viết full server |
| **Auth** | Không có | Custom middleware |
| **Role-based access** | Không có | Custom middleware |
| **Persistence** | File system hoặc MongoDB | Custom (Prisma → PostgreSQL) |
| **Flexibility** | Thấp | Cao |
| **Production suitability** | Dev/simple use | Enterprise |

---

## 12. Debugging — Đọc hiểu binary frames

### 12.1 Xem WebSocket frames trong DevTools

1. Chrome DevTools → Network tab
2. Filter: WS
3. Click vào connection `ws://localhost:3008/{meetingId}`
4. Tab "Messages" → chọn 1 frame → xem binary

### 12.2 Decode frame bằng Node.js

```javascript
// Tool để decode 1 message y-protocols
import * as decoding from 'lib0/decoding';
import * as Y from 'yjs';

function decodeYjsMessage(bytes) {
  const decoder = decoding.createDecoder(bytes);
  const type = decoding.readVarUint(decoder);
  
  if (type === 0) {
    console.log('messageSync');
    const subType = decoding.readVarUint(decoder);
    const names = ['syncStep1', 'syncStep2', 'syncUpdate'];
    console.log('  subType:', names[subType]);
    const payload = decoding.readVarUint8Array(decoder);
    console.log('  payload length:', payload.length, 'bytes');
    
    if (subType === 0) {
      // Decode state vector
      const sv = Y.decodeStateVector(payload);
      console.log('  stateVector:', sv);
    }
    
  } else if (type === 1) {
    console.log('messageAwareness');
    const update = decoding.readVarUint8Array(decoder);
    const innerDecoder = decoding.createDecoder(update);
    const numClients = decoding.readVarUint(innerDecoder);
    console.log('  numClients:', numClients);
    
    for (let i = 0; i < numClients; i++) {
      const clientID = decoding.readVarUint(innerDecoder);
      const clock = decoding.readVarUint(innerDecoder);
      const stateJSON = decoding.readVarString(innerDecoder);
      console.log(`  client ${clientID}: clock=${clock} state=${stateJSON}`);
    }
  }
}

// Sử dụng:
const rawBytes = new Uint8Array([0x01, 0x01, 0x01, 0xAA, ...]);
decodeYjsMessage(rawBytes);
```

### 12.3 Các lỗi thường gặp khi debug

```javascript
// Lỗi 1: "contentRefs[(info & binary.BITS5)] is not a function"
// Nguyên nhân: message type sai (dùng 1 cho sync thay vì 0)
// → Server nhận type=1 (tưởng là awareness) → gọi applyAwarenessUpdate với sync bytes
// → Awareness decoder gặp sync content → crash

// Lỗi 2: "Unexpected end of array"  
// Nguyên nhân: Decoder đọc quá số bytes thực có trong buffer
// → Thường do messageType/subType sai → đọc sai structure
// → Hoặc VarUint8Array length bị encode sai

// Lỗi 3: "Cannot read property 'get' of undefined"
// Nguyên nhân: Y.applyUpdate với bytes không phải là Y.Doc update
// → Thường do nhầm awareness bytes với doc update bytes

// Lỗi 4: Users không disconnect khỏi awareness sau khi đóng tab
// Nguyên nhân: removeAwarenessStates dùng sai clientIDs (userId thay vì Y.js clientID)
// Fix: track conn.awarenessClientIDs từ awareness update messages

// Lỗi 5: Y.Doc không sync giữa tabs
// Nguyên nhân: ySegmentsArray = new Y.Array() thay vì doc.getArray()
// Fix: luôn dùng doc.getArray("name") để array thuộc Y.Doc
```

### 12.4 Monitoring trong production

```javascript
// Thêm vào server để monitor health:
setInterval(() => {
  let totalConnections = 0;
  docs.forEach((entry, meetingId) => {
    totalConnections += entry.connections.size;
    if (entry.connections.size > 0) {
      console.log(`Room ${meetingId}: ${entry.connections.size} connections`);
      console.log(`  Doc GC: ${entry.doc.gc}`);
      console.log(`  Awareness states: ${entry.awareness.getStates().size}`);
    }
  });
  console.log(`Total connections: ${totalConnections}, Total rooms: ${docs.size}`);
}, 60000); // Log mỗi 1 phút
```

---

## Tài liệu tham khảo

| Tài liệu | Link |
|----------|------|
| Y.js Official | https://docs.yjs.dev |
| y-protocols source | https://github.com/yjs/y-protocols |
| y-websocket source | https://github.com/yjs/y-websocket |
| lib0 source | https://github.com/dmonad/lib0 |
| CRDT paper (Attiya et al.) | https://arxiv.org/abs/1608.01758 |

---

*Tài liệu này được viết dựa trên source code thực tế của `y-protocols@1.0.7` và quá trình debug production issues trong TranscriptHub.*
