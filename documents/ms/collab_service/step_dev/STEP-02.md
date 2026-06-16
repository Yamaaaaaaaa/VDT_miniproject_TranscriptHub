# STEP-02: Collab Service (TCP RPC Server)

## Mục Tiêu

Tạo Collab Service - một NestJS application chạy TCP RPC server, xử lý các commands liên quan đến transcript collaboration.

> **Lưu ý:** Collab Service là **TCP RPC Server** (internal service). Các HTTP API endpoints được expose qua **API Gateway** thông qua module `collab` trong `api-gateway`.

## Dependencies

- ✅ STEP-00 (Prerequisites)
- ✅ STEP-01 (Database Schema)

## Checklist

- [x] Tạo app `collab` trong monorepo
- [x] Cấu hình TCP Transport (main.ts)
- [x] Cấu hình environment validation (config/env.config.ts)
- [x] Setup Prisma (prisma/prisma.service.ts, prisma/prisma.module.ts)
- [x] Tạo MeetingGateway (TCP RPC Client tới Meeting Service)
- [x] Tạo CollabRepository (truy cập database)
- [x] Tạo CollabService (business logic)
- [x] Tạo CollabController (TCP RPC handlers)
- [x] Cấu hình module (collab.module.ts)
- [x] Update nest-cli.json và .env
- [x] Tạo CollabModule trong API Gateway (HTTP endpoints)

---

## 1. Cấu Trúc Thực Tế

### 1.1. Collab Service (TCP RPC Server)

```
services_ms/apps/collab/
├── src/
│   ├── main.ts                      # TCP Transport với validation & filters
│   ├── collab.module.ts            # Module với ClientsModule (TCP client)
│   ├── collab.controller.ts        # TCP RPC handlers
│   ├── collab.service.ts           # Business logic
│   ├── collab.repository.ts        # Database access
│   ├── config/
│   │   └── env.config.ts          # Environment validation
│   ├── gateways/
│   │   └── meeting.gateway.ts      # TCP RPC Client tới Meeting Service
│   └── prisma/
│       ├── prisma.service.ts       # PrismaService với adapter
│       └── prisma.module.ts
├── Dockerfile
├── nest-cli.json
└── tsconfig.app.json
```

### 1.2. Collab Module (API Gateway - HTTP)

```
services_ms/apps/api-gateway/src/collab/
├── collab.module.ts       # Import vào API Gateway
├── collab.controller.ts   # HTTP REST endpoints
├── collab.service.ts      # Gọi TCP RPC tới Collab Service
└── dto/
    └── collab.dto.ts      # Request/Response DTOs
```

---

## 2. Kiến Trúc Phân Tách

### 2.1. Sơ Đồ

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (Next.js)                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐    ┌──────────────────────────────┐  │
│  │   WebSocket      │    │        HTTP REST            │  │
│  │   (CRDT Sync)    │    │   (API Gateway :3000)      │  │
│  │                  │    │                              │  │
│  │  - Init Doc      │    │  - POST /v1/collab/save     │  │
│  │  - Real-time     │    │  - POST /v1/collab/snapshot │  │
│  │    Updates       │    │  - GET  /v1/collab/versions │  │
│  │  - Awareness     │    │  - POST /v1/collab/restore  │  │
│  └────────┬─────────┘    └──────────────┬───────────────┘  │
│           │                              │                  │
│           │                              │                  │
│           ▼                              ▼                  │
│  ┌───────────────┐              ┌────────────────┐          │
│  │ y-websocket   │              │ API Gateway    │          │
│  │   :3008       │              │    :3000      │          │
│  └───────┬───────┘              └───────┬────────┘          │
│          │ TCP RPC                       │ TCP RPC            │
│          ▼                              ▼                    │
│  ┌─────────────────────────────────────────────┐            │
│  │          Collab Service :3007              │            │
│  │              (TCP RPC Server)               │            │
│  └─────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

### 2.2. Nguyên Tắc

| Thành phần | Giao thức | Port | Trách nhiệm |
|------------|-----------|------|-------------|
| **y-websocket** | WebSocket + TCP RPC | `:3008` | CRDT sync, Auth, Awareness |
| **Collab Service** | TCP RPC Server | `:3007` | Snapshot management, Version history, Persistence |
| **API Gateway** | HTTP REST | `:3000` | Expose Collab HTTP APIs (save, snapshot, versions, restore) |

