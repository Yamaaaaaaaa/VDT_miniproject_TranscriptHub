# Yjs - CRDT cho Collaborative Editing

Tài liệu này giải thích **Yjs** - một CRDT (Conflict-free Replicated Data Type) library được sử dụng trong hệ thống collaborative editing của TranscriptHub.

---

## 1. Tổng Quan về CRDT

### 1.1. Vấn đề với Traditional Concurrency

```
┌─────────────────────────────────────────────────────────────────┐
│              TRADITIONAL APPROACH (With Locks)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User A                    User B                               │
│     │                         │                                  │
│     ▼                         ▼                                  │
│  ┌─────────┐              ┌─────────┐                           │
│  │ LOCK    │              │ LOCK    │                           │
│  │ Acquired│              │ Waiting │                           │
│  └─────────┘              └─────────┘                           │
│     │                         │                                  │
│     ▼                         │                                  │
│  Edit "Hello"                 │                                  │
│     │                         │                                  │
│     ▼                         ▼                                  │
│  ┌─────────┐              ┌─────────┐                           │
│  │ LOCK    │              │ LOCK    │                           │
│  │ Released│              │ Acquired│                           │
│  └─────────┘              └─────────┘                           │
│                               │                                  │
│                               ▼                                  │
│                           Edit "World"                           │
│                                                                  │
│  Problem: User B phải đợi User A xong mới được edit!         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2. CRDT Solution

```
┌─────────────────────────────────────────────────────────────────┐
│                    CRDT APPROACH                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User A                    User B                                │
│     │                         │                                  │
│     ▼                         ▼                                  │
│  ┌─────────┐              ┌─────────┐                           │
│  │ Edit    │              │ Edit    │                           │
│  │ "Hello" │              │ "World" │                           │
│  └────┬────┘              └────┬────┘                           │
│       │                         │                                 │
│       ▼                         ▼                                 │
│  ┌─────────────────────────────────────┐                        │
│  │         MERGE (Mathematical)         │                        │
│  │                                      │                        │
│  │  "Hello" + "World" = "Hello World"  │                        │
│  │                                      │                        │
│  │  Both users see the same result!     │                        │
│  └─────────────────────────────────────┘                        │
│                                                                  │
│  ✅ No locking needed                                           │
│  ✅ No conflicts                                                │
│  ✅ Real-time sync                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3. Định nghĩa CRDT

**CRDT (Conflict-free Replicated Data Type)** là một data structure đảm bảo:

1. **Eventual Consistency**: Tất cả replicas eventually converge về cùng một state
2. **Commutative**: Thứ tự áp dụng operations không quan trọng
3. **Idempotent**: Áp dụng cùng một operation nhiều lần cho kết quả giống nhau

---

## 2. Yjs là gì?

### 2.1. Giới thiệu

**Yjs** là một high-performance CRDT implementation được viết bằng JavaScript/TypeScript.

```typescript
import * as Y from 'yjs';

// Tạo một Y.Doc (document container)
const doc = new Y.Doc();

// Các data types
const yText = doc.getText('myText');        // Rich text
const yArray = doc.getArray('myArray');      // List/array
const yMap = doc.getMap('myMap');            // Key-value store
const yXmlFragment = doc.getXmlFragment();  // XML-like structure
```

### 2.2. Tại sao chọn Yjs?

| Feature | Description |
|---------|-------------|
| **Performance** | Được optimize cho real-time collaboration |
| **Size** | ~15KB gzipped, rất nhẹ |
| **Ecosystem** | Hỗ trợ nhiều editors (Quill, ProseMirror, Monaco, etc.) |
| **Bindings** | Có bindings cho React, Vue, Angular, v.v. |
| **Protocols** | Có sẵn y-websocket, y-webrtc, y-indexeddb |
| **TypeScript** | Có type definitions đầy đủ |

### 2.3. Yjs vs các CRDT khác

| Library | Pros | Cons |
|---------|------|------|
| **Yjs** | Fast, small, great ecosystem | Complex for beginners |
| **Automerge** | Easier API | Larger size, slower |
| ** Logoot/LSEQ** | Simple | Limited types |

---

## 3. Yjs Data Types

### 3.1. Y.Doc

