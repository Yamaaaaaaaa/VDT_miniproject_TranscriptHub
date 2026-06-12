# Hướng dẫn Đóng gói Docker & Docker Compose từ số 0 (Môi trường Local)

Tài liệu này hướng dẫn bạn từng bước tự viết các file Dockerfile để đóng gói (dockerize) Backend, Frontend và viết file `docker-compose.yml` để chạy toàn bộ hệ thống bằng một lệnh duy nhất.

---

## 1. Bước 1: Tạo các Dockerfile cho Backend NestJS Monorepo

Trong monorepo, chúng ta tạo 3 file Dockerfile độc lập cho 3 ứng dụng con. Cả 3 file đều sử dụng kỹ thuật **Multi-stage build** để tối ưu hóa dung lượng ảnh.

### 1.1. Tạo file [apps/users/Dockerfile](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/apps/users/Dockerfile)
Tạo file `Dockerfile` bên trong thư mục `services_ms/apps/users/`:

```dockerfile
# ── Stage 1: Build source code ──────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy các tệp cấu hình package
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/

# Cài đặt tất cả dependencies phục vụ biên dịch
RUN npm ci
RUN npx prisma generate

# Copy mã nguồn
COPY apps ./apps/

# Biên dịch riêng Users app thành JS
RUN npx tsc --project apps/users/tsconfig.app.json

# ── Stage 2: Runtime ───────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/

# Chỉ cài đặt dependencies cần chạy (Không có devDependencies)
RUN npm ci --only=production
RUN npx prisma generate

# Chỉ lấy folder dist đã biên dịch từ Stage 1
COPY --from=builder /app/dist/apps/users ./dist/apps/users

EXPOSE 3001
CMD ["node", "dist/apps/users/main"]
```

### 1.2. Tạo file `apps/identity/Dockerfile`
Tạo file tương tự bên trong thư mục `services_ms/apps/identity/`, chỉ cần sửa đổi dòng build và cmd cuối:
```dockerfile
# (Các bước tương tự Users Dockerfile)
...
# Biên dịch riêng Identity app
RUN npx tsc --project apps/identity/tsconfig.app.json
...
COPY --from=builder /app/dist/apps/identity ./dist/apps/identity
EXPOSE 3002
CMD ["node", "dist/apps/identity/main"]
```

### 1.3. Tạo file `apps/api-gateway/Dockerfile`
Tạo file tương tự bên trong thư mục `services_ms/apps/api-gateway/`:
```dockerfile
# (Các bước tương tự Users Dockerfile)
...
# Biên dịch riêng API Gateway app
RUN npx tsc --project apps/api-gateway/tsconfig.app.json
...
COPY --from=builder /app/dist/apps/api-gateway ./dist/apps/api-gateway
EXPOSE 3000
CMD ["node", "dist/apps/api-gateway/main"]
```

---

## 2. Bước 2: Tạo Dockerfile cho Next.js Frontend

