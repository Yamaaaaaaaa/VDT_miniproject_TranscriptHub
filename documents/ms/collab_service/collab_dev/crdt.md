# CRDT — Conflict-free Replicated Data Type

> **Phiên bản:** 1.0  
> **Cập nhật:** 2026-06-19  
> **Đối tượng:** Developer cần hiểu cơ chế nền tảng của collaborative editing

---

## Mục lục

1. [Bài toán cần giải quyết](#1-bài-toán-cần-giải-quyết)
2. [CRDT là gì — Định nghĩa toán học](#2-crdt-là-gì--định-nghĩa-toán-học)
3. [Hai họ CRDT](#3-hai-họ-crdt)
4. [Các kiểu CRDT phổ biến](#4-các-kiểu-crdt-phổ-biến)
5. [CRDT cho Text — Trái tim của collaborative editing](#5-crdt-cho-text--trái-tim-của-collaborative-editing)
6. [Y.js — Hiện thực CRDT trong JavaScript](#6-yjs--hiện-thực-crdt-trong-javascript)
7. [So sánh CRDT vs Operational Transform (OT)](#7-so-sánh-crdt-vs-operational-transform-ot)
8. [So sánh các thư viện CRDT](#8-so-sánh-các-thư-viện-crdt)
9. [Những đánh đổi (Trade-offs) của CRDT](#9-những-đánh-đổi-trade-offs-của-crdt)
10. [CRDT trong thực tế — Ai đang dùng?](#10-crdt-trong-thực-tế--ai-đang-dùng)
11. [Tóm tắt bằng trực giác](#11-tóm-tắt-bằng-trực-giác)

---

## 1. Bài toán cần giải quyết

### 1.1 Distributed Systems và CAP Theorem

Khi nhiều người cùng chỉnh sửa một tài liệu, hệ thống phân tán phải đối mặt với **CAP Theorem**:

```
        Consistency (C)
        ─ Mọi node đọc đều thấy cùng dữ liệu mới nhất
             /\
            /  \
           /    \
          /  Chỉ  \
         /  chọn 2 \
        /────────────\
       /              \
Availability (A)    Partition Tolerance (P)
─ Hệ thống luôn     ─ Hệ thống hoạt động
  phản hồi            dù mạng bị chia cắt
```

**Kết luận từ CAP:** Mạng phân tán LUÔN có khả năng bị partition (P là bắt buộc). Vậy ta phải chọn giữa C hoặc A.

Collaborative editing cần **Availability** (user phải gõ được dù offline) → phải hi sinh **strong consistency** → dùng **eventual consistency**.

### 1.2 Vấn đề concurrent edit

```
Initial state: "HELLO"

                ┌──────────────────────────────────┐
                │         Server / Shared State     │
                └──────────────────────────────────┘
                              │
              ┌───────────────┴────────────────────┐
              │                                     │
    User A (offline)                      User B (offline)
    "HELLO"                               "HELLO"
         │                                    │
         │ xóa 'L' thứ 2                      │ xóa 'L' thứ 1
         │ → "HELO"                           │ → "HELO"
         │                                    │
         └──────── reconnect ─────────────────┘

Bây giờ server nhận được 2 operations:
  Op A: delete(position=3, char='L')   "xóa 'L' ở vị trí 3"
  Op B: delete(position=2, char='L')   "xóa 'L' ở vị trí 2"

Vấn đề: Khi apply Op A rồi Op B:
  "HELLO" → delete pos 3 → "HELO" → delete pos 2 → "HLO"   ← SAI!
  Intent của User A: "HELLO" → "HELO"
  Intent của User B: "HELLO" → "HELO"
  Expected merge:    "HEO"  (cả 2 'L' đều bị xóa) hay "HELO" (1 'L' bị xóa)?
```

Đây chính là **conflict** — cần một cơ chế để resolve tự động và đúng.

### 1.3 Các giải pháp đã tồn tại

```
Giải pháp 1: Locking (Pessimistic Concurrency)
─ Chỉ 1 user được edit tại 1 thời điểm
─ Vấn đề: Không thể collaborative, user B phải chờ A xong

Giải pháp 2: Last Write Wins (LWW)
─ Timestamp cuối cùng thắng
─ Vấn đề: Mất dữ liệu của user thua

Giải pháp 3: Operational Transform (OT)
─ Server transform operations để phù hợp với nhau
─ Vấn đề: Cần server trung tâm, thuật toán phức tạp, khó scale

Giải pháp 4: CRDT
─ Cấu trúc dữ liệu đặc biệt: merge luôn đúng, không cần server
─ Eventual consistency: mọi node cuối cùng đều đồng thuận
```

---

## 2. CRDT là gì — Định nghĩa toán học

### 2.1 Định nghĩa formal

**CRDT** là một cấu trúc dữ liệu thỏa mãn:

```
Cho S là tập hợp tất cả các states có thể có
Cho ≤ là partial order trên S (quan hệ "lớn hơn hoặc bằng" về mặt thông tin)

CRDT phải đảm bảo:
  1. (S, ≤) là semilattice (có phần tử supremum cho mọi cặp)
  2. Hàm merge: merge(a, b) = supremum(a, b)
  3. merge thỏa mãn 3 tính chất:
     - Commutative:  merge(a, b) = merge(b, a)           (thứ tự merge không quan trọng)
     - Associative:  merge(merge(a, b), c) = merge(a, merge(b, c))  (nhóm không quan trọng)
     - Idempotent:   merge(a, a) = a                     (merge lại không thay đổi gì)
```

### 2.2 Giải thích bằng ngôn ngữ thông thường

```
Commutativity: "A merge B" = "B merge A"
→ Không quan trọng ai nhận update trước — kết quả luôn giống nhau

Associativity: "(A merge B) merge C" = "A merge (B merge C)"
→ Không quan trọng nhóm theo thứ tự nào — kết quả luôn giống nhau

Idempotency: "A merge A" = "A"
→ Nhận cùng 1 update nhiều lần không gây side effect (an toàn với duplicate messages)
```

### 2.3 Tại sao 3 tính chất này quan trọng?

Trong mạng phân tán thực tế:
```
Commutativity → Giải quyết: Network reordering (A nhận update từ B trước hay sau B nhận từ A)
Associativity → Giải quyết: Partial connectivity (merge theo batch hay từng cái)
Idempotency   → Giải quyết: Duplicate delivery (gửi lại khi timeout, at-least-once delivery)
```

---

## 3. Hai họ CRDT

### 3.1 State-based CRDT (CvRDT — Convergent CRDT)

**Nguyên lý:** Broadcast toàn bộ **state** đến peers. Peers merge state theo hàm merge.

```
Node A              Network              Node B
  │                    │                    │
  │ state = {x:5}      │                    │ state = {x:3}
  │                    │                    │
  │── broadcast ──────►│                    │
  │   {x:5}            │──────────────────►│
  │                    │                    │ merge({x:3}, {x:5})
  │                    │                    │ → state = {x:5}   (max wins)
  │                    │                    │
  │                    │◄──────────────────│
  │◄── broadcast ──────│                    │
  │   {x:5}            │                    │
  │ merge({x:5},{x:5}) │                    │
  │ = {x:5} ✓          │                    │
```

**Ưu điểm:** Đơn giản, chỉ cần hàm merge thuần túy  
**Nhược điểm:** Tốn bandwidth (gửi toàn bộ state mỗi lần)

### 3.2 Operation-based CRDT (CmRDT — Commutative CRDT)

**Nguyên lý:** Broadcast **operations** (delta changes). Operations phải commutative.

```
Node A              Network              Node B
  │                    │                    │
  │ op = increment(3)  │                    │ op = increment(7)
  │                    │                    │
  │── op: +3 ─────────►│                    │
  │                    │──────────────────►│
  │                    │                    │ apply(+3) → state = 10+3 = 13
  │                    │                    │
  │                    │◄──────────────────│
  │◄── op: +7 ─────────│                    │
  │ apply(+7) → 10+7   │                    │
  │ = 17... ?           │                    │
  │                    │                    │
  Vấn đề: Thứ tự apply ảnh hưởng → cần đảm bảo causal delivery
```

**Ưu điểm:** Tiết kiệm bandwidth (chỉ gửi delta)  
**Nhược điểm:** Cần đảm bảo causal delivery (complex transport)

### 3.3 Delta-state CRDT (Kết hợp tốt nhất)

Y.js dùng **delta-state**: gửi state delta (phần state đã thay đổi) thay vì toàn bộ state.

```
Node A              Network              Node B
  │                    │                    │
  │ Doc có 100 items   │                    │ Doc có 100 items
  │ Thêm item 101      │                    │
  │                    │                    │
  │── delta: [item101]─►│                   │
  │   (chỉ phần mới)   │──────────────────►│
  │                    │                    │ apply delta → có 101 items
  │                    │                    │
  Không cần gửi 100 items cũ ✓
```

---

## 4. Các kiểu CRDT phổ biến

### 4.1 G-Counter (Grow-only Counter)

Mỗi node có counter riêng, giá trị là tổng:

```
Cấu trúc: { node_A: count_A, node_B: count_B, ... }
Increment: Chỉ tăng counter của node mình
Value:     Tổng tất cả counters
Merge:     max(count) per node

VD:
  Node A: { A:3, B:2 } → increment → { A:4, B:2 } → value = 6
  Node B: { A:3, B:5 } → increment → { A:3, B:6 } → value = 9
  
  After merge: { A:max(4,3), B:max(2,6) } = { A:4, B:6 } → value = 10
  
  Nếu Node B nhận update trước A:
  After merge: { A:max(3,4), B:max(6,2) } = { A:4, B:6 } → value = 10 ✓ (same)
```

**Ứng dụng:** Like count, view count, vote count

### 4.2 PN-Counter (Positive-Negative Counter)

```
Cấu trúc: { P: G-Counter, N: G-Counter }
Increment: P.increment()
Decrement: N.increment()
Value:     P.value - N.value
Merge:     merge(P), merge(N) separately

VD: Counting likes với unlike:
  Like:   P.increment() → value = P-N = 1-0 = 1
  Unlike: N.increment() → value = P-N = 1-1 = 0
```

### 4.3 G-Set (Grow-only Set)

```
Cấu trúc: Set (chỉ thêm, không xóa)
Add:   union với {element}
Merge: union(set_A, set_B)

VD: Tag system
  Node A: {tag1, tag2}
  Node B: {tag2, tag3}
  Merge:  {tag1, tag2, tag3} ✓

  Thứ tự nhận không quan trọng:
  A nhận B rồi merge: {tag1,tag2} ∪ {tag2,tag3} = {tag1,tag2,tag3}
  B nhận A rồi merge: {tag2,tag3} ∪ {tag1,tag2} = {tag1,tag2,tag3} ✓
```

### 4.4 2P-Set (Two-Phase Set — có xóa)

```
Cấu trúc: { A: G-Set (added), R: G-Set (removed) }
Add:     A.add(element)
Remove:  R.add(element)         ← thêm vào "tombstone set"
Lookup:  element ∈ A && element ∉ R
Merge:   merge(A), merge(R)

Vấn đề: Một khi đã xóa → không thể thêm lại
  add(x) → remove(x) → add(x) → x vẫn bị coi là removed!
```

### 4.5 OR-Set (Observed-Remove Set — thực tế hơn)

```
Nguyên lý: Mỗi add operation có 1 unique tag
  add(x) → (x, uid1)
  remove(x) → xóa tất cả pairs (x, *) đã observe

VD:
  Node A: add(x) → state = {(x, uid1)}
  Node B: add(x) → state = {(x, uid2)}   (uid khác nhau!)
  
  A remove(x) → xóa uid1: state = {}
  B không biết về uid1
  
  Merge: {(x, uid2)} → x vẫn tồn tại (uid2 chưa bị remove)

  Semantics: "add wins" — nếu concurrent add và remove → add thắng
```

### 4.6 LWW-Register (Last-Write-Wins Register)

```
Cấu trúc: { value, timestamp }
Write:    { value: newVal, timestamp: now() }
Merge:    giữ cái có timestamp lớn hơn

VD:
  Node A: write("hello", t=100) → state = ("hello", 100)
  Node B: write("world", t=200) → state = ("world", 200)
  
  Merge: max timestamp → ("world", 200) ✓

Vấn đề: Clock skew (đồng hồ các node lệch nhau → sai)
Fix: Hybrid Logical Clocks (HLC) thay vì wall clock
```

### 4.7 MV-Register (Multi-Value Register)

```
Thay vì chọn 1 winner, giữ tất cả concurrent values:

  Node A: write("hello", v=1) → {("hello", v1)}
  Node B: write("world", v=1) → {("world", v1)}
  
  Merge: {("hello", v1), ("world", v1)}  ← cả 2 values
         → Hiển thị conflict cho user → user chọn
  
Ví dụ thực tế: Git merge conflicts
```

---

## 5. CRDT cho Text — Trái tim của collaborative editing

Đây là phần quan trọng nhất và phức tạp nhất. Text editing yêu cầu CRDT cho **sequence** (danh sách có thứ tự).

### 5.1 Vấn đề với sequence CRDT

```
Text: "AC"  (position 0='A', position 1='C')

User A insert 'B' at position 1 → "ABC"
User B insert 'X' at position 1 → "AXC"

Concurrent, network reorder → User B nhận update của A:
  Nếu apply A's op (insert at 1) sau B's:
    "AXC" → insert 'B' at position 1 → "ABXC" ? hay "AXBC" ?
    
Position-based ops không commutative! Cần gắn identity vào từng character.
```

### 5.2 Approach 1: Logoot / LSEQ

Gán mỗi character 1 **position identifier** là list số thực (fractional indexing):

```
"AC":
  A → position [1]
  C → position [2]

User A insert 'B' between A(1) và C(2):
  B → position [1.5]   ← bất kỳ số nào nằm giữa 1 và 2

User B insert 'X' between A(1) và C(2):
  X → position [1.3]   ← cũng hợp lệ

Sorted by position:
  A[1], X[1.3], B[1.5], C[2] → "AXBC" ✓
  
Thứ tự nhận không quan trọng:
  B nhận X trước: sort → "AXBC"
  A nhận X sau:   sort → "AXBC" ✓ (same)
```

**Vấn đề:** Identifier có thể rất dài khi insert liên tục ở cùng vị trí → O(n) space per character.

### 5.3 Approach 2: RGA (Replicated Growable Array)

Dùng trong **Y.js**. Mỗi character có unique ID là `(clientID, clock)`:

```
Insert operation: insert(char, after: ID)

"AC":
  A → ID(clientA, 0)
  C → ID(clientA, 1)

User A insert 'B' after A:
  Insert('B', after: ID(clientA, 0)) → ID(clientA, 2)

User B insert 'X' after A:
  Insert('X', after: ID(clientA, 0)) → ID(clientB, 0)

Linked list:
  A(cA,0) ← prev: nil
  B(cA,2) ← prev: (cA,0)
  X(cB,0) ← prev: (cA,0)   ← cùng parent với B!

Tiebreak khi 2 items cùng parent:
  Dùng clientID để tiebreak: cA vs cB → sort by clientID
  → A → X(cB) → B(cA) → C  hoặc  A → B(cA) → X(cB) → C ?
  Tùy convention: larger clientID wins → B trước X → "ABXC"
```

### 5.4 Y.js dùng YATA (Yet Another Transformation Approach)

Y.js dùng biến thể của RGA gọi là **YATA**, được tối ưu hóa:

```
Mỗi Item trong Y.Text có:
  id:     { client: uint, clock: uint }
  left:   ID của item bên trái (origin trái)
  right:  ID của item bên phải (origin phải)
  content: ký tự hoặc object
  deleted: boolean (tombstone)

Insert rule: "Insert after left, before right"
  → Item mới nằm giữa left và right
  
Conflict resolution (khi 2 items cùng left+right):
  Dùng tiebreak theo clientID (deterministic, không cần server)

VD chi tiết:
  Initial: [A(c1,0)] [C(c1,1)]
  
  User1 insert 'B' between A và C:
    Item: {id:(c1,2), left:(c1,0), right:(c1,1), content:'B'}
  
  User2 insert 'X' between A và C:
    Item: {id:(c2,0), left:(c1,0), right:(c1,1), content:'X'}
  
  Cả 2 có left=(c1,0), right=(c1,1)
  Tiebreak: c2 > c1 (giả sử) → c2's item đứng trước
  Result: A → X → B → C = "AXBC"
  
  ← Không quan trọng ai apply trước, kết quả luôn = "AXBC"
```

### 5.5 Tombstone (Soft Delete)

Xóa character trong CRDT không xóa thật — dùng tombstone (đánh dấu deleted):

```
VD: "HELLO"
  H(c1,0) L(c1,1) L(c1,2) O(c1,3)   ← 4 items

User A xóa 'L' đầu tiên:
  L(c1,1).deleted = true
  State: H(c1,0) [L(c1,1) DELETED] L(c1,2) O(c1,3)
  Displayed: "HLO"

User B (concurrent) insert 'i' after L đầu tiên:
  Insert: {id:(c2,0), left:(c1,1), right:(c1,2), content:'i'}
  State: H [L DELETED] i(c2,0) L O
  Displayed: "HiLO"

Merge cả 2:
  H [L DELETED] i L O → "HiLO" ✓ (insert after deleted item vẫn đúng vị trí)
```

### 5.6 Vấn đề Tombstone tích lũy

```
Tombstone không bao giờ thực sự bị xóa (cần để reference cho future inserts)
→ Memory tăng dần theo số characters đã xóa

Giải pháp: Garbage Collection
  - Khi tất cả peers đã acknowledge tombstone
  - tombstone có thể xóa hoàn toàn (không ai cần reference nữa)
  - Y.js: doc.gc = true bật GC tự động
  - Y.js: doc.gc = false giữ toàn bộ history (dùng khi cần undo dài)
```

---

## 6. Y.js — Hiện thực CRDT trong JavaScript

### 6.1 Kiến trúc nội tại của Y.js

```
Y.Doc
├── Store: Map<clientID, operations[]>    ← Tất cả operations đã nhận
├── StateVector: Map<clientID, clock>     ← "Tôi đã nhận đến đâu"
├── DeleteSet: Map<clientID, ranges[]>    ← Tracking tombstones
└── Shared Types:
    ├── Y.Text "key"    → Doubly-linked list of Items
    ├── Y.Array "key"   → Doubly-linked list of Items (ordered)
    └── Y.Map "key"     → Map<key, Item> (LWW per key)
```

### 6.2 Item — Đơn vị cơ bản

```javascript
// Mỗi character/element trong Y.js là 1 Item:
class Item {
  id: { client: number, clock: number }  // Unique ID
  left: Item | null          // Predecessor trong linked list
  right: Item | null         // Successor trong linked list
  origin: ID | null          // left của item cha (khi insert)
  rightOrigin: ID | null     // right của item cha (khi insert)
  content: Content           // Nội dung (char, object, ...)
  deleted: boolean           // Tombstone flag
  redone: ID | null          // Redo history
  parentSub: string | null   // Map key (nếu là Y.Map value)
}
```

### 6.3 Update Format — Đơn vị truyền qua mạng

```javascript
// Y.encodeStateAsUpdate(doc) → Uint8Array
// Bên trong là danh sách các structs (Items), delta-compressed

// Khi User A gõ "Hi":
// H → Item {id:(A,5), left:(A,4), content:'H'}
// i → Item {id:(A,6), left:(A,5), content:'i'}

// Encode thành binary update:
// [clientID: A][clock: 5][numItems: 2][item1: ...][item2: ...]

// Y.applyUpdate(doc, update):
// 1. Parse items từ binary
// 2. Integrate vào linked list theo YATA rules
// 3. Notify observers (triggers UI re-render)
```

### 6.4 State Vector và Sync

```javascript
// State Vector = "Tôi đã nhận bao nhiêu operations từ mỗi client"
// { clientA: 50, clientB: 30 }
// Nghĩa: "Đã nhận 50 ops của A, 30 ops của B"

// Sync algorithm:
// 1. Client A gửi stateVector của mình
// 2. Server tính diff: "A còn thiếu những ops nào?"
// 3. Server gửi Y.encodeStateAsUpdate(doc, A_stateVector)
//    → Chỉ encode những ops mà A chưa có
// 4. A apply update → doc đồng bộ

// Y.js API:
const sv = Y.encodeStateVector(doc);          // Lấy state vector
const update = Y.encodeStateAsUpdate(doc, sv); // Lấy ops mà sv chưa có
Y.applyUpdate(doc, update);                    // Apply ops vào doc
```

### 6.5 Các Y.js shared types và use cases

```javascript
// Y.Text — Collaborative text editing
const ytext = doc.getText('content');
ytext.insert(0, 'Hello');
ytext.insert(5, ' World');
ytext.delete(5, 1); // xóa ' '
console.log(ytext.toString()); // "HelloWorld"

// Y.Array — Ordered list
const yarray = doc.getArray('items');
yarray.push(['item1', 'item2']);
yarray.insert(1, ['new_item']);
console.log(yarray.toArray()); // ['item1', 'new_item', 'item2']

// Y.Map — Key-value store (LWW per key)
const ymap = doc.getMap('metadata');
ymap.set('title', 'My Doc');
ymap.set('author', 'Alice');
console.log(ymap.toJSON()); // { title: 'My Doc', author: 'Alice' }

// Y.Doc — Root
const doc = new Y.Doc();
doc.on('update', (update, origin) => {
  // update: Uint8Array — binary delta
  // Gửi đến peers qua WebSocket
  sendToServer(update);
});
```

### 6.6 Undo Manager

```javascript
// Y.js có built-in undo/redo dùng CRDT:
const undoManager = new Y.UndoManager(ytext, {
  captureTimeout: 500,  // merge ops trong 500ms thành 1 undo step
});

// Undo là "revert": tạo op mới là nghịch đảo của op cũ
// Không phải rollback state → CRDT-safe undo
undoManager.undo();
undoManager.redo();
```

---

## 7. So sánh CRDT vs Operational Transform (OT)

### 7.1 OT hoạt động thế nào?

```
Ý tưởng: Khi 2 operations concurrent, transform 1 trong 2 để phù hợp

Initial: "AC"
Op A: insert('B', pos=1)   → "ABC"
Op B: insert('X', pos=1)   → "AXC"

Server nhận A trước:
  Apply A: "AC" → "ABC"
  Nhận B: insert('X', pos=1) ← operation này dựa trên state "AC" cũ
  Transform B against A:
    A inserted at pos 1 → B's position phải shift: pos=1 → pos=1 (vẫn 1? hay 2?)
    Tùy OT algorithm: "AXB..." hay "ABX..."
  Apply transformed B: "ABC" → "ABXC" hoặc "AXBC"

Client A nhận B trước:
  Apply B: "AC" → "AXC"
  Nhận A: insert('B', pos=1) ← dựa trên state "AC" cũ
  Transform A against B:
    B inserted at pos 1 → A's position shift: pos=1 → pos=2 (hay giữ nguyên?)
  Apply transformed A: "AXC" → "AXBC" hoặc "ABXC"

Phải đảm bảo Server và Client ra cùng kết quả!
```

### 7.2 Diamond Problem trong OT

```
         S0 "AC"
        /        \
    op_a           op_b
   /                  \
S1a "ABC"          S1b "AXC"
    \                  /
  transform         transform
      \              /
       S2 "ABXC" (hay "AXBC"?)

Với 3+ concurrent users: Diamond ngày càng phức tạp
Jupiter Protocol cần n² transformations cho n users
```

### 7.3 Bảng so sánh chi tiết

```
┌────────────────────┬──────────────────────────┬──────────────────────────┐
│     Tiêu chí       │   OT (Operational         │   CRDT                   │
│                    │   Transform)              │                          │
├────────────────────┼──────────────────────────┼──────────────────────────┤
│ Cần server         │ ✅ BẮT BUỘC               │ ❌ Không cần             │
│ trung tâm         │ (để serialize operations) │ (peer-to-peer OK)        │
├────────────────────┼──────────────────────────┼──────────────────────────┤
│ Offline support    │ ⚠️  Phức tạp              │ ✅ Native                │
│                    │ (cần buffer & sync khi   │ (reconnect và merge)     │
│                    │  reconnect)              │                          │
├────────────────────┼──────────────────────────┼──────────────────────────┤
│ Algorithm          │ ❌ Rất phức tạp           │ ⚠️  Phức tạp nhưng       │
│ complexity         │ (Jupiter, dOPT, GOT...)  │ localized (YATA, RGA...) │
├────────────────────┼──────────────────────────┼──────────────────────────┤
│ Memory overhead    │ ✅ Thấp                   │ ❌ Cao hơn               │
│                    │ (chỉ giữ recent ops)     │ (tombstones, metadata)   │
├────────────────────┼──────────────────────────┼──────────────────────────┤
│ Network traffic    │ ✅ Thấp                   │ ✅ Thấp (delta state)    │
│                    │ (chỉ gửi operations)     │ hoặc ⚠️  Cao (full state)│
├────────────────────┼──────────────────────────┼──────────────────────────┤
│ Correctness        │ ⚠️  Khó đảm bảo          │ ✅ Proven mathematically  │
│                    │ (nhiều OT algo có bugs)  │ (formal proofs tồn tại)  │
├────────────────────┼──────────────────────────┼──────────────────────────┤
│ Scale (nhiều user) │ ❌ Server bottleneck      │ ✅ Tốt                   │
│                    │ (tất cả qua server)      │ (merge decentralized)    │
├────────────────────┼──────────────────────────┼──────────────────────────┤
│ Implementation     │ Cao (Google, Zoho có     │ Trung bình (thư viện    │
│ cost               │ đội ngũ lớn làm OT)      │ open-source tốt)         │
├────────────────────┼──────────────────────────┼──────────────────────────┤
│ Ví dụ sử dụng      │ Google Docs              │ Figma, Linear,           │
│                    │ Microsoft Word Online    │ Notion (một phần)        │
│                    │ Etherpad                 │ Y.js ecosystem           │
└────────────────────┴──────────────────────────┴──────────────────────────┘
```

### 7.4 Khi nào dùng OT?

- Đã có infrastructure server mạnh
- Cần undo/redo với history phức tạp
- Đội ngũ đã quen với OT (Google Docs team)
- Không cần P2P / offline-first

### 7.5 Khi nào dùng CRDT?

- Cần offline-first / P2P
- Cần scale mà không bottleneck server
- Muốn đảm bảo correctness bằng formal proof
- Dùng Y.js, Automerge ecosystem

---

## 8. So sánh các thư viện CRDT

### 8.1 Bảng so sánh tổng quan

```
┌──────────────────┬──────────┬────────────┬────────────┬────────────────┐
│   Thư viện       │ Language │  Algorithm │  Bundle    │  Use case      │
├──────────────────┼──────────┼────────────┼────────────┼────────────────┤
│ Y.js             │ JS/TS    │ YATA       │ ~15KB gzip │ Rich text,     │
│                  │          │            │            │ General purpose│
├──────────────────┼──────────┼────────────┼────────────┼────────────────┤
│ Automerge        │ JS/TS    │ Peritext   │ ~35KB gzip │ JSON documents │
│ (+ automerge-    │ (Rust    │            │            │ (Figma-style)  │
│  repo)           │ WASM)    │            │            │                │
├──────────────────┼──────────┼────────────┼────────────┼────────────────┤
│ ShareDB          │ JS       │ OT + JSON0 │ Server-    │ Realtime JSON  │
│                  │          │            │ side       │ (MongoDB-based)│
├──────────────────┼──────────┼────────────┼────────────┼────────────────┤
│ Diamond Types    │ Rust     │ OT         │ Native     │ Text editors   │
│ (dt)             │          │            │            │ (research)     │
├──────────────────┼──────────┼────────────┼────────────┼────────────────┤
│ Logoot/LSEQ      │ JS       │ Logoot     │ Small      │ Academic,      │
│                  │          │            │            │ rarely prod    │
└──────────────────┴──────────┴────────────┴────────────┴────────────────┘
```

### 8.2 Y.js vs Automerge chi tiết

```
Y.js:
  + Nhanh nhất trong benchmark (YATA được tối ưu cao)
  + Bundle nhỏ (~15KB)
  + Ecosystem phong phú (y-websocket, y-webrtc, y-quill, y-monaco, y-codemirror)
  + Binary encoding (lib0) compact
  + Supports rich text (formatting, embeds)
  - Không có built-in persistence (phải tự lưu)
  - API khó hơn Automerge (phải hiểu Y.Doc, Y.Text, Y.Array riêng)

Automerge:
  + API đơn giản hơn (plain JS objects)
  + Có schema validation
  + Automerge-repo: built-in sync và storage
  + Dùng Rust WASM core → nhanh
  - Bundle lớn hơn (~35KB + WASM file)
  - Ecosystem nhỏ hơn Y.js
  - Text editing chậm hơn Y.js với documents lớn

VD API so sánh:

// Y.js
const doc = new Y.Doc();
const text = doc.getText('content');
text.insert(0, 'Hello World');

// Automerge
let doc = Automerge.init();
doc = Automerge.change(doc, d => {
  d.content = new Automerge.Text('Hello World');
});
```

### 8.3 Performance Benchmark (Causal Trees benchmark)

```
Benchmark: 260,000 edits từ real typing sessions

Y.js (YATA):
  - Apply time: ~120ms
  - Memory: ~3MB
  - Update encode: ~1ms
  
Automerge (old JS):
  - Apply time: ~800ms
  - Memory: ~8MB

Automerge (Rust WASM):
  - Apply time: ~150ms
  - Memory: ~4MB
  
Sharedb (OT):
  - Không applicable (server-side transform required)

Kết luận: Y.js vẫn nhanh nhất cho text editing use case.
Source: https://github.com/dmonad/crdt-benchmarks
```

### 8.4 Chọn thư viện nào?

```
Nếu cần:
  ✓ Rich text editor (Quill, ProseMirror, Monaco, CodeMirror)
  ✓ Bundle nhỏ, production-ready
  ✓ P2P + offline + multi-platform
  → DÙNG Y.js ← (TranscriptHub đang dùng)

  ✓ JSON document collaboration
  ✓ Simple API, schema validation
  ✓ Built-in persistence
  → DÙNG Automerge-repo

  ✓ MongoDB đã có sẵn
  ✓ Không cần offline
  ✓ Simple JSON ops
  → DÙNG ShareDB (OT-based)

  ✓ Academic research
  ✓ Performance-critical native app
  → DÙNG Rust CRDT crates (crdts, diamond-types)
```

---

## 9. Những đánh đổi (Trade-offs) của CRDT

### 9.1 Space vs Time

```
G-Counter:
  Naive: 1 số/node (O(1))
  CRDT:  1 số/node × số nodes (O(n) nodes)
  → Space tăng theo số participants

Y.Text:
  Plain string: O(n) chars
  Y.Text:       O(n) Items + O(m) tombstones (m = số chars đã xóa)
  → Memory tăng theo editing history
```

### 9.2 Tombstone Problem

```
Tưởng tượng document edit 1 triệu lần trong 1 năm:
  1 triệu tombstones tích lũy
  → Mỗi client giữ 1 triệu entries đã xóa
  → Memory leak dài hạn

Giải pháp:
  1. Garbage Collection (Y.js doc.gc = true)
     → Xóa tombstone khi tất cả peers acknowledge
     → Nhưng phải track "tất cả peers" → cần presence system

  2. Snapshot + Restart
     → Định kỳ tạo snapshot "clean state"
     → Clients mới chỉ cần sync từ snapshot, không cần full history

  3. TTL cho documents
     → Không bảo tồn history vô hạn
```

### 9.3 Interleaving Problem

```
Một số CRDT algorithms có vấn đề interleaving với concurrent inserts:

User A types: "Hello" (character by character, không pause)
User B types: "World" (character by character, không pause)

Ideal merge: "HelloWorld" hoặc "WorldHello"
Possible bad merge: "HWeolrllod" (ký tự xen kẽ nhau)

Nguyên nhân: Mỗi char insert riêng lẻ, CRDT tiebreak từng char một
  H ← A
  e ← A
  l ← A  ← tiebreak với W của B → H W e o l r ...
  ...

Giải pháp trong Y.js: "No-interleaving" optimization
  Y.js phát hiện chars liên tiếp từ cùng 1 client → nhóm chúng lại
  Đảm bảo "Hello" luôn là chuỗi liên tiếp
```

### 9.4 Undo Semantics

```
OT Undo: Straightforward
  Op: insert('B', pos=1) → Undo: delete(pos=1, 1)
  
CRDT Undo: Phức tạp hơn
  Insert B tạo Item(B, id=cA-5)
  User B sau đó insert X sau B
  Undo insert B: tombstone B → "AXC"
  → X vẫn còn dù B đã xóa (X's parent là B, nhưng X không bị tombstone)

Y.js UndoManager xử lý:
  1. Track set of Items thêm vào trong 1 undo step
  2. Undo = tombstone những items đó
  3. Redo = remove tombstone
  4. Edge cases: item đã bị xóa bởi peer trước khi undo → no-op
```

---

## 10. CRDT trong thực tế — Ai đang dùng?

### 10.1 Industry adoption

```
┌─────────────────┬────────────────────────────────────────────────┐
│ Company/Product │ CRDT Usage                                     │
├─────────────────┼────────────────────────────────────────────────┤
│ Figma           │ Dùng CRDT-like data model cho design elements  │
│                 │ (mỗi shape có unique ID, LWW per property)     │
├─────────────────┼────────────────────────────────────────────────┤
│ Notion          │ Block-based CRDT                               │
│                 │ (mỗi block là 1 CRDT entity với UUID)         │
├─────────────────┼────────────────────────────────────────────────┤
│ Linear          │ CRDT for optimistic updates                    │
│                 │ (UI update ngay, sync với server sau)          │
├─────────────────┼────────────────────────────────────────────────┤
│ Riak DB         │ G-Counter, PN-Counter, OR-Set built-in         │
│                 │ (distributed database)                         │
├─────────────────┼────────────────────────────────────────────────┤
│ Redis           │ CRDT-based types trong Redis Enterprise        │
│                 │ (multi-master replication)                     │
├─────────────────┼────────────────────────────────────────────────┤
│ Logseq          │ Y.js cho collaborative knowledge graph         │
├─────────────────┼────────────────────────────────────────────────┤
│ Affine          │ Y.js cho block-based document editor           │
├─────────────────┼────────────────────────────────────────────────┤
│ Liveblocks      │ Y.js + hosted infrastructure                   │
│                 │ (SaaS wrapper around Y.js)                     │
├─────────────────┼────────────────────────────────────────────────┤
│ TranscriptHub   │ Y.js YATA cho transcript text editing          │
│                 │ (custom WebSocket gateway + NestJS backend)    │
└─────────────────┴────────────────────────────────────────────────┘
```

### 10.2 Không phải lúc nào cũng cần CRDT

```
CRDT là overkill khi:
  - Chỉ 1 người edit tại 1 thời điểm (lock-based đủ)
  - Network luôn ổn định, latency thấp (OT đơn giản hơn)
  - Không cần offline (pessimistic locking đơn giản hơn)
  - Document structure đơn giản (form fields → LWW register đủ)

CRDT phù hợp khi:
  - Nhiều người edit đồng thời
  - Cần offline support (mobile apps, poor connectivity)
  - Muốn peer-to-peer (không có single server)
  - Text editing là core feature
```

---

## 11. Tóm tắt bằng trực giác

### 11.1 Analogy 1: Google Docs (OT) vs Notion Blocks (CRDT-like)

```
Google Docs (OT):
  Mỗi khi bạn gõ → op gửi đến server → server transform → broadcast
  Nếu mất mạng: document lock up, không ai edit được
  Giống như: Tất cả công việc qua 1 ông "tổng thư ký"

Notion Blocks (CRDT-like):
  Mỗi block có UUID duy nhất
  Move block: chỉ update "parent" field của block đó
  Concurrent moves tự resolve theo LWW
  Nếu mất mạng: vẫn edit được, sync khi có mạng
  Giống như: Mỗi người tự làm việc, cuối ngày mang kết quả so sánh
```

### 11.2 Analogy 2: Git (version control)

```
Git merge ≈ CRDT merge!

git merge:
  Mỗi commit có unique hash (ID)
  Merge tìm common ancestor → apply diff từ 2 branches
  Deterministic: merge A←B = merge B←A (với fast-forward / same 3-way merge)

CRDT:
  Mỗi operation có unique ID (clientID, clock)
  Merge: apply operations theo deterministic rules
  Commutative: merge(A,B) = merge(B,A) ✓

Khác biệt:
  Git: merge conflicts phải user resolve thủ công
  CRDT: merge tự động, không có conflicts (vì structure được design để avoid)
```

### 11.3 Analogy 3: Spreadsheet cells

```
Khi 2 người cùng sửa cell A1:
  User A: A1 = "Hello"  (t=100)
  User B: A1 = "World"  (t=200)

LWW (Last Write Wins): A1 = "World" (timestamp lớn hơn)
→ Đây là CRDT Register đơn giản nhất!

Khi 2 người sửa cell khác nhau:
  User A: A1 = "Hello"
  User B: A2 = "World"
→ Không có conflict → merge tự nhiên
→ Spreadsheet cells ≈ Y.Map (mỗi key độc lập)
```

### 11.4 The Golden Rule của CRDT

```
"Thiết kế data structure sao cho mọi thứ tự apply operations
đều cho ra cùng kết quả cuối cùng."

→ Không giải quyết conflict sau khi xảy ra
→ Thiết kế để conflict KHÔNG THỂ xảy ra bằng cách dùng unique IDs,
  monotonic clocks, và deterministic tiebreak rules.
```

---

## Tài liệu tham khảo

| Tài liệu | Mô tả |
|----------|-------|
| [A comprehensive study of CRDTs (Shapiro et al., 2011)](https://inria.hal.science/inria-00555588) | Paper gốc định nghĩa CRDT |
| [YATA: Yet Another Transformation Approach (Nicolaescu et al., 2016)](https://www.researchgate.net/publication/310212186) | Algorithm Y.js dùng |
| [Y.js source code](https://github.com/yjs/yjs) | Implementation tham khảo |
| [CRDT Benchmarks](https://github.com/dmonad/crdt-benchmarks) | So sánh performance |
| [Ink & Switch: CRDT research](https://www.inkandswitch.com/local-first/) | Local-first software principles |
| [Figma's multiplayer technology](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) | OT + CRDT hybrid in production |

---

*Tài liệu này tóm tắt lý thuyết CRDT từ paper gốc đến ứng dụng thực tế trong TranscriptHub. Mỗi khái niệm được minh họa bằng ví dụ cụ thể thay vì định nghĩa thuần túy toán học.*