`Y.Doc` là container chính, chứa tất cả data types.

```typescript
import * as Y from 'yjs';

// Tạo document
const doc = new Y.Doc();

// Đặt user client ID (quan trọng cho conflict resolution)
doc.clientID = 12345;

// Cách lấy data types
const yText = doc.getText('content');        // Tạo hoặc lấy Y.Text
const yArray = doc.getArray('items');        // Tạo hoặc lấy Y.Array
const yMap = doc.getMap('config');          // Tạo hoặc lấy Y.Map

// Observe changes
doc.on('update', (update: Uint8Array, origin: any) => {
  console.log('Document updated!');
});
```

### 3.2. Y.Text

`Y.Text` cho phép collaborative text editing với rich text support.

```typescript
const yText = doc.getText('myText');

// ===== INSERT =====
yText.insert(0, 'Hello');                    // Insert at position 0
yText.insert(5, ' World');                   // Insert at position 5
// Result: "Hello World"

// ===== DELETE =====
yText.delete(0, 5);                         // Delete 5 chars from position 0
// Result: " World"

// ===== GET =====
console.log(yText.toString());               // " World"
console.log(yText.length);                    // 6

// ===== ATTRIBUTES (Rich Text) =====
yText.insert(0, 'Bold', { bold: true });     // Insert with formatting
yText.insert(6, 'Normal');                   // Insert without formatting

// ===== DELTA FORMAT =====
const delta = yText.toDelta();               // Get as Quill Delta format
console.log(delta);
// [
//   { insert: 'Bold', attributes: { bold: true } },
//   { insert: 'Normal' }
// ]
```

### 3.3. Y.Array

`Y.Array` cho phép collaborative array/list editing.

```typescript
const yArray = doc.getArray<{ id: number; name: string }>('items');

// ===== INSERT =====
yArray.insert(0, [{ id: 1, name: 'Item 1' }]);  // Insert at index 0
yArray.insert(1, [{ id: 2, name: 'Item 2' }]);  // Insert at index 1
// Result: [Item 1, Item 2]

// ===== PUSH =====
yArray.push([{ id: 3, name: 'Item 3' }]);       // Append to end
// Result: [Item 1, Item 2, Item 3]

// ===== DELETE =====
yArray.delete(0, 1);                            // Delete 1 item at index 0
// Result: [Item 2, Item 3]

// ===== GET =====
console.log(yArray.get(0));                     // { id: 2, name: 'Item 2' }
console.log(yArray.length);                      // 2

// ===== OBSERVE =====
yArray.observe((event) => {
  console.log('Changes:', event.changes);
  // event.changes.delta = [{ retain: 1 }, { insert: [...] }, ...]
});
```

### 3.4. Y.Map

`Y.Map` cho phép collaborative key-value editing.

```typescript
const yMap = doc.getMap<string>('config');

// ===== SET =====
yMap.set('theme', 'dark');
yMap.set('language', 'vi');

// ===== GET =====
console.log(yMap.get('theme'));      // 'dark'
console.log(yMap.has('language'));   // true

// ===== DELETE =====
yMap.delete('language');

// ===== ENTRIES =====
yMap.forEach((value, key) => {
  console.log(`${key}: ${value}`);
});

// ===== OBSERVE =====
yMap.observe((event) => {
  event.keysChanged.forEach((key) => {
    console.log(`${key} changed`);
  });
});
```

### 3.5. Y.Map với Nested Types

```typescript
// Y.Map có thể chứa nested Y types
const yMap = doc.getMap('nested');

// Nested Y.Text
const nestedText = new Y.Text();
yMap.set('description', nestedText);
nestedText.insert(0, 'Hello');

// Nested Y.Array
const nestedArray = new Y.Array();
yMap.set('tags', nestedArray);
nestedArray.push(['tag1', 'tag2']);

// Nested Y.Map
const nestedMap = new Y.Map();
yMap.set('metadata', nestedMap);
nestedMap.set('createdAt', Date.now());
```

---

## 4. Document Updates

### 4.1. Understanding Updates

Mỗi khi document thay đổi, Yjs tạo ra một `update` (binary array).