Tạo file [Dockerfile](file:///d:/VDT/VDT_miniproject_TranscriptHub/fe_next/Dockerfile) bên trong thư mục `fe_next/`:

```dockerfile
# Stage 1: Cài đặt thư viện
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: Build code Next.js
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Bảo mật: Chạy container bằng user không có quyền quản trị
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

---

## 3. Bước 3: Tạo File điều phối Docker Compose: [docker-compose.yml](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/docker-compose.yml)

Tạo file `docker-compose.yml` ở thư mục gốc của dự án (`VDT_miniproject_TranscriptHub/`):

```yaml
version: '3.8'

services:
  # 1. PostgreSQL Container (Sử dụng v15 để tương thích ngược dữ liệu)
  postgres:
    image: postgres:15-alpine
    container_name: transcripthub-db
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: transcripthub
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 10
    networks:
      - transcripthub_net

  # 2. Redis Container (Lưu trữ danh sách đen Token khi người dùng Logout)
  redis:
    image: redis:7-alpine
    container_name: transcripthub-redis
    restart: always
    ports:
      - "6379:6379"
    networks:
      - transcripthub_net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  # 3. Tạo bảng tự động & Seeding dữ liệu (Migration & Seed)
  migrate:
    build:
      context: ./services_ms
      dockerfile: apps/users/Dockerfile
      target: builder
    container_name: transcripthub-db-migrate
    command: >
      sh -c "npx prisma db push --url postgresql://postgres:postgres@postgres:5432/transcripthub --accept-data-loss && npx prisma db seed"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/transcripthub
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - transcripthub_net
    restart: on-failure

  # 4. Users Microservice (TCP :3001)
  users-service:
    build:
      context: ./services_ms
      dockerfile: apps/users/Dockerfile
      target: production
    container_name: transcripthub-users-service
    restart: always
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/transcripthub
      USERS_SERVICE_PORT: 3001
    ports:
      - "3001:3001"
    depends_on:
      postgres:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
    networks:
      - transcripthub_net

  # 5. Identity Microservice (TCP :3002)
  identity-service:
    build:
      context: ./services_ms
      dockerfile: apps/identity/Dockerfile
      target: production
    container_name: transcripthub-identity-service
    restart: always
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/transcripthub
      USERS_SERVICE_HOST: users-service
      USERS_SERVICE_PORT: 3001
      IDENTITY_SERVICE_PORT: 3002
      JWT_SECRET: "th_jwt_s3cr3t_k3y_x9mK2pL8qR4nW6vY1bZ5cE0aF7gH3jN"
      JWT_REFRESH_SECRET: "th_refresh_s3cr3t_k3y_p2mX8nL4qK9vR6bW1zY5cE0aF7gH3jN"
      REDIS_HOST: redis
      REDIS_PORT: 6379
    ports:
      - "3002:3002"
    depends_on:
      users-service:
        condition: service_started
      redis:
        condition: service_healthy
    networks:
      - transcripthub_net

  # 6. API Gateway (HTTP :3000)
  api-gateway:
    build:
      context: ./services_ms
      dockerfile: apps/api-gateway/Dockerfile
      target: production
    container_name: transcripthub-api-gateway
    restart: always
    environment:
      PORT: 3000
      USERS_SERVICE_HOST: users-service
      USERS_SERVICE_PORT: 3001
      IDENTITY_SERVICE_HOST: identity-service
      IDENTITY_SERVICE_PORT: 3002
    ports:
      - "3000:3000"
    depends_on:
      - users-service
      - identity-service
    networks:
      - transcripthub_net

  # 7. pgAdmin (Quản lý Database trực quan)
  pgadmin:
    image: dpage/pgadmin4
    container_name: transcripthub-pgadmin
    restart: always
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@admin.com
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "8080:80"
    depends_on:
      - postgres
    networks:
      - transcripthub_net

volumes:
  postgres_data:

networks:
  transcripthub_net:
    driver: bridge
```

---

## 4. Bước 4: Chạy toàn bộ hệ thống bằng Docker Compose

Mở Terminal tại thư mục gốc chứa file `docker-compose.yml` và chạy lệnh sau để build và khởi động toàn bộ:

```bash
docker compose up -d --build
```

Docker Compose sẽ thực hiện tuần tự:
1. Build các image cho Backend (`users-service`, `identity-service`, `api-gateway`).
2. Khởi tạo DB Postgres và Redis và chờ đến khi DB nhận kết nối thành công.
3. Chạy container `migrate` để đẩy cấu trúc bảng vào DB Postgres và seed tài khoản admin mặc định.
4. Chạy `users-service`, `identity-service`, `api-gateway`, và `pgadmin`.

Hệ thống backend đã hoạt động hoàn tất! Để khởi chạy frontend Next.js kết nối tới backend này, di chuyển tới thư mục `fe_next/` và chạy lệnh local:
```bash
npm run dev -- -p 3333
```
 Giao diện sẽ chạy tại `http://localhost:3333`. Cấu hình pgAdmin trực quan sẽ có tại `http://localhost:8080` (email: `admin@admin.com`, mật khẩu: `admin`).
