# Demo Yjs - Transcript Segments Collaboration

Demo collaborative editing với **Y.Array + Y.Map** cho transcript có nhiều segments.

## Cấu trúc

```
demoYjs/
├── backend/           # WebSocket server (y-websocket)
└── frontend/          # Vite + Vanilla JS demo
```

## Cách chạy

### 1. Backend (Terminal 1)

```bash
cd demoYjs/backend
npm install
npm start
```

### 2. Frontend (Terminal 2)

```bash
cd demoYjs/frontend
npm install
npm run dev
```

### 3. Test

1. Mở `http://localhost:3000` trên 2 tab/trình duyệt khác nhau
2. Nhấn "Tham gia" ở cả 2 tab
3. Thử sửa/xóa/thêm segment ở 1 tab → thấy sync ở tab còn lại

## Tính năng

- **Y.Array**: Lưu trữ danh sách segments
- **Y.Map**: Mỗi segment là 1 Y.Map với {id, speaker, text, startTime, endTime}
- **Awareness**: Hiển thị ai đang online, ai đang sửa segment nào
- **IndexedDB**: Offline persistence
- **WebSocket Sync**: Real-time collaboration

## Architecture

```
Y.Doc
  └── segments: Y.Array<Y.Map>
        ├── Y.Map { id, speaker, text, startTime, endTime }
        ├── Y.Map { id, speaker, text, startTime, endTime }
        └── ...
```

## Endpoint WebSocket

```
ws://localhost:1234/<room-id>
```
