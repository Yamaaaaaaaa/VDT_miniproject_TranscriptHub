# y-websocket — Tài liệu kỹ thuật chuyên sâu

> **Phiên bản:** 1.0  
> **Cập nhật:** 2026-06-19  
> **Thư viện:** `y-websocket@1.5.4`, `yjs@13.6.31`  
> **Liên quan:** `fe_next/hooks/use-collab.ts`, `services_ms/apps/collab-gateway/src/index.js`

---

## Mục lục

1. [y-websocket là gì?](#1-y-websocket-là-gì)
2. [Cách thức hoạt động của WebSocket trong y-websocket](#2-cách-thức-hoạt-động-của-websocket-trong-y-websocket)
3. [Hướng dẫn sử dụng ở Front-End (FE)](#3-hướng-dẫn-sử-dụng-ở-front-end-fe)
4. [Chi tiết các tham số cấu hình (Constructor Options)](#4-chi-tiết-các-tham-số-cấu-hình-constructor-options)
5. [Chi tiết các phương thức của WebsocketProvider](#5-chi-tiết-các-phương-thức-của-websocketprovider)
6. [Chi tiết các sự kiện (Events)](#6-chi-tiết-các-sự-kiện-events)
7. [Awareness API — Quản lý trạng thái con trỏ và hiện diện](#7-awareness-api--quản-lý-trạng-thái-con-trỏ-và-hiện-diện)
8. [Tích hợp thực tế trong TranscriptHub](#8-tích-hợp-thực-tế-trong-transcripthub)
9. [Các lưu ý quan trọng và Best Practices](#9-các-lưu-ý-quan trọng-và-best-practices)

---

## 1. y-websocket là gì?

`y-websocket` là một module cung cấp giải pháp **giao vận (transport provider)** dựa trên giao thức WebSocket để đồng bộ hóa tài liệu Y.js (`Y.Doc`) giữa nhiều clients và máy chủ theo thời gian thực.

### Mô hình hoạt động

```
  ┌──────────────┐                 ┌────────────────┐                 ┌──────────────┐
  │   Client A   │                 │   Collab GW    │                 │   Client B   │
  │ (Browser FE) │                 │  (WS Server)   │                 │ (Browser FE) │
  └──────┬───────┘                 └───────┬────────┘                 └──────┬───────┘
         │                                 │                                 │
         │  Connect (Room/MeetingID)       │                                 │
         ├────────────────────────────────►│                                 │
         │                                 │◄────────────────────────────────┤
         │                                 │   Connect (Room/MeetingID)      │
         │                                 │                                 │
         │◄───────── Sync Step 1 ──────────┤                                 │
         │          (State Vector)         │                                 │
         │                                 ├────────── Sync Step 1 ─────────►│
         │                                 │          (State Vector)         │
         │────────── Sync Step 2 ─────────►│                                 │
         │          (Missing Ops)          │◄───────── Sync Step 2 ──────────┤
         │                                 │          (Missing Ops)          │
         │                                 │                                 │
         │                                 │── Sync Step 2 (Relay to B) ────►│
         │◄───────── Sync Step 2 ──────────│                                 │
         │         (Relay to A)            │                                 │
```

Khi sử dụng `y-websocket`, trạng thái của tài liệu `Y.Doc` ở phía client được đồng bộ tự động với server và phân phối đến các client khác có chung mã phòng (`room name` / `meetingId`).

---

## 2. Cách thức hoạt động của WebSocket trong y-websocket

### 2.1 Định dạng URL kết nối
Client thiết lập kết nối WebSocket tới Server bằng cách định nghĩa địa chỉ URL dạng:
```
ws[s]://<host>[:port]/<room-name>[?query-parameters]
```
Trong **TranscriptHub**:
*   `<room-name>` chính là `meetingId` (VD: `6aeb0839-...`). Server dùng segment này để phân tách các phòng họp (hoặc tài liệu) khác nhau.
*   `query-parameters`: Chứa tham số để xác thực người dùng, phổ biến là `token` (JWT).
    *   *Ví dụ URL thực tế*: `ws://localhost:3008/6aeb0839-xxxx-xxxx-xxxx-xxxxxxxxxxxx?token=eyJhbGciOi...`

### 2.2 Đóng gói dữ liệu (Framing & Binary Communication)
`y-websocket` sử dụng kết nối **WebSocket Binary** (không gửi văn bản JSON thông thường) nhằm tối ưu hóa băng thông.
*   Mỗi gói tin gửi đi hay nhận về đều là một mảng byte (`Uint8Array`).
*   Dữ liệu được mã hóa bằng thư viện `lib0` của tác giả Y.js.
*   Byte đầu tiên của frame xác định loại giao thức (Message Type):
    *   `0 (messageSync)`: Đồng bộ hóa nội dung tài liệu.
    *   `1 (messageAwareness)`: Đồng bộ trạng thái tạm thời (vị trí con trỏ, người dùng online).
    *   `2 (messageAuth)`: Xác thực (ít dùng vì thường xác thực qua Query Params lúc handshake).
    *   `3 (messageQueryAwareness)`: Yêu cầu server gửi lại toàn bộ trạng thái Awareness.

---

## 3. Hướng dẫn sử dụng ở Front-End (FE)

### Bước 1: Cài đặt thư viện
```bash
npm install yjs y-websocket
```

### Bước 2: Tạo Y.Doc và Khởi tạo WebsocketProvider
```typescript
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// 1. Khởi tạo tài liệu YJS cục bộ
const doc = new Y.Doc();

// 2. Khởi tạo WebsocketProvider kết nối tới server
const serverUrl = 'ws://localhost:3008';
const roomName = 'meeting-123';

const provider = new WebsocketProvider(serverUrl, roomName, doc, {
  connect: true, // Tự động kết nối ngay lập tức
  params: {
    token: 'USER_JWT_TOKEN' // Gửi kèm token xác thực
  }
});
```

---

## 4. Chi tiết các tham số cấu hình (Constructor Options)

Khi khởi tạo `new WebsocketProvider(url, roomname, doc, options)`, đối tượng `options` có thể bao gồm các thuộc tính sau:

| Thuộc tính | Kiểu dữ liệu | Mặc định | Giải thích chi tiết |
| :--- | :--- | :--- | :--- |
| **`connect`** | `boolean` | `true` | Nếu `true`, client sẽ thiết lập kết nối WebSocket ngay lập tức. Nếu `false`, bạn cần gọi `provider.connect()` thủ công sau đó. |
| **`params`** | `Record<string, string>` | `{}` | Các cặp key-value được mã hóa thành Query Parameters đính kèm vào URL kết nối. Thường dùng để truyền `token`, `userId` hoặc `clientId`. |
| **`awareness`** | `Awareness` | `new Awareness(doc)` | Đối tượng quản lý hiện diện (Presence). Mặc định tự sinh, nhưng bạn có thể truyền vào một thực thể `Awareness` dùng chung. |
| **`maxBackoffTime`** | `number` | `2500` (ms) | Thời gian chờ tối đa giữa các lần thử kết nối lại khi bị mất kết nối (Auto Reconnect). Thời gian này tăng theo hàm mũ (exponential backoff). |
| **`resyncInterval`** | `number` | `-1` | Khoảng thời gian tự động yêu cầu đồng bộ lại toàn bộ tài liệu (gửi Sync Step 1). Giá trị `< 0` nghĩa là tắt tự động resync (khuyên dùng). |
| **`WebSocketPolyfill`** | `any` | `null` | Cung cấp thư viện WebSocket thay thế nếu chạy trong môi trường Node.js (không có sẵn biến toàn cục `WebSocket`). |

---

## 5. Chi tiết các phương thức của WebsocketProvider

### `provider.connect()`
*   **Mục đích**: Thiết lập lại kết nối WebSocket đến server nếu đang ở trạng thái ngắt kết nối.
*   **Hành vi**: Tự động dọn dẹp các tiến trình thử kết nối lại hiện có và bắt đầu một tiến trình kết nối mới.

### `provider.disconnect()`
*   **Mục đích**: Chủ động ngắt kết nối WebSocket hiện tại.
*   **Hành vi**: Gửi tín hiệu ngắt kết nối, chuyển cờ `shouldConnect` về `false` (ngăn cản việc tự động kết nối lại) và dọn dẹp các timer liên quan.

### `provider.destroy()`
*   **Mục đích**: Hủy hoàn toàn instance của `WebsocketProvider` để tránh rò rỉ bộ nhớ.
*   **Hành vi**:
    1.  Chủ động ngắt kết nối WebSocket (`disconnect()`).
    2.  Hủy đăng ký (unsubscribe) tất cả các sự kiện lắng nghe trên `doc` (`Y.Doc`) và `awareness`.
    3.  Giải phóng các Event Listeners nội bộ.
    4.  *Khuyến nghị*: Luôn gọi phương thức này trong hàm cleanup của `useEffect` (React) khi component bị unmount.

---

## 6. Chi tiết các sự kiện (Events)

`WebsocketProvider` kế thừa từ `Observable` trong `lib0`, do đó bạn có thể lắng nghe các sự kiện bằng cú pháp `provider.on(eventName, callback)`.

### 6.1 Sự kiện `status`
Fired khi trạng thái kết nối mạng của WebSocket thay đổi.
*   **Tham số truyền vào**: `{ status: 'connecting' | 'connected' | 'disconnected' }`
*   **Cách sử dụng**:
    ```javascript
    provider.on('status', (event) => {
      console.log('Trạng thái kết nối:', event.status);
      // 'connecting': Đang thử kết nối
      // 'connected': Đã kết nối thành công và sẵn sàng đồng bộ
      // 'disconnected': Bị mất kết nối hoặc chủ động ngắt kết nối
    });
    ```

### 6.2 Sự kiện `sync`
Fired khi quá trình đồng bộ hóa dữ liệu ban đầu hoàn tất (sau khi trao đổi Sync Step 1 & 2 thành công).
*   **Tham số truyền vào**: `isSynced: boolean`
*   **Ý nghĩa**:
    *   Khi `isSynced === true`, dữ liệu cục bộ (`Y.Doc` trên client) đã đồng nhất với máy chủ tại thời điểm đó.
    *   Đây là thời điểm an toàn nhất để thực hiện các thao tác khởi tạo dữ liệu mặc định (seed dữ liệu) nếu tài liệu đang trống, tránh trùng lặp bản ghi.
*   **Cách sử dụng**:
    ```javascript
    provider.on('sync', (isSynced) => {
      if (isSynced) {
        console.log('Đã đồng bộ hóa dữ liệu thành công với server!');
      }
    });
    ```

### 6.3 Sự kiện `connection-close`
Fired khi kết nối socket bị đóng (hoặc do lỗi mạng, hoặc do server ngắt kết nối).
*   **Tham số truyền vào**: `event: CloseEvent` (chứa code và reason đóng kết nối).

### 6.4 Sự kiện `connection-error`
Fired khi xảy ra lỗi trong quá trình kết nối WebSocket.
*   **Tham số truyền vào**: `event: Event`.

---

## 7. Awareness API — Quản lý trạng thái con trỏ và hiện diện

Đối tượng `provider.awareness` (thuộc lớp `Awareness` từ `y-protocols/awareness`) dùng để truyền phát các dữ liệu tạm thời (ephemeral data) như vị trí con trỏ chuột, lựa chọn văn bản, tên người dùng, màu đại diện.

Dữ liệu này **không lưu vào lịch sử CRDT** của Y.Doc và tự động bị xóa bỏ khi kết nối bị ngắt.

### 7.1 Gán trạng thái cục bộ (`setLocalState`)
Gửi trạng thái của client hiện tại lên server để phát đi toàn hệ thống.
```typescript
provider.awareness.setLocalState({
  user: {
    id: 'user-99',
    name: 'Nguyễn Văn A',
    color: '#FF5733'
  },
  cursor: { line: 12, ch: 5 } // Vị trí con trỏ trong editor
});
```
*   *Lưu ý*: Gọi `setLocalState(null)` khi muốn đánh dấu user đã rời đi (offline) trước khi disconnect.

### 7.2 Gán một thuộc tính cụ thể (`setLocalStateField`)
Chỉ cập nhật hoặc thêm một thuộc tính đơn lẻ trong state thay vì override toàn bộ object.
```typescript
provider.awareness.setLocalStateField('cursor', { line: 14, ch: 0 });
```

### 7.3 Đọc dữ liệu từ các clients khác (`getStates`)
Trả về một `Map` chứa tất cả các clients đang hoạt động.
```typescript
const allStates = provider.awareness.getStates();
// Map(clientId => { user: {...}, cursor: {...} })

allStates.forEach((state, clientId) => {
  console.log(`Client ${clientId} đang ở vị trí:`, state.cursor);
});
```

### 7.4 Lắng nghe sự kiện thay đổi (`change`)
Kích hoạt bất cứ khi nào có client trực tuyến mới (`added`), cập nhật vị trí/trạng thái (`updated`), hoặc ngắt kết nối (`removed`).
```typescript
provider.awareness.on('change', ({ added, updated, removed }) => {
  // added: Mảng các clientIds mới tham gia
  // updated: Mảng các clientIds thay đổi trạng thái
  // removed: Mảng các clientIds vừa rời đi (offline)
  
  console.log('Có thay đổi về danh sách online!');
});
```

---

## 8. Tích hợp thực tế trong TranscriptHub

Dưới đây là cách `y-websocket` được triển khai tại file client hook [use-collab.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/hooks/use-collab.ts):

### 8.1 Khởi tạo kết nối với Xác thực JWT

```typescript
const connect = async () => {
  if (provider || instance._connectDone) return;

  const session = await getSession();
  const token = session?.accessToken;
  if (!token) {
    console.warn("[Collab] Không có access token — chế độ chỉ đọc");
    return;
  }

  // 1. Thiết lập WebsocketProvider
  provider = new WebsocketProvider(WS_URL, meetingId, doc, {
    params: { token }, // Đính kèm JWT token vào query params
    connect: true,     // Bắt đầu kết nối ngay
  });

  // 2. Thiết lập Awareness Presence
  const userInfo: CollabUser = {
    id: session.user?.id ?? "",
    name: session.user?.name ?? session.user?.email ?? "Unknown",
    email: session.user?.email ?? "",
    color: pickColor(session.user?.id ?? session.user?.email ?? meetingId),
  };
  provider.awareness.setLocalState({ user: userInfo });

  // 3. Lắng nghe thay đổi presence để cập nhật UI
  provider.awareness.on("change", () => notifySubscribers());
  
  // ...
};
```

### 8.2 An toàn Seed dữ liệu qua sự kiện `sync`

Để tránh việc hai client cùng khởi tạo các segments trùng lặp khi phòng mới được tạo (dẫn đến duplicate key hoặc nhân đôi dữ liệu), TranscriptHub chờ sự kiện `sync` được kích hoạt hoàn tất:

```typescript
provider.on("sync", (isSynced: boolean) => {
  // Chỉ seed dữ liệu ban đầu khi:
  // - sync hoàn tất với server (isSynced === true)
  // - ySegmentsArray hiện tại rỗng hoàn toàn (server chưa có data)
  if (isSynced && instance._pendingSeeds && ySegmentsArray.length === 0) {
    const seeds = instance._pendingSeeds;
    instance._pendingSeeds = null;
    
    doc.transact(() => {
      seeds.forEach((s) => {
        const meta = new Y.Map<any>();
        meta.set("id", s.id);
        meta.set("startTime", s.startTime);
        meta.set("endTime", s.endTime);
        meta.set("speaker", s.speaker);
        ySegmentsArray.push([meta]);
        
        const yText = doc.getText(`content-${s.id}`);
        if (yText.length === 0) yText.insert(0, s.content ?? "");
      });
    });
  }
  notifySubscribers();
});
```

### 8.3 Ngắt kết nối và Dọn dẹp Tài nguyên (Cleanup)

Khi trang chỉnh sửa bị unmount hoặc người dùng thoát, hàm `disconnect` được gọi để dọn dẹp tài nguyên triệt để:

```typescript
const disconnect = () => {
  if (!provider) return;
  
  // 1. Báo cáo rời đi bằng cách set local state về null
  try { 
    provider.awareness.setLocalState(null); 
  } catch (_) {}
  
  // 2. Ngắt kết nối WebSocket
  provider.disconnect();
  
  // 3. Giải phóng bộ nhớ, hủy toàn bộ event listeners của provider
  provider.destroy();
  
  provider = null;
  instance.provider = null;
  instance._connectDone = false;
};
```

---

## 9. Các lưu ý quan trọng và Best Practices

### 9.1 Cơ chế Auto-Reconnect & Exponential Backoff
`y-websocket` tích hợp sẵn khả năng kết nối lại tự động khi mất mạng. Tuy nhiên, thời gian thử lại sẽ tăng dần (lần 1 sau 100ms, lần 2 sau 200ms, lần 3 sau 400ms... lên đến tối đa `maxBackoffTime`).
> [!TIP]
> Nếu bạn muốn kết nối lại ngay lập tức khi phát hiện có mạng trở lại (ví dụ qua sự kiện `window.addEventListener('online', ...)`), bạn có thể gọi thủ công `provider.connect()`.

### 9.2 Tránh rò rỉ bộ nhớ (Memory Leak)
Mỗi khi bạn tạo một thực thể `new WebsocketProvider`, nó sẽ đăng ký các hàm lắng nghe sự kiện trên `doc` (`Y.Doc`).
Nếu bạn khởi tạo lại provider trong React component (do re-render) mà không gọi `.destroy()` ở hàm cleanup của useEffect cũ, các listeners cũ vẫn tồn tại trong RAM.
> [!IMPORTANT]
> Luôn luôn gọi `provider.destroy()` trong hàm dọn dẹp (cleanup) của React `useEffect`.

### 9.3 Xử lý Token hết hạn (Expired Access Token)
Nếu token đính kèm trong query parameters bị hết hạn, server sẽ ngắt kết nối WebSocket của bạn.
Khi đó, cơ chế tự động kết nối lại (`auto-reconnect`) của `y-websocket` sẽ liên tục thử gửi lại yêu cầu kết nối với **cùng một token đã hết hạn** đó, dẫn đến vòng lặp lỗi vô tận.
*   **Giải pháp tốt nhất**: 
    1.  Lắng nghe lỗi kết nối hoặc mã đóng kết nối cụ thể (ví dụ: `4001 Unauthorized`).
    2.  Gọi `provider.disconnect()` để dừng việc tự động reconnect.
    3.  Lấy accessToken mới thông qua hàm refresh token.
    4.  Cập nhật lại URL kết nối hoặc khởi tạo lại `WebsocketProvider` với token mới.
