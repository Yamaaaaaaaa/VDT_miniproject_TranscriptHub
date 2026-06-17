# Demo Yjs - Transcript Segments Collaboration

Demo collaborative editing với **Y.Array + Y.Map** cho transcript có nhiều segments.

## Cấu trúc

```
demoYjs/
├── backend/              # WebSocket server (y-websocket)
├── frontend/             # Vite + Vanilla JS demo
└── frontend-react/       # Vite + React demo (Quill editor)
```

## Cách chạy

### 1. Backend (Terminal 1)

```bash
cd demoYjs/backend
npm install
npm start
```

Server sẽ chạy ở `ws://localhost:1234`

---

### 2. Frontend React (Khuyến nghị)

```bash
cd demoYjs/frontend-react
npm install
npm run dev
```

Mở `http://localhost:5173` (hoặc port khác nếu 5173 đang bận)

---

### 3. Frontend Vanilla (Optional)

```bash
cd demoYjs/frontend
npm install
npm run dev
```

Mở `http://localhost:3000`

---

## Test Collaboration

1. Mở frontend (React hoặc Vanilla) trên **2 tab/trình duyệt** khác nhau
2. Nhấn "Tham gia" ở cả 2 tab (cùng Room ID)
3. Thử:
   - Sửa text trong segment → thấy sync realtime ở tab còn lại
   - Xóa segment → biến mất ở tab còn lại
   - Thêm segment → xuất hiện ở tab còn lại
4. Mở thêm tab thứ 3 → thấy user mới xuất hiện trong danh sách online

## Tính năng

| Tính năng | Mô tả |
|-----------|-------|
| **Y.Array** | Lưu trữ danh sách segments |
| **Y.Map** | Mỗi segment là 1 Y.Map với {id, speaker, text, startTime, endTime} |
| **Y.Text** | Mỗi segment có Y.Text riêng cho collaborative text editing |
| **Awareness** | Hiển thị ai đang online, ai đang sửa segment nào |
| **IndexedDB** | Offline persistence - dữ liệu vẫn lưu khi offline |
| **WebSocket Sync** | Real-time collaboration giữa các clients |

## Architecture

```
Y.Doc
├── segments: Y.Array<Y.Map>
│     ├── Y.Map { id, speaker, text, startTime, endTime }
│     ├── Y.Map { id, speaker, text, startTime, endTime }
│     └── ...
└── segment-text:<id>: Y.Text (mỗi segment có Y.Text riêng)
```

## Endpoint WebSocket

```
ws://localhost:1234/<room-id>
```

## Frontend React - Cấu trúc code

```
frontend-react/src/
├── App.jsx              # Main app, Yjs initialization
└── components/
    ├── QuillEditor.jsx  # Quill + Y.Text binding
    └── SegmentCard.jsx  # Card hiển thị segment
```