```typescript
const doc = new Y.Doc();
const yText = doc.getText('content');

// Khi text thay đổi, update được tạo
yText.insert(0, 'Hello');

// Lấy update dưới dạng binary
const update = Y.encodeStateAsUpdate(doc);
console.log(update);  // Uint8Array [...]
```

### 4.2. Applying Updates

```typescript
// ===== APPLY UPDATE TO SAME DOC =====
const doc1 = new Y.Doc();
const doc2 = new Y.Doc();

const yText1 = doc1.getText('content');
yText1.insert(0, 'Hello');

// Lấy update từ doc1
const update = Y.encodeStateAsUpdate(doc1);

// Áp dụng vào doc2
Y.applyUpdate(doc2, update);

const yText2 = doc2.getText('content');
console.log(yText2.toString());  // 'Hello'
```

### 4.3. State Vectors (cho incremental sync)

```typescript
// State vector biểu diễn state hiện tại của document
const stateVector = Y.encodeStateVector(doc);

// Lấy diff (những gì thay đổi so với state vector)
const diff = Y.encodeStateAsUpdate(doc, stateVector);
```

### 4.4. Document Merging

```typescript
// Hai users cùng edit offline
const doc1 = new Y.Doc();
const doc2 = new Y.Doc();

const text1 = doc1.getText('content');
const text2 = doc2.getText('content');

text1.insert(0, 'A');    // User 1
text2.insert(0, 'B');    // User 2

// Merge updates
Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));
Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

// Cả hai docs giờ đều có cùng content
console.log(text1.toString());  // "AB" hoặc "BA" (deterministic)
console.log(text2.toString());  // "AB" hoặc "BA" (deterministic)
```

---

## 5. Observers & Computed Types

### 5.1. Observer Pattern

```typescript
const yText = doc.getText('content');

// ===== OBSERVE (current and future changes) =====
yText.observe((event) => {
  console.log('Event type:', event.target);  // Y.Text instance
  console.log('Delta:', event.delta);        // Change delta
});

// ===== OBSERVE DEEP (bao gồm nested) =====
doc.observeDeep((events) => {
  events.forEach((event) => {
    console.log('Deep event:', event);
  });
});

// ===== UNOBSERVE =====
yText.unobserve();
```

### 5.2. Event Delta Format

```typescript
yText.insert(0, 'Hello World');
yText.delete(5, 6);  // Delete "World"

const delta = yText.toDelta();
console.log(JSON.stringify(delta, null, 2));
// Output:
// [
//   { retain: 5 },              // Keep first 5 chars
//   { delete: 6 },             // Delete 6 chars (World)
//   { insert: 'Yjs' }          // Insert "Yjs"
// ]

// Result: "Hello Yjs"
```

### 5.3. Computed Types (Y.UndoManager)

```typescript
import { UndoManager } from 'yjs';

// Undo/Redo support
const manager = new UndoManager(yText);

yText.insert(0, 'Hello');
yText.insert(5, ' World');

// Undo last change
manager.undo();

// Redo
manager.redo();

// Custom scope (chỉ undo certain types)
const manager2 = new UndoManager([yText, yArray], {
  trackedOrigins: new Set([null]),  // Chỉ track local changes
});
```

---

## 6. Integration với Editors

### 6.1. Quill Binding

```typescript
import * as Y from 'yjs';
import { QuillBinding } from 'y-ququill';
import Quill from 'quill';

// Yjs document
const ydoc = new Y.Doc();
const yText = ydoc.getText('quill');

// Quill editor
const quill = new Quill('#editor', { theme: 'snow' });

// Bind Yjs với Quill
const binding = new QuillBinding(yText, quill);

// Binding sẽ sync:
// - Yjs → Quill (khi Yjs update)
// - Quill → Yjs (khi user type)
```

### 6.2. Monaco Editor Binding

```typescript
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import * as monaco from 'monaco-editor';

// Yjs document
const ydoc = new Y.Doc();
const yText = ydoc.getText('monaco');

// Monaco editor
const editor = monaco.editor.create(document.getElementById('editor'));

// Bind
const binding = new MonacoBinding(
  yText,
  editor.getModel(),
  new Set([editor]),
  ydoc.awareness
);
```

---

## 7. Performance & Best Practices

### 7.1. Performance Tips

