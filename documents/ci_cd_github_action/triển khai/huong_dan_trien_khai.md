# Hướng dẫn Triển khai CI/CD lên VPS bằng GitHub Actions và Docker Compose

Tài liệu này hướng dẫn từng bước chi tiết để cấu hình và chạy thực tế quy trình CI/CD tự động cho dự án **TranscriptHub** từ GitHub lên máy chủ **VPS** sử dụng **GitHub Actions** và **Docker Compose**.

---

## 1. Chuẩn bị môi trường trên máy chủ VPS (Từ hệ điều hành Ubuntu trắng)

Nếu máy chủ VPS của bạn là máy ảo mới tinh chưa có bất kỳ cài đặt nào (sử dụng hệ điều hành Ubuntu 22.04 LTS hoặc 24.04 LTS), hãy thực hiện các bước thiết lập môi trường nền tảng dưới đây:

### 1.1. Cập nhật hệ thống và cài đặt các công cụ cơ bản
SSH vào VPS của bạn và chạy chuỗi lệnh sau để cập nhật danh sách gói và cài đặt các công cụ cơ bản:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ca-certificates gnupg lsb-release nano
```

### 1.2. Cài đặt Docker Engine và Docker Compose (Bản chính thức từ Docker Hub)
Chạy tuần tự các lệnh sau để cài đặt Docker:

1. **Thêm khóa GPG chính thức của Docker**:
   ```bash
   sudo mkdir -p /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   ```

2. **Thiết lập apt repository của Docker**:
   ```bash
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   ```

3. **Cài đặt các gói Docker**:
   ```bash
   sudo apt update
   sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```

4. **Xác minh cài đặt thành công**:
   ```bash
   sudo docker --version
   sudo docker compose version
   ```

### 1.3. Cấu hình phân quyền chạy Docker không cần sudo
Mặc định lệnh `docker` yêu cầu quyền root (`sudo`). Để máy ảo GitHub Actions đăng nhập qua SSH có thể thực thi các lệnh Docker trực tiếp, bạn cần thêm user SSH vào nhóm `docker`:
```bash
# Thêm user hiện tại (ví dụ: ubuntu) vào nhóm docker
sudo usermod -aG docker $USER

# Áp dụng thay đổi quyền ngay lập tức mà không cần log out
newgrp docker
```
*Xác minh: Thử chạy `docker ps` xem có lỗi phân quyền không. Nếu hiển thị danh sách trống mà không báo lỗi là đã thành công.*

### 1.4. Thiết lập thư mục triển khai và kéo mã nguồn (Clone)
1. **Tạo thư mục ứng dụng tại đường dẫn `/app` và phân quyền cho user**:
   ```bash
   sudo mkdir -p /app
   sudo chown -R $USER:$USER /app
   cd /app
   ```
2. **Kéo mã nguồn dự án về máy chủ**:
   ```bash
   git clone https://github.com/yourusername/VDT_miniproject_TranscriptHub.git
   cd VDT_miniproject_TranscriptHub
   ```
   * **Lưu ý**: Hãy chắc chắn đường dẫn `/app/VDT_miniproject_TranscriptHub` khớp chính xác với biến bí mật `DEPLOY_PATH` mà bạn cấu hình trong GitHub Secrets (nếu cấu hình khác, hãy đổi theo thư mục thực tế của bạn).*

---

### 1.5. Cấu hình bảo mật các biến môi trường (.env) trên VPS
Vì các thông tin nhạy cảm (như `GEMINI_API_KEY`, mật khẩu database, JWT Secrets,...) đã được thêm vào `.gitignore` để tránh bị lộ khi đưa mã nguồn lên Git, bản cấu hình `.env` này cần được lưu trữ trực tiếp trên hệ thống tệp tin bảo mật của VPS:

1. SSH trực tiếp vào máy chủ VPS của bạn.
2. Di chuyển đến thư mục chứa microservices của dự án trên VPS:
   ```bash
   cd /app/VDT_miniproject_TranscriptHub/services_ms
   ```
3. Tạo file `.env` từ file mẫu:
   ```bash
   cp .env.example .env
   ```
4. Chỉnh sửa file `.env` để điền các thông số hoạt động thực tế trên VPS (sử dụng công cụ `nano` hoặc `vi`):
   ```bash
   nano .env
   # Cập nhật các giá trị thực tế của VPS: GEMINI_API_KEY, JWT_SECRET, DATABASE_URL,...
   ```
5. Khi GitHub Actions chạy lệnh `docker compose up -d` qua SSH, Docker Compose trên VPS sẽ tự động đọc tệp `.env` cục bộ này để đưa vào container (thông qua khai báo `env_file: - ./services_ms/.env` trong docker-compose.yml).

---

## 2. Tệp cấu hình Workflow GitHub Actions (`.github/workflows/ci-cd.yml`)

Dưới đây là tệp cấu hình hoàn chỉnh hiện đang áp dụng trong codebase của dự án. Quy trình này sử dụng **Matrix Strategy** để xây dựng song song 9 Docker Images giúp tối ưu thời gian chạy pipeline, sau đó SSH vào VPS để cập nhật hệ thống.

```yaml
name: TranscriptHub CI/CD Pipeline

on:
  push:
    branches: [ dev_js ]
  pull_request:
    branches: [ dev_js ]
  workflow_dispatch:

env:
  DOCKER_REGISTRY: docker.io
  DOCKER_USER: ${{ secrets.DOCKER_USERNAME }}
  # Test environment variables (using GitHub Secrets for security)
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  REDIS_HOST: localhost
  REDIS_PORT: 6379
  JWT_SECRET: ${{ secrets.JWT_SECRET }}
  JWT_REFRESH_SECRET: ${{ secrets.JWT_REFRESH_SECRET }}