### 2.3. Phân Chia Trách Nhiệm

| Luồng | Trigger | Cần WebSocket? | Đi qua đâu |
|-------|---------|----------------|------------|
| **Init Document** | WS Connect | ✅ Yes | WebSocket → y-websocket → Collab Service |
| **Real-time Edit** | Typing | ✅ Yes | WebSocket (CRDT sync) |
| **Auto-save** | 5 ký tự | ❌ No | HTTP → API Gateway → Collab Service |
| **Create Snapshot** | Manual button | ❌ No | HTTP → API Gateway → Collab Service |
| **Get Versions** | View history | ❌ No | HTTP → API Gateway → Collab Service |
| **Restore Version** | Restore button | ❌ No | HTTP → API Gateway → Collab Service |

---

## 3. Các File Đã Tạo

### 3.1. Collab Service (TCP RPC)

### main.ts

TCP transport trên port 3007, sử dụng ValidationPipe và MicroserviceExceptionFilter.

### collab.module.ts

Module chính với:
- ConfigModule (global)
- PrismaModule (global)
- ClientsModule (TCP client tới Meeting Service)

### collab.controller.ts

TCP RPC handlers:
- `get-transcript`: Lấy transcript của meeting (cho y-websocket)
- `save-transcript`: Lưu transcript (cho y-websocket auto-save)
- `create-snapshot`: Tạo snapshot phiên bản
- `get-versions`: Lấy danh sách phiên bản
- `restore-version`: Khôi phục phiên bản

### collab.service.ts

Business logic xử lý các operations với transcript.

### collab.repository.ts

Database access layer sử dụng Prisma.

### meeting.gateway.ts

TCP RPC Client để gọi Meeting Service (lấy audioFileId).

### 3.2. API Gateway Module (HTTP REST)

### api-gateway/src/collab/collab.controller.ts

HTTP REST endpoints:
- `POST /v1/collab/transcript` - Save transcript
- `POST /v1/collab/snapshot` - Create snapshot
- `GET /v1/collab/:meetingId/versions` - Get versions
- `POST /v1/collab/restore` - Restore version

### api-gateway/src/collab/collab.service.ts

TCP RPC client gọi Collab Service.

---

## 4. TCP Commands (Internal)

| Pattern | Payload | Response | Called by |
|---------|---------|----------|-----------|
| `get-transcript` | `{ meetingId: string }` | `{ rawText, structuredContent }` | y-websocket |
| `save-transcript` | `{ meetingId, rawText, structuredContent }` | `{ success }` | y-websocket, API |
| `create-snapshot` | `{ meetingId, userId, versionName }` | `{ versionId, message }` | y-websocket, API |
| `get-versions` | `{ meetingId: string }` | `Array<Version>` | API Gateway |
| `restore-version` | `{ meetingId, versionId }` | `{ rawText, structuredContent }` | API Gateway |

---

## 5. HTTP Endpoints (External)

| Method | Endpoint | Mô tả |
|--------|----------|--------|
| POST | `/v1/collab/transcript` | Save transcript (auto-save/manual-save) |
| POST | `/v1/collab/snapshot` | Create snapshot |
| GET | `/v1/collab/:meetingId/versions` | Get all versions |
| POST | `/v1/collab/restore` | Restore to specific version |

---

## Làm Sao Để Test?

### Test 1: Build Collab Service

```bash
cd services_ms
npm run build -- --project=collab
```

### Test 2: Start Collab Service

```bash
cd services_ms
npm run start:dev -- --project=collab
```

**Expected:**
```
🚀 Collab Microservice is listening on TCP port 3007
📦 Prisma connected to PostgreSQL (Collab Service)
```

### Test 3: Build API Gateway

```bash
cd services_ms
npm run build -- --project=api-gateway
```

---

## Output Sau Step Này

Sau khi hoàn thành STEP-02:

1. ✅ App `collab` đã được tạo với cấu trúc matching codebase
2. ✅ TCP RPC server chạy trên port 3007
3. ✅ Các commands đã được implement
4. ✅ MeetingGateway đã được cấu hình
5. ✅ API Gateway có Collab module với HTTP endpoints

---

## Tiếp Theo

👉 **[STEP-03: Meeting Service TCP Endpoint](./STEP-03.md)** - Đã thêm command `get-audioFileId` vào Meeting Service
