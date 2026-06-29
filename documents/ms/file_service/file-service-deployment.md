# 📁 File Service — Tài liệu Triển khai (Deployment Guide)

> **Phiên bản:** v1.0 · **Cập nhật lần cuối:** 2026-06-14  
> **Maintainer:** TranscriptHub Team

---

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Thành phần phụ thuộc](#2-thành-phần-phụ-thuộc)
3. [Biến môi trường (Environment Variables)](#3-biến-môi-trường-environment-variables)
4. [Triển khai với Docker Compose (Local / Dev)](#4-triển-khai-với-docker-compose-local--dev)
5. [Triển khai thủ công (Manual / Production)](#5-triển-khai-thủ-công-manual--production)
6. [Cấu trúc Database](#6-cấu-trúc-database)
7. [API Reference](#7-api-reference)
8. [Luồng upload file (Presigned URL Flow)](#8-luồng-upload-file-presigned-url-flow)
9. [Cấu hình MinIO](#9-cấu-hình-minio)
10. [Kiểm tra sức khỏe (Health Check)](#10-kiểm-tra-sức-khỏe-health-check)
11. [Troubleshooting thường gặp](#11-troubleshooting-thường-gặp)
12. [Ghi chú quan trọng cho Windows + Docker Desktop](#12-ghi-chú-quan-trọng-cho-windows--docker-desktop)

---

## 1. Tổng quan kiến trúc

File Service là một **NestJS Microservice** chạy song song hai giao thức:

| Giao thức | Cổng | Mục đích |
|-----------|------|----------|
| **HTTP**  | `3003` | REST API — nhận request từ API Gateway qua HTTP proxy |
| **TCP**   | `3004` | NestJS Microservice — giao tiếp nội bộ với các service khác |

```
                    ┌─────────────────────────────────────────┐
                    │             Docker Network              │
                    │                                         │
  Browser ──HTTP──► API Gateway :3000                        │
                    │    ├── HTTP Proxy ──► File Service :3003│
                    │    └── TCP Client ──► File Service :3004│
                    │                            │            │
                    │              ┌─────────────┤            │
                    │              │             │            │
                    │         PostgreSQL     MinIO :9000      │
                    │          :5432         (internal)       │
                    └─────────────────────────────────────────┘

  Browser ──PUT──► MinIO :9100 (port mapped ra host, cho presigned URL)
```

### Cách API Gateway tương tác với File Service

Tùy loại API:

| Loại API | Phương thức | Lý do |
|----------|------------|-------|
| Upload (multipart), Stream audio | **HTTP Proxy** | Cần streaming body / binary data, không truyền qua TCP được |
| CRUD metadata (get, list, update, delete) | **TCP Microservice** | Nhẹ, nhanh, không cần HTTP overhead |

---

## 2. Thành phần phụ thuộc

Trước khi deploy File Service, đảm bảo các thành phần sau đã hoạt động:

| Service | Vai trò | Port nội bộ |
|---------|---------|-------------|
| **PostgreSQL** | Lưu metadata file (`audio_files` table) | `5432` |
| **MinIO** | Object storage — lưu file nhị phân | `9000` (nội bộ), `9100` (host) |
| **API Gateway** | Reverse proxy, JWT guard | `3000` |

### Package chính của File Service

```json
{
  "@nestjs/core": "^10.x",
  "@nestjs/microservices": "^10.x",
  "@prisma/client": "^6.x",
  "minio": "^8.x",
  "music-metadata": "^10.x",
  "uuid": "^10.x"
}
```

---

## 3. Biến môi trường (Environment Variables)

### File Service (`apps/file`)

| Biến | Mô tả | Giá trị mặc định | Bắt buộc |
|------|-------|-------------------|----------|
| `DATABASE_URL` | Connection string PostgreSQL | — | ✅ |
| `FILE_SERVICE_PORT` | Cổng HTTP lắng nghe | `3003` | |
| `FILE_SERVICE_TCP_PORT` | Cổng TCP Microservice | `3004` | |
| `MINIO_ENDPOINT` | Hostname MinIO (nội bộ Docker) | `localhost` | ✅ |
| `MINIO_PORT` | Cổng MinIO nội bộ | `9000` | |
| `MINIO_ACCESS_KEY` | MinIO access key | `minioadmin` | ✅ |
| `MINIO_SECRET_KEY` | MinIO secret key | `minioadmin` | ✅ |
| `MINIO_BUCKET` | Tên bucket lưu file | `transcripthub-bucket` | |
| `MINIO_PUBLIC_ENDPOINT` | Hostname MinIO browser có thể truy cập | `localhost` | ✅ |
| `MINIO_PUBLIC_PORT` | Cổng MinIO phía host (browser PUT trực tiếp) | `9100` | ✅ |

> **Lưu ý quan trọng về `MINIO_ENDPOINT` vs `MINIO_PUBLIC_ENDPOINT`:**
> - `MINIO_ENDPOINT` = hostname nội bộ Docker network (ví dụ `minio`) — dùng cho server-to-server (putObject, getObject, statObject)
> - `MINIO_PUBLIC_ENDPOINT` = hostname mà browser truy cập được (ví dụ `localhost`) — dùng để sinh presigned URL

### MinIO Container

| Biến | Mô tả | Giá trị |
|------|-------|---------|
| `MINIO_ROOT_USER` | Tài khoản quản trị | `minioadmin` |
| `MINIO_ROOT_PASSWORD` | Mật khẩu quản trị | `minioadmin` |
| `MINIO_SERVER_URL` | URL public của MinIO (ảnh hưởng presigned URL verification) | `http://localhost:9100` |

### API Gateway (phần liên quan đến File Service)

| Biến | Mô tả | Giá trị |
|------|-------|---------|
| `FILE_SERVICE_HOST` | Hostname File Service trong Docker | `file-service` |
| `FILE_SERVICE_PORT` | Cổng HTTP File Service | `3003` |
| `FILE_SERVICE_TCP_PORT` | Cổng TCP File Service | `3004` |

---

## 4. Triển khai với Docker Compose (Local / Dev)

### 4.1 Khởi động toàn bộ stack

```bash
# Clone repo và vào thư mục
cd VDT_miniproject_TranscriptHub

# Khởi động tất cả services
docker compose up --build -d

# Xem logs file-service
docker logs -f transcripthub-file-service
```

### 4.2 Chỉ rebuild File Service

```bash
docker compose up --build -d file-service
```

### 4.3 Chỉ rebuild File Service + MinIO (khi thay đổi cấu hình MinIO)

```bash
docker compose up --build -d minio file-service
```

### 4.4 Cấu hình `docker-compose.yml` cho File Service

```yaml
file-service:
  build:
    context: ./services_ms
    dockerfile: apps/file/Dockerfile
    target: production
  container_name: transcripthub-file-service
  restart: always
  environment:
    DATABASE_URL: postgresql://postgres:postgres@postgres:5432/transcripthub
    FILE_SERVICE_PORT: 3003
    FILE_SERVICE_TCP_PORT: 3004
    # MinIO nội bộ (server-to-server)
    MINIO_ENDPOINT: minio
    MINIO_PORT: 9000
    MINIO_ACCESS_KEY: minioadmin
    MINIO_SECRET_KEY: minioadmin
    MINIO_BUCKET: transcripthub-bucket
    # MinIO public (browser có thể PUT trực tiếp qua presigned URL)
    MINIO_PUBLIC_ENDPOINT: localhost
    MINIO_PUBLIC_PORT: 9100
  ports:
    - "3003:3003"   # HTTP REST API
    - "3004:3004"   # TCP Microservice
  depends_on:
    postgres:
      condition: service_healthy
    minio:
      condition: service_healthy
    migrate:
      condition: service_completed_successfully
  networks:
    - transcripthub_net
```

### 4.5 Cấu hình MinIO trong `docker-compose.yml`

```yaml
minio:
  image: minio/minio:latest
  container_name: transcripthub-minio
  ports:
    - "9100:9000"   # ⚠️ Map sang 9100 để tránh xung đột với WSL2 trên Windows
    - "9101:9001"   # MinIO Console
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin
    MINIO_SERVER_URL: "http://localhost:9100"
  volumes:
    - minio_data:/data
  command: server /data --console-address ":9001"
```

> **⚠️ Lý do dùng port 9100 thay vì 9000:**  
> Trên Windows với Docker Desktop + WSL2, process `wslrelay.exe` chiếm `localhost:9000` (IPv6 loopback `[::1]:9000`). Khi browser connect đến `localhost:9000`, Windows ưu tiên IPv6 và hit `wslrelay.exe` thay vì MinIO → request bị drop (timeout). Đổi sang `9100` giải quyết hoàn toàn vấn đề này.

---

## 5. Triển khai thủ công (Manual / Production)

### 5.1 Build Docker image

```bash
cd services_ms

# Build image
docker build \
  -f apps/file/Dockerfile \
  --target production \
  -t transcripthub-file-service:latest \
  .
```

### 5.2 Chạy container

```bash
docker run -d \
  --name transcripthub-file-service \
  --network transcripthub_net \
  -p 3003:3003 \
  -p 3004:3004 \
  -e DATABASE_URL="postgresql://user:pass@db-host:5432/transcripthub" \
  -e FILE_SERVICE_PORT=3003 \
  -e FILE_SERVICE_TCP_PORT=3004 \
  -e MINIO_ENDPOINT="minio-internal-host" \
  -e MINIO_PORT=9000 \
  -e MINIO_ACCESS_KEY="your-access-key" \
  -e MINIO_SECRET_KEY="your-secret-key" \
  -e MINIO_BUCKET="transcripthub-bucket" \
  -e MINIO_PUBLIC_ENDPOINT="your-public-domain.com" \
  -e MINIO_PUBLIC_PORT=9000 \
  transcripthub-file-service:latest
```

### 5.3 Khởi tạo Database Schema

```bash
# Chạy migration schema (đã tích hợp sẵn trong docker-compose qua migrate service)
cd services_ms
npx prisma db push --url "postgresql://user:pass@db-host:5432/transcripthub"
```

### 5.4 Khởi tạo MinIO Bucket

```bash
# Dùng MinIO Client (mc)
mc alias set myminio http://your-minio-host:9000 accesskey secretkey
mc mb myminio/transcripthub-bucket
mc anonymous set public myminio/transcripthub-bucket
```

---

## 6. Cấu trúc Database

File Service sử dụng **schema `files`** trong PostgreSQL, độc lập với các schema khác (`identity`, `users`).

### Bảng `audio_files` (schema `files`)

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `id` | `UUID` (PK) | ID duy nhất của file |
| `file_name` | `VARCHAR` | Tên file hiển thị |
| `bucket_name` | `VARCHAR(100)` | Tên MinIO bucket |
| `object_key` | `VARCHAR(500)` | Đường dẫn đối tượng trong bucket: `{uploaderId}/{fileId}_{fileName}` |
| `file_size` | `BIGINT` | Kích thước file (bytes) |
| `mime_type` | `VARCHAR(100)` | MIME type: `audio/mpeg`, `audio/wav`, v.v. |
| `duration_seconds` | `INT` | Thời lượng âm thanh (giây), trích xuất bằng `music-metadata` |
| `status` | `VARCHAR(50)` | `UPLOADING` hoặc `READY` |
| `uploader_id` | `INT` | ID người dùng tải lên (khớp với `Account.id`) |
| `created_at` | `TIMESTAMP` | Thời điểm tạo bản ghi |

### Sơ đồ quan hệ

```
identity.accounts (id: INT)
         │
         └── files.audio_files (uploader_id → accounts.id)
                     │
                     └── [object_key] → MinIO bucket/path
```

---

## 7. API Reference

### Base URL (qua API Gateway)

```
http://localhost:3000/api/files
```

> Tất cả các endpoint yêu cầu xác thực JWT qua header `Authorization: Bearer <JWT_TOKEN>`. Riêng endpoint `stream` hỗ trợ xác thực qua cả query parameter `?token=<JWT_TOKEN>` và yêu cầu người dùng có quyền `manage_file` hoặc vai trò `ADMIN`.

---

### `POST /upload/init` — Khởi tạo upload (Presigned URL)

**Request Body:**
```json
{
  "fileName": "podcast.mp3",
  "fileSize": 10485760,
  "mimeType": "audio/mpeg"
}
```

**Response:**
```json
{
  "result": {
    "fileId": "uuid-v4",
    "presignedUrl": "http://localhost:9100/transcripthub-bucket/1/uuid_podcast.mp3?X-Amz-Algorithm=...",
    "chunkSize": 5242880
  }
}
```

**Lưu ý:** Bản ghi trong DB được tạo ngay với `status: UPLOADING`.

---

### `POST /upload/complete/:fileId` — Hoàn tất upload

Gọi sau khi đã PUT file lên MinIO thành công. Service sẽ:
1. `statObject` — xác minh file đã tồn tại trong MinIO
2. `getObject` → `music-metadata.parseStream` — trích xuất thời lượng âm thanh
3. Cập nhật DB: `status: READY`, `fileSize`, `durationSeconds`

**Response:**
```json
{
  "result": {
    "id": "uuid-v4",
    "fileName": "podcast.mp3",
    "status": "READY",
    "durationSeconds": 1842,
    "fileSize": "10485760",
    ...
  }
}
```

---

### `POST /upload` — Upload trực tiếp (Single-step)

Upload file nhỏ qua `multipart/form-data`. Toàn bộ file đi qua API Gateway → File Service → MinIO.

**Request:** `Content-Type: multipart/form-data`, field name: `file`

---

### `GET /stream/:fileId` — Stream audio

Yêu cầu xác thực JWT qua header `Authorization: Bearer <JWT_TOKEN>` hoặc query parameter `?token=<JWT_TOKEN>`. Người dùng phải có quyền `manage_file` hoặc vai trò `ADMIN`. Hỗ trợ **HTTP Range Requests** (tua đi/tua lại trên trình phát).

| Trường hợp | Response |
|-----------|---------|
| Không có Range header | `200 OK` + toàn bộ file |
| Có Range header | `206 Partial Content` + đoạn được yêu cầu |
| File chưa READY | `404 Not Found` |

---

### `GET /?page=0&size=10` — Danh sách file

Lấy danh sách file của người dùng hiện tại (dựa theo JWT token).

**Response:**
```json
{
  "result": {
    "content": [...],
    "totalElements": 42,
    "pageNumber": 0,
    "pageSize": 10,
    "totalPages": 5
  }
}
```

---

### `GET /:fileId` — Lấy metadata

### `PUT /:fileId` — Đổi tên file

**Body:** `{ "fileName": "tên-mới.mp3" }`

### `DELETE /:fileId` — Xóa file

Xóa cả object trên MinIO và bản ghi trong DB.

---

## 8. Luồng upload file (Presigned URL Flow)

Hệ thống sử dụng chiến lược **3-bước Presigned URL** để upload file lớn hiệu quả:

```
┌─────────────────────────────────────────────────────────────────┐
│  BƯỚC 1: Khởi tạo                                               │
│  Client ──POST /upload/init──► API Gateway ──Proxy──► File Svc  │
│                                                    │            │
│  File Svc tạo:                                     │            │
│    - fileId (UUID)                                 │            │
│    - objectKey = "{userId}/{fileId}_{fileName}"    │            │
│    - Bản ghi DB: status=UPLOADING                  │            │
│    - presignedUrl (SigV4, ký với localhost:9100)   │            │
│                                                    ▼            │
│  Response: { fileId, presignedUrl, chunkSize }                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  BƯỚC 2: Client PUT trực tiếp lên MinIO (bypass Backend)        │
│  Client ──PUT presignedUrl──► MinIO :9100                        │
│                                                                  │
│  Headers: Content-Type: audio/mpeg                              │
│  Body: binary file data                                          │
│  → MinIO xác minh chữ ký SigV4 → Lưu object                    │
│  → Response: 200 OK (empty body)                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  BƯỚC 3: Hoàn tất                                               │
│  Client ──POST /upload/complete/{fileId}──► File Svc            │
│                                                                  │
│  File Svc thực hiện:                                            │
│    1. statObject → xác minh file tồn tại trên MinIO            │
│    2. getObject → stream đến music-metadata                     │
│    3. Trích xuất durationSeconds                                 │
│    4. Cập nhật DB: status=READY, fileSize, duration             │
│  → Response: metadata đầy đủ                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Tại sao tự implement SigV4 thay vì dùng MinIO SDK?

MinIO Node.js SDK (`minioClient.presignedPutObject`) cần gọi `getBucketRegion()` — **một network request** — để biết region trước khi ký. Khi File Service chạy trong Docker container, `localhost:9100` không resolve được (đó là host machine, không phải container). 

**Giải pháp:** Implement SigV4 signing thủ công trong [`file.service.ts`](../../services_ms/apps/file/src/file.service.ts) bằng Node.js built-in `crypto` module — không cần kết nối mạng, ký URL với host `localhost:9100` ngay lập tức.

```typescript
// Không cần TCP, thuần crypto math
private generatePresignedPutUrl(objectKey: string, expiresInSeconds: number): string {
    // HMAC chain: secretKey → kDate → kRegion → kService → kSigning → signature
    // URL output: http://localhost:9100/bucket/key?X-Amz-Algorithm=...&X-Amz-Signature=...
}
```

---

## 9. Cấu hình MinIO

### Truy cập MinIO Console

```
http://localhost:9101
Username: minioadmin
Password: minioadmin
```

### Kiểm tra bucket đã tạo chưa

```bash
docker exec transcripthub-minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec transcripthub-minio mc ls local/transcripthub-bucket
```

### Xem object vừa upload

```bash
docker exec transcripthub-minio mc ls local/transcripthub-bucket/1/
```

### Cấu hình CORS cho MinIO (nếu cần)

Nếu browser báo lỗi CORS khi PUT presigned URL, thêm CORS policy:

```bash
docker exec transcripthub-minio mc anonymous set-json - local/transcripthub-bucket << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"AWS": ["*"]},
    "Action": ["s3:GetObject", "s3:PutObject"],
    "Resource": ["arn:aws:s3:::transcripthub-bucket/*"]
  }]
}
EOF
```

---

## 10. Kiểm tra sức khỏe (Health Check)

### 10.1 Kiểm tra File Service HTTP đang chạy

```bash
# Lấy danh sách file (cần user-id)
curl -H "x-user-id: 1" http://localhost:3003/api/v1/files
```

**Kết quả mong đợi:** JSON với `result.content`, `result.totalElements`

### 10.2 Kiểm tra presigned URL được tạo đúng

```bash
# PowerShell
$body = '{"fileName":"health.mp3","fileSize":4,"mimeType":"audio/mpeg"}'
$resp = Invoke-RestMethod -Uri "http://localhost:3003/api/v1/files/upload/init" `
  -Method POST -Headers @{"Content-Type"="application/json";"x-user-id"="1"} `
  -Body $body
$resp.result.presignedUrl | Select-String "localhost:9100"
```

**Kết quả mong đợi:** URL chứa `localhost:9100`

### 10.3 Test PUT lên MinIO

```bash
# PowerShell — test toàn bộ flow 3 bước
$body = '{"fileName":"test.mp3","fileSize":4,"mimeType":"audio/mpeg"}'
$init = Invoke-RestMethod -Uri "http://localhost:3003/api/v1/files/upload/init" `
  -Method POST -Headers @{"Content-Type"="application/json";"x-user-id"="1"} -Body $body
$url = $init.result.presignedUrl
$fileId = $init.result.fileId

# PUT lên MinIO
$req = [System.Net.HttpWebRequest]::Create($url)
$req.Method = "PUT"; $req.ContentType = "audio/mpeg"
$stream = $req.GetRequestStream()
$stream.Write([byte[]]@(255,251,144,0), 0, 4); $stream.Close()
$resp = $req.GetResponse()
Write-Host "PUT Status: $([int]([System.Net.HttpWebResponse]$resp).StatusCode)"  # Mong đợi: 200
$resp.Close()

# Complete
$complete = Invoke-RestMethod -Uri "http://localhost:3003/api/v1/files/upload/complete/$fileId" `
  -Method POST -Headers @{"x-user-id"="1"}
Write-Host "Status: $($complete.result.status)"  # Mong đợi: READY
```

### 10.4 Kiểm tra TCP Microservice

```bash
# Xem logs xem TCP đã start chưa
docker logs transcripthub-file-service | grep "TCP"
# Kết quả mong đợi: 🚀 File Microservice TCP listener is active on port: 3004
```

---

## 11. Troubleshooting thường gặp

### ❌ `Failed to initialize upload link` (HTTP 400)

**Nguyên nhân có thể:**
- `MINIO_ENDPOINT` sai (file-service không kết nối được tới MinIO nội bộ)
- Bucket chưa được tạo

**Kiểm tra:**
```bash
docker logs transcripthub-file-service | tail -20
# Tìm lỗi AggregateError hoặc ConnectionRefused
```

**Fix:**
```bash
# Đảm bảo MinIO đang chạy và healthy
docker ps | grep minio
docker exec transcripthub-minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec transcripthub-minio mc ls local/
```

---

### ❌ `403 Forbidden` khi PUT lên presigned URL

**Nguyên nhân:** Chữ ký SigV4 không khớp — presigned URL được ký với một host nhưng request gửi đến host khác.

**Kiểm tra:**
```bash
# Presigned URL có đúng host không?
$url = $init.result.presignedUrl
([System.Uri]$url).Host  # Phải là "localhost"
([System.Uri]$url).Port  # Phải là 9100
```

**Fix:** Kiểm tra các biến môi trường `MINIO_PUBLIC_ENDPOINT` và `MINIO_PUBLIC_PORT` trong `file-service`.

---

### ❌ Timeout khi PUT lên `localhost:9000`

**Nguyên nhân:** WSL2 `wslrelay.exe` đang chiếm `localhost:9000` (IPv6 loopback) trên Windows.

**Kiểm tra:**
```powershell
netstat -ano | findstr ":9000"
# Nếu thấy 2 process khác nhau listen port 9000 → xung đột WSL2
```

**Fix:** Đổi MinIO port mapping sang `9100:9000` trong `docker-compose.yml` và cập nhật `MINIO_PUBLIC_PORT=9100`.

---

### ❌ `Complete upload` thất bại — duration = 0

**Nguyên nhân có thể:**
- `music-metadata` không parse được stream do MIME type sai
- File quá nhỏ / không phải file audio thật

**Kiểm tra:**
```bash
docker logs transcripthub-file-service | grep "Failed to parse duration"
```

**Lưu ý:** Duration = 0 không block upload — file vẫn được mark `READY`.

---

### ❌ File Service không kết nối được PostgreSQL

**Kiểm tra:**
```bash
docker logs transcripthub-file-service | grep -i "prisma\|database\|error"
# Kiểm tra DATABASE_URL có đúng không
docker exec transcripthub-file-service env | grep DATABASE_URL
```

---

### ❌ TCP Microservice không nhận được message từ API Gateway

**Kiểm tra:**
```bash
# Xem port 3004 có đang listen không
netstat -ano | findstr ":3004"

# Xem logs API Gateway
docker logs transcripthub-api-gateway | grep -i "file\|error"
```

---

## 12. Ghi chú quan trọng cho Windows + Docker Desktop

### Port 9000 bị WSL2 chiếm

Đây là vấn đề phổ biến trên Windows 10/11 với Docker Desktop dùng WSL2 backend:

```
TCP    0.0.0.0:9000    LISTENING  → Docker MinIO (IPv4) ✓
TCP    [::1]:9000      LISTENING  → wslrelay.exe (IPv6 localhost) ✗
```

Khi Windows resolve `localhost`, nó ưu tiên IPv6 (`::1`) trước IPv4 (`0.0.0.0`), dẫn đến request đến `wslrelay.exe` thay vì MinIO.

**Giải pháp đã áp dụng:** Dùng port `9100` thay `9000` cho MinIO external mapping.

### Thứ tự khởi động

Docker Compose được cấu hình `depends_on` + `healthcheck` để đảm bảo:

```
postgres (healthy) → migrate (completed) → file-service (started)
minio   (healthy)  ↗
```

Không bao giờ khởi động `file-service` trước khi `postgres` và `minio` sẵn sàng.

### Rebuild sau khi thay đổi code

```bash
# Chỉ rebuild file-service (nhanh, dùng Docker cache)
docker compose up --build -d file-service

# Rebuild toàn bộ (khi thay đổi package.json hoặc Prisma schema)
docker compose up --build -d
```

---

## Phụ lục — Sơ đồ luồng TCP vs HTTP Proxy

```
                    API Gateway
                        │
         ┌──────────────┼──────────────────────┐
         │              │                      │
    HTTP Proxy      TCP Client              JWT Guard
    (doProxy)     (FilesService)               │
         │              │                      │
  ┌──────▼──┐   ┌───────▼───────┐             │
  │ upload  │   │ get_metadata  │             │
  │ init    │   │ update_meta   │             │
  │ complete│   │ delete_file   │             │
  │ stream  │   │ list_files    │             │
  └──────┬──┘   └───────┬───────┘             │
         │              │                      │
         └──────────────▼──────────────────────┘
                   File Service
                  HTTP :3003 + TCP :3004
                        │
              ┌──────────┴──────────┐
              │                     │
         PostgreSQL               MinIO
          (metadata)            (binary files)
```

---

*Tài liệu này được tạo tự động từ codebase — cập nhật khi có thay đổi kiến trúc.*
