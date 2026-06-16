# STEP-06: Docker & Deployment

## Mục Tiêu

Triển khai Collab Service và y-websocket lên Docker với Nginx routing.

## Dependencies

- ✅ STEP-00 (Prerequisites)
- ✅ STEP-01 (Database Schema)
- ✅ STEP-02 (Collab Service)
- ✅ STEP-03 (Meeting Service)
- ✅ STEP-04 (y-websocket Server)
- ✅ STEP-05 (Frontend Integration)

## Checklist

- [ ] Tạo Dockerfile cho collab service
- [ ] Tạo Dockerfile cho collab-ws
- [ ] Cập nhật docker-compose.yml
- [ ] Cập nhật Nginx configuration
- [ ] Test toàn bộ hệ thống

---

## 1. Collab Service Dockerfile

### 1.1. Tạo Dockerfile

```dockerfile
# services_ms/apps/collab/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY prisma/ ./prisma/
COPY libs/ ./libs/
COPY apps/collab/ ./apps/collab/

# Install dependencies
RUN npm ci

# Build
RUN npm run build -- --project=collab

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application
COPY --from=builder /app/apps/collab/dist ./apps/collab/dist
COPY --from=builder /app/apps/collab/src ./apps/collab/src

# Generate Prisma Client
RUN npx prisma generate --schema=apps/collab/src/prisma/schema.prisma

WORKDIR /app/apps/collab

EXPOSE 3007

CMD ["node", "dist/main.js"]
```

### 1.2. .dockerignore cho collab

```dockerfile
# services_ms/apps/collab/.dockerignore
node_modules
dist
npm-debug.log
.env
.git
.gitignore
README.md
test
*.spec.ts
```

---

## 2. y-websocket Dockerfile

### 2.1. Tạo Dockerfile

```dockerfile
# services_ms/apps/collab-ws/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY tsconfig*.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Clean source
RUN rm -rf src

EXPOSE 3008

CMD ["node", "dist/main.js"]
```

### 2.2. .dockerignore cho collab-ws

```dockerfile
# services_ms/apps/collab-ws/.dockerignore
node_modules
dist
npm-debug.log
.env
.git
.gitignore
README.md
test
*.spec.ts
```

---

## 3. Cập Nhật docker-compose.yml

### 3.1. Thêm services

Thêm vào `services_ms/docker-compose.yml`:

```yaml
services:
  # ... existing services ...

  collab-service:
    build:
      context: .
      dockerfile: apps/collab/Dockerfile
    container_name: transcripthub-collab-service
    ports:
      - "3007:3007"
    environment:
      - COLLAB_SERVICE_PORT=3007
      - DATABASE_URL=${DATABASE_URL}
      - MEETING_SERVICE_HOST=meeting-service
      - MEETING_SERVICE_TCP_PORT=3006
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - postgres
      - redis
      - meeting-service
    networks:
      - transcripthub-network
    restart: unless-stopped

  collab-ws:
    build:
      context: .
      dockerfile: apps/collab-ws/Dockerfile
    container_name: transcripthub-collab-ws
    ports:
      - "3008:3008"
    environment:
      - WS_PORT=3008
      - COLLAB_SERVICE_HOST=collab-service
      - COLLAB_SERVICE_PORT=3007
      - JWT_SECRET=${JWT_SECRET}
      - IDENTITY_SERVICE_URL=http://identity-service:3002
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - collab-service
      - redis
    networks:
      - transcripthub-network
    restart: unless-stopped
```

### 3.2. Cập nhật Nginx configuration

Thêm vào `services_ms/nginx/nginx.conf`:

```nginx
# WebSocket routing for Collab
location /ws/collab/ {
    proxy_pass http://collab-ws:3008/ws/collab/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
}

# Collab API routing (if needed via HTTP)
location /api/collab/ {
    proxy_pass http://collab-service:3007/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

---

## 4. Environment Variables

### 4.1. Thêm vào .env

```env
# Collab Service
COLLAB_SERVICE_PORT=3007
COLLAB_SERVICE_HOST=collab-service

# y-websocket Server
WS_PORT=3008

# Redis (shared)
REDIS_HOST=redis
REDIS_PORT=6379
```

---

## 5. Cập Nhật Network Configuration

### 5.1. Đảm bảo services trong cùng network

```yaml
# docker-compose.yml
networks:
  transcripthub-network:
    driver: bridge
    name: transcripthub-network
```

Mỗi service cần:

```yaml
services:
  collab-service:
    networks:
      - transcripthub-network
  collab-ws:
    networks:
      - transcripthub-network
```

---

## 6. Build & Deploy

### 6.1. Build images

```bash
cd services_ms

# Build collab service
docker build -f apps/collab/Dockerfile -t transcripthub-collab-service .

# Build collab-ws
docker build -f apps/collab-ws/Dockerfile -t transcripthub-collab-ws .
```

### 6.2. Run with docker-compose

```bash
cd services_ms
docker-compose up -d collab-service collab-ws nginx
```

### 6.3. Check logs

```bash
# Collab Service logs
docker logs transcripthub-collab-service -f

# y-websocket logs
docker logs transcripthub-collab-ws -f
```

---

## 7. Testing Toàn Bộ Hệ Thống

### 7.1. Kiểm tra services đang chạy

```bash
docker ps | grep -E "collab|transcripthub"
```

**Expected:**
```
transcripthub-collab-service   ... Up ... 0.0.0.0:3007->3007/tcp
transcripthub-collab-ws        ... Up ... 0.0.0.0:3008->3008/tcp
```

### 7.2. Kiểm tra WebSocket endpoint

```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://localhost:3008/ws/collab?meetingId=test&token=test
```

**Expected:** HTTP 101 Switching Protocols

### 7.3. Health check

```bash
# Collab Service TCP check
nc -zv localhost 3007

# y-websocket HTTP check (nếu có endpoint)
curl http://localhost:3008/health
```

---

## 8. Troubleshooting

### 8.1. Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Client cannot connect to WS | Nginx not configured | Check Nginx config for WS routing |
| Collab Service cannot reach Meeting | Wrong hostname | Check `MEETING_SERVICE_HOST` env |
| Redis connection failed | Redis not running | Ensure redis container is up |
| Build fails | Missing dependencies | Run `npm ci` before build |

### 8.2. Debug Commands

```bash
# Check container logs
docker logs <container-name> --tail=100

# Enter container shell
docker exec -it <container-name> sh

# Check network connectivity
docker exec <container-name> ping collab-service

# Check environment variables
docker exec <container-name> env | grep -E "PORT|HOST"
```

---

## Output Sau Step Này

Sau khi hoàn thành STEP-06:

1. ✅ Collab Service container được build và chạy
2. ✅ y-websocket container được build và chạy
3. ✅ Nginx routing cho WebSocket được cấu hình
4. ✅ Toàn bộ hệ thống hoạt động trong Docker

---

## Tổng Kết

Bạn đã hoàn thành tất cả 6 steps để triển khai Collab Service:

1. ✅ STEP-00: Chuẩn bị môi trường
2. ✅ STEP-01: Database Schema
3. ✅ STEP-02: Collab Service (TCP RPC Server)
4. ✅ STEP-03: Meeting Service TCP Endpoint
5. ✅ STEP-04: y-websocket Server
6. ✅ STEP-05: Frontend Integration
7. ✅ STEP-06: Docker & Deployment

Hệ thống collaborative editing đã sẵn sàng để sử dụng!

---

## Tham Khảo

- [Architecture Document](../idea/architecture.md)
- [Snapshot Strategy](../save_snapshot_stragegy/README.md)
