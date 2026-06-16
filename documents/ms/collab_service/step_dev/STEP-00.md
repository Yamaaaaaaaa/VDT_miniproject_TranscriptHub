# STEP-00: Chuẩn Bị Môi Trường

## Mục Tiêu

Chuẩn bị môi trường và cài đặt các dependencies cần thiết cho Collab Service.

## Dependencies

**Không có** - Step này là bước đầu tiên.

## Checklist

- [ ] Kiểm tra Node.js version (>= 18)
- [ ] Cài đặt Redis (hoặc xác nhận đang chạy)
- [ ] Cài đặt các packages cần thiết
- [ ] Cấu hình environment variables

---

## 1. Kiểm Tra Node.js Version

```bash
node --version
# Phải >= 18.x.x
```

## 2. Kiểm Tra Redis

```bash
# Kiểm tra Redis đang chạy
redis-cli ping
# Response: PONG

# Nếu chưa có, cài đặt Redis:
# Windows: https://github.com/tporadowski/redis/releases
# Docker: docker run -d -p 6379:6379 redis:alpine
```

## 3. Cài Đặt Packages

Thêm các packages sau vào `services_ms/package.json`:

```bash
cd services_ms
npm install yjs y-websocket
```

**Packages cần thêm vào `package.json`:**

```json
"dependencies": {
  // ... existing dependencies ...
  "yjs": "^13.6.0",
  "y-websocket": "^2.1.0",
  "lib0": "^0.2.99"
}
```

## 4. Cấu Hình Environment Variables

Thêm vào `services_ms/.env`:

```env
# Collab Service
COLLAB_SERVICE_PORT=3007
COLLAB_SERVICE_HOST=localhost

# y-websocket Server
WS_PORT=3008
COLLAB_SERVICE_URL=tcp://localhost:3007

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## Làm Sao Để Test?

### Test 1: Kiểm tra packages đã cài đặt

```bash
cd services_ms
npm list yjs y-websocket lib0
```

**Expected Output:**
```
├── yjs@13.x.x
├── y-websocket@2.x.x
└── lib0@0.x.x
```

### Test 2: Kiểm tra Redis connection

```bash
redis-cli ping
```

**Expected Output:**
```
PONG
```

---

## Output Sau Step Này

Sau khi hoàn thành STEP-00:

1. ✅ Packages `yjs`, `y-websocket`, `lib0` đã được cài đặt
2. ✅ Redis đang chạy và accessible
3. ✅ Environment variables đã được cấu hình

---

## Tiếp Theo

👉 **[STEP-01: Database Schema](./STEP-01.md)** - Tạo bảng `transcript_versions`
