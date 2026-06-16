# STEP-05: Docker & Deployment

## Mục Tiêu

Triển khai Collab Service và Collab Gateway lên Docker (local development).

## Dependencies

- ✅ STEP-00 (Prerequisites)
- ✅ STEP-01 (Database Schema)
- ✅ STEP-02 (Collab Service)
- ✅ STEP-03 (Meeting Service)
- ✅ STEP-04 (Collab Gateway)

## Checklist

- [ ] Tạo Dockerfile cho collab service
- [ ] Tạo Dockerfile cho collab-gateway
- [ ] Cập nhật docker-compose.yml
- [ ] Test toàn bộ hệ thống

---

## 1. Collab Service Dockerfile

### 1.1. File đã tồn tại

Dockerfile cho collab service đã được tạo tại `services_ms/apps/collab/Dockerfile`:

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate
COPY apps ./apps/
COPY libs ./libs/
RUN npx nest build collab

# Stage 2: Production
FROM node:22-alpine AS production
WORKDIR /app
COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/
RUN npm ci --only=production
RUN npx prisma generate
COPY --from=builder /app/dist/apps/collab ./dist/apps/collab
EXPOSE 3007
CMD ["node", "dist/apps/collab/main"]
```

---

## 2. Collab Gateway Dockerfile

### 2.1. Tạo Dockerfile

```dockerfile
# services_ms/apps/collab-gateway/Dockerfile

# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY tsconfig.app.json ./apps/collab-gateway/tsconfig.app.json
COPY nest-cli.json ./
COPY apps/collab-gateway ./apps/collab-gateway
COPY libs ./libs/

RUN npm ci
RUN npx nest build collab-gateway

# Stage 2: Production
FROM node:22-alpine AS production
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist/apps/collab-gateway ./dist/apps/collab-gateway

EXPOSE 3008

CMD ["node", "dist/apps/collab-gateway/src/main"]
```

### 2.2. .dockerignore cho collab-gateway

```dockerfile
# services_ms/apps/collab-gateway/.dockerignore
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

### 3.1. Thêm collab-gateway service

Thêm vào `docker-compose.yml`:

```yaml
# Collab Gateway (WebSocket :3008)
collab-gateway:
  build:
    context: ./services_ms
    dockerfile: apps/collab-gateway/Dockerfile
    target: production
  container_name: transcripthub-collab-gateway
  restart: always
  environment:
    COLLAB_GATEWAY_PORT: 3008
    COLLAB_SERVICE_HOST: collab-service
    COLLAB_SERVICE_TCP_PORT: 3007
    IDENTITY_SERVICE_URL: http://identity-service:3002
    REDIS_HOST: redis
    REDIS_PORT: 6379
    JWT_SECRET: "th_jwt_s3cr3t_k3y_x9mK2pL8qR4nW6vY1bZ5cE0aF7gH3jN"
  ports:
    - "3008:3008"
  depends_on:
    - collab-service
    - redis
    - identity-service
  networks:
    - transcripthub_net
```

### 3.2. Cập nhật collab-service (thêm depends_on collab-gateway)

```yaml
# 4e. Collab Microservice (TCP :3007)
collab-service:
  # ... existing config ...
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
    meeting-service:
      condition: service_started
    collab-gateway:
      condition: service_started
```

---

## 4. Environment Variables

### 4.1. Thêm vào .env

```env
# Collab Service
COLLAB_SERVICE_TCP_PORT=3007

# Collab Gateway
COLLAB_GATEWAY_PORT=3008
```

---

## 5. Build & Deploy

### 5.1. Build images

```bash
# Build collab service
docker build -f services_ms/apps/collab/Dockerfile -t transcripthub-collab-service services_ms

# Build collab-gateway
docker build -f services_ms/apps/collab-gateway/Dockerfile -t transcripthub-collab-gateway services_ms
```

### 5.2. Run with docker-compose

```bash
docker-compose up -d collab-service collab-gateway
```

### 5.3. Check logs

```bash
# Collab Service logs
docker logs transcripthub-collab-service -f

# Collab Gateway logs
docker logs transcripthub-collab-gateway -f
```

---

## 6. Testing Toàn Bộ Hệ Thống

### 6.1. Kiểm tra services đang chạy

```bash
docker ps | grep -E "collab|transcripthub"
```

**Expected:**
```
transcripthub-collab-service   ... Up ... 0.0.0.0:3007->3007/tcp
transcripthub-collab-gateway   ... Up ... 0.0.0.0:3008->3008/tcp
```

### 6.2. Kiểm tra WebSocket endpoint

```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://localhost:3008/ws/collab?meetingId=test&token=test
```

**Expected:** HTTP 101 Switching Protocols

### 6.3. Health check

```bash
# Collab Service TCP check
nc -zv localhost 3007

# Collab Gateway WebSocket check (sẽ có endpoint /health nếu implement)
curl http://localhost:3008/health
```

---

## 7. Troubleshooting

### 7.1. Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Client cannot connect to WS | Collab gateway not running | Check `docker ps` for collab-gateway |
| Collab Service cannot reach Meeting | Wrong hostname | Check `MEETING_SERVICE_HOST` env |
| Redis connection failed | Redis not running | Ensure redis container is up |
| Build fails | Missing dependencies | Run `npm ci` before build |

### 7.2. Debug Commands

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

Sau khi hoàn thành STEP-05:

1. ✅ Collab Service container được build và chạy
2. ✅ Collab Gateway container được build và chạy
3. ✅ Toàn bộ hệ thống hoạt động trong Docker

---

## Tiếp Theo

👉 **[STEP-06: Frontend Integration](./STEP-06.md)** - Tích hợp collaborative editor vào Next.js frontend
