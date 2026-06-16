# Collab Service - Các Bước Triển Khai

## Tổng Quan

Tài liệu này chia nhỏ kiến trúc Collab Service (Collaborative Editing) thành các bước có thể triển khai và **test độc lập** từng bước.

## Mục Tiêu

- Mỗi step có thể **implement + test riêng biệt**
- Sau mỗi step, user có thể **verify kết quả**
- Các steps có **dependency rõ ràng**

## Cấu Trúc

```
documents/ms/collab_service/step_dev/
├── README.md                    # Tổng quan (file này)
├── STEP-00.md                   # Chuẩn bị & Prerequisites
├── STEP-01.md                   # Database Schema
├── STEP-02.md                   # Collab Service (TCP RPC Server)
├── STEP-03.md                   # Meeting Client (TCP RPC Client)
├── STEP-04.md                   # y-websocket Server
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
STEP-02 (Collab Service - TCP RPC Server)
        ↓
STEP-03 (Meeting Client - TCP RPC Client)
        ↓
STEP-04 (y-websocket Server)
        ↓
STEP-05 (Frontend Integration)
        ↓
STEP-06 (Docker & Deployment)
```

## Danh Sách Steps Chi Tiết

### [STEP-00](./STEP-00.md) - Chuẩn Bị Môi Trường
- Kiểm tra dependencies đã có
- Cài đặt thư viện cần thiết (yjs, y-websocket)
- Cấu hình Redis connection

### [STEP-01](./STEP-01.md) - Database Schema
- Tạo bảng `transcript_versions`
- Migration database
- Seed data test

### [STEP-02](./STEP-02.md) - Collab Service (TCP RPC Server)
- Tạo app `collab`
- Implement TCP RPC handlers
- Test TCP RPC commands

### [STEP-03](./STEP-03.md) - Meeting Client (TCP RPC Client)
- Implement TCP RPC client to Meeting Service
- Test `get-audioFileId` command

### [STEP-04](./STEP-04.md) - y-websocket Server
- Tạo app `collab-ws`
- Implement JWT auth middleware
- Implement room & CRDT sync
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
STEP-04: STEP-00, STEP-02, STEP-03 ✓
STEP-05: STEP-00, STEP-02, STEP-03, STEP-04 ✓
STEP-06: Tất cả ✓
```

## Liên Kết Tham Khảo

- [Architecture Document](../idea/architecture.md)
- [Snapshot Strategy](../save_snapshot_stragegy/README.md)