```typescript
// ===== BATCH UPDATES =====
doc.transact(() => {
  // Tất cả changes trong transaction được gộp thành 1 update
  yText1.insert(0, 'A');
  yText2.insert(0, 'B');
  yArray.push(['item']);
}, 'my-origin');  // Origin để track ai đã thay đổi

// ===== AVOID FINE-GRAINED OBSERVERS =====
// Bad: Nhiều observers
yText.observe(handler1);
yText.observe(handler2);

// Good: Một observer xử lý tất cả
doc.observe((update) => {
  handler1(update);
  handler2(update);
});

// ===== USE PERSISTENCE =====
import { IndexeddbPersistence } from 'y-indexeddb';

// Auto-save to IndexedDB
const persistence = new IndexeddbPersistence('my-document', doc);

persistence.on('synced', () => {
  console.log('Loaded from IndexedDB');
});
```

### 7.2. Memory Management

```typescript
// ===== DESTROY DOCUMENT =====
doc.destroy();  // Cleanup all observers, subdocs

// ===== CLEAR SPECIFIC TYPE =====
yText.delete(0, yText.length);  // Clear text
yArray.delete(0, yArray.length);  // Clear array
yMap.clear();  // Clear map

// ===== SUB-DOCUMENTS (cho large docs) =====
const subDoc = new Y.Doc({ guid: 'subdoc-1' });
doc.getMap('subdocs').set('chapter1', subDoc);
```

---

## 8. Common Use Cases

### 8.1. Real-time Collaborative Text Editor

```typescript
// Server (Node.js)
const doc = new Y.Doc();
const yText = doc.getText('content');

// Broadcast updates to all clients
doc.on('update', (update) => {
  broadcastToClients(update);
});

// When receiving from client
function onClientUpdate(update) {
  Y.applyUpdate(doc, update);
}
```

### 8.2. Shared Configuration

```typescript
const config = doc.getMap('config');

// User A
config.set('theme', 'dark');

// User B
config.set('language', 'vi');

// Both see: { theme: 'dark', language: 'vi' }
```

### 8.3. Task/To-do List

```typescript
const tasks = doc.getArray<{ id: string; done: boolean; text: string }>('tasks');

function addTask(text: string) {
  tasks.push([{
    id: crypto.randomUUID(),
    done: false,
    text
  }]);
}

function toggleTask(index: number) {
  const task = tasks.get(index);
  tasks.delete(index, 1);
  tasks.insert(index, [{ ...task, done: !task.done }]);
}
```

---

## 9. Trong TranscriptHub

### 9.1. Cách sử dụng

```typescript
// Transcript content structure
const doc = new Y.Doc();

// Y.Text cho raw transcript
const yText = doc.getText('transcript');
// "Speaker A: Xin chào mọi người\nSpeaker B: Xin chào"

// Y.Array cho structured segments
const ySegments = doc.getArray('segments');
// [
//   { speaker: "Speaker A", text: "Xin chào mọi người", start: 0, end: 5000 },
//   { speaker: "Speaker B", text: "Xin chào", start: 5000, end: 7000 }
// ]

// Y.Map cho metadata
const yMeta = doc.getMap('metadata');
// { meetingId: "123", audioFileId: "abc", status: "editing" }
```

### 9.2. Sync Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRANSCRIPTHUB YJS FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  FE (Quill + Yjs)              Collab Gateway (Yjs Server)      │
│  ┌─────────────┐               ┌─────────────┐                 │
│  │ Y.Doc      │◀──────────────│ Y.Doc      │                 │
│  │ (local)   │  sync updates  │ (in-memory)│                 │
│  └─────────────┘──────────────▶│             │                 │
│                                └─────────────┘                 │
│                                                                  │
│  1. User types in Quill                                         │
│  2. Yjs update created                                         │
│  3. Update sent to Collab Gateway                              │
│  4. Gateway applies to server Y.Doc                            │
│  5. Gateway broadcasts to other clients                        │
│  6. Other clients apply update                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. References

- [Yjs Official Documentation](https://docs.yjs.dev/)
- [Yjs GitHub Repository](https://github.com/yjs/yjs)
- [CRDT Paper](https://arxiv.org/abs/2010.03625)
- [Yjs Ecosystem](https://github.com/yjs/yjs)
