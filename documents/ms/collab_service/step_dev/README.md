# Collab Service - Các Bước Triển Khai

## Tổng Quan

Tài liệu này chia nhỏ kiến trúc Collab Service (Collaborative Editing) thành các bước có thể triển khai và **test độc lập** từng bước.

## Mục Tiêu

- Mỗi step có thể **implement + test riêng biệt**
- Sau mỗi step, user có thể **verify kết quả**
- Các steps có **dependency rõ ràng**
- Đơn giản hóa kiến trúc: **Standalone Node.js WebSocket** thay vì NestJS + y-protocols

## Cấu Trúc

```
documents/ms/collab_service/step_dev/
├── README.md                    # Tổng quan (file này)
├── STEP-00.md                   # Chuẩn bị & Prerequisites
├── STEP-01.md                   # Database Schema
├── STEP-02.md                   # Collab Service (HTTP API)
├── STEP-03.md                   # Meeting Client
├── STEP-04.md                   # Collab Gateway (Standalone Node.js WS)
├── STEP-05.md                   # Frontend Integration
├── STEP-06.md                   # Docker & Deployment
└── TESTING.md                   # Hướng dẫn test toàn bộ
```

## Luồng Triển Khai

```
STEP-00 (Prerequisites)
        ↓
STEP-01 (Database Schema)
        ↓
STEP-02 (Collab Service - HTTP API)
        ↓
STEP-03 (Meeting Client)
        ↓
STEP-04 (Collab Gateway - Standalone Node.js)
        ↓
STEP-05 (Frontend Integration)
        ↓
STEP-06 (Docker & Deployment)
```

## Danh Sách Steps Chi Tiết

### [STEP-00](./STEP-00.md) - Chuẩn Bị Môi Trường
- Kiểm tra dependencies đã có
- Cài đặt thư viện cần thiết (yjs, y-websocket, ws, ioredis)
- Cấu hình Redis connection

### [STEP-01](./STEP-01.md) - Database Schema
- Tạo bảng `transcript_versions`
- Migration database
- Seed data test

### [STEP-02](./STEP-02.md) - Collab Service (HTTP API)
- Tạo app `collab` với HTTP endpoints
- Implement snapshot management
- Test HTTP API endpoints

### [STEP-03](./STEP-03.md) - Meeting Client
- Implement HTTP client to Meeting Service
- Test `get-audioFileId` command

### [STEP-04](./STEP-04.md) - Collab Gateway (Standalone Node.js)
- **THAY ĐỔI:** Tạo app `collab-gateway` với **standalone Node.js** thay vì NestJS
- Sử dụng `ws` library cho WebSocket server
- Sử dụng `y-websocket/bin/utils` cho CRDT sync
- Implement JWT auth middleware (HTTP call to Identity Service)
- Implement Redis cache cho role caching
- Test WebSocket connection

### [STEP-05](./STEP-05.md) - Frontend Integration
- Tạo `CollaborativeEditor` component
- Implement Yjs client wrapper
- Test real-time collaboration

### [STEP-06](./STEP-06.md) - Docker & Deployment
- Cập nhật Docker configuration
- Cập nhật Nginx routing
- Integration test toàn bộ

## Hướng Dẫn Sử Dụng

### Bắt Đầu từ Step Nào?

Nếu bạn **mới bắt đầu**, hãy đọc và implement theo thứ tự:
1. STEP-00 → STEP-01 → STEP-02 → STEP-03 → STEP-04 → STEP-05 → STEP-06

Nếu bạn **muốn test nhanh một phần**, hãy kiểm tra dependencies trong mỗi step file.

### Sau Mỗi Step

Mỗi step file có phần **"Làm sao để test?"** với các commands cụ thể:
- Test bằng script
- Test bằng API call
- Test bằng manual verification

## Dependencies Summary

```
STEP-00: Không có dependencies
STEP-01: STEP-00 ✓
STEP-02: STEP-00, STEP-01 ✓
STEP-03: STEP-00, STEP-02 ✓
STEP-04: STEP-00, STEP-02 ✓  (standalone, no STEP-03 dependency)
STEP-05: STEP-00, STEP-02, STEP-03, STEP-04 ✓
STEP-06: Tất cả ✓
```

## Thay Đổi Lớn: Standalone Node.js Thay Vì NestJS

### Tại Sao Thay Đổi?

1. **Đơn giản hóa:** Collab Gateway chỉ cần làm một việc: WebSocket server + CRDT sync
2. **Performance:** Không cần NestJS overhead cho một service đơn giản
3. **Dễ maintain:** Code ngắn hơn, ít boilerplate, dễ debug
4. **Tận dụng có sẵn:** `y-websocket/bin/utils` đã có đầy đủ CRDT sync logic

### So Sánh

| Aspect | NestJS (Cũ) | Standalone Node.js (Mới) |
|--------|-------------|--------------------------|
| **Code lines** | ~500+ | ~150-200 |
| **Dependencies** | @nestjs/websockets, y-protocols, socket.io | ws, y-websocket |
| **Debugging** | Khó hơn | Dễ hơn |
| **Performance** | Tốt | Rất tốt |

### Những Gì Vẫn Giữ Nguyên

- ✅ JWT Authentication (gọi Identity Service qua HTTP)
- ✅ Role-based Access (HOST/EDITOR/VIEWER)
- ✅ Redis Cache cho roles
- ✅ HTTP clients tới các services
- ✅ Multi-instance support qua Redis Pub/Sub

## Liên Kết Tham Khảo

- [Architecture Document](../idea/architecture.md)
- [Snapshot Strategy](../save_snapshot_stragegy/README.md)
- [Demo Yjs (Reference)](../../demoYjs/README.md)