jobs:
  # ── STAGE 1 & 2: PREPARE, VERIFY, LINT & TEST (CI) ───────────
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: |
            services_ms/package-lock.json
            fe_next/package-lock.json

      - name: Verify Environment Tools
        run: |
          node --version
          npm --version
          docker --version

      - name: Test Backend (NestJS)
        run: |
          cd services_ms
          echo 'Installing Backend dependencies...'
          npm ci
          echo 'Generating Prisma Client...'
          npx prisma generate
          echo 'Running Backend Linter...'
          npm run lint || true
          echo 'Running Backend Tests...'
          npm run test -- --passWithNoTests
          echo 'Running Backend E2E Tests...'
          npm run test:e2e -- --passWithNoTests

      - name: Test Frontend (Next.js)
        run: |
          cd fe_next
          echo 'Installing Frontend dependencies...'
          npm ci
          echo 'Building Frontend to verify compile status...'
          npm run build

      - name: Publish Test Report
        uses: mikepenz/action-junit-report@v4
        if: always()
        with:
          report_paths: 'services_ms/test-reports/*.xml'

  # ── STAGE 3: BUILD & PUSH DOCKER IMAGES (PARALLEL MATRIX) ───────────
  docker-build-and-push:
    needs: lint-and-test
    runs-on: ubuntu-latest
    if: github.event_name == 'push' || github.event_name == 'workflow_dispatch'
    strategy:
      matrix:
        service:
          - name: api-gateway
            context: services_ms
            dockerfile: services_ms/apps/api-gateway/Dockerfile
            image: transcripthub-api-gateway
            target: production
          - name: users-service
            context: services_ms
            dockerfile: services_ms/apps/users/Dockerfile
            image: transcripthub-users
            target: production
          - name: identity-service
            context: services_ms
            dockerfile: services_ms/apps/identity/Dockerfile
            image: transcripthub-identity
            target: production
          - name: file-service
            context: services_ms
            dockerfile: services_ms/apps/file/Dockerfile
            image: transcripthub-file
            target: production
          - name: transcript-service
            context: services_ms
            dockerfile: services_ms/apps/transcript/Dockerfile
            image: transcripthub-transcript
            target: production
          - name: meeting-service
            context: services_ms
            dockerfile: services_ms/apps/meeting/Dockerfile
            image: transcripthub-meeting
            target: production
          - name: collab-service
            context: services_ms
            dockerfile: services_ms/apps/collab/Dockerfile
            image: transcripthub-collab
            target: production
          - name: collab-gateway
            context: services_ms/apps/collab-gateway
            dockerfile: services_ms/apps/collab-gateway/Dockerfile
            image: transcripthub-collab-gateway
            target: ""
          - name: frontend
            context: fe_next
            dockerfile: fe_next/Dockerfile
            image: transcripthub-frontend
            target: production

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and Push Docker Image
        uses: docker/build-push-action@v6
        with:
          context: ${{ matrix.service.context }}
          file: ${{ matrix.service.dockerfile }}
          target: ${{ matrix.service.target }}
          push: true
          tags: |
            ${{ env.DOCKER_USER }}/${{ matrix.service.image }}:${{ github.run_number }}
            ${{ env.DOCKER_USER }}/${{ matrix.service.image }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ── STAGE 4: CONTINUOUS DEPLOYMENT (CD) ────────────────────────
  deploy:
    needs: docker-build-and-push
    runs-on: ubuntu-latest
    if: github.event_name == 'push' || github.event_name == 'workflow_dispatch'
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Deploy to VPS (Docker Compose)
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER || 'ubuntu' }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd ${{ secrets.DEPLOY_PATH || '/app/VDT_miniproject_TranscriptHub' }}
            echo 'Connected to VPS. Pulling new Docker Images...'
            docker compose pull
            echo 'Updating stack without downtime...'
            docker compose up -d --remove-orphans
            echo 'Cleaning old Docker images...'
            docker image prune -f
            echo 'Deployment Completed successfully!'
```

---

## 3. Các bước Kích hoạt và Kiểm tra kết quả

### Bước 1: Kích hoạt Pipeline
Tiến hành commit và push tệp tin cấu hình lên nhánh `dev_js` để kích hoạt workflow chạy tự động:
```bash
git add .github/workflows/ci-cd.yml
git commit -m "ci: configure GitHub Actions workflow for dev_js"
git push origin dev_js
```

### Bước 2: Theo dõi Pipeline trên GitHub
1. Mở trang GitHub của repository dự án.
2. Chọn tab **Actions**.
3. Nhấp chọn tiến trình build đang chạy để theo dõi logs real-time của từng stage:
   * **`lint-and-test`**: Cài đặt node_modules và chạy các bộ test case Backend, Frontend.
   * **`docker-build-and-push`**: 9 luồng build chạy song song.
   * **`deploy`**: SSH tới VPS để kích hoạt docker compose.

### Bước 3: Xác minh trực tiếp trên VPS
Sau khi job `deploy` báo thành công (tick xanh), bạn có thể SSH vào VPS để kiểm tra trạng thái hoạt động của các container:
```bash
# Di chuyển tới thư mục deploy
cd /app/VDT_miniproject_TranscriptHub

# Kiểm tra danh sách container đang chạy
docker compose ps

# Xem log runtime của các service để đảm bảo không bị crash khi cập nhật phiên bản mới
docker compose logs -f --tail=100
```
*(Nếu hiển thị tất cả service ở trạng thái `Up` và logs chạy bình thường tức là quy trình deploy lên VPS đã hoàn thành thành công).*
