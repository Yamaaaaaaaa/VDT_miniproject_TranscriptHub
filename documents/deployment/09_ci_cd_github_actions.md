# Hướng dẫn Xây dựng CI/CD Pipeline với GitHub Actions

Tài liệu này hướng dẫn thiết lập quy trình **Tích hợp liên tục (CI)** và **Triển khai liên tục (CD)** tự động cho dự án TranscriptHub bằng công cụ **GitHub Actions**.

---

## 1. Luồng hoạt động của CI/CD Pipeline

Mỗi khi lập trình viên thực hiện push code hoặc tạo Pull Request (PR) vào nhánh `main`:
1. **Giai đoạn CI (Kiểm tra chất lượng)**: Tự động tải code, cài đặt thư viện, chạy kiểm tra cú pháp (Lint) và chạy bộ kiểm thử tự động (Unit Test). Nếu lỗi, pipeline dừng lại và gửi cảnh báo.
2. **Giai đoạn CD (Build & Deploy)**: Nếu CI chạy thành công, hệ thống tự động build Docker Image cho từng service và đẩy (push) lên **Docker Hub Registry**, sau đó kết nối SSH vào máy chủ VPS để kéo (pull) ảnh mới và khởi động lại các container.

---

## 2. File cấu hình Workflow: `.github/workflows/deploy.yml`

Tạo thư mục `.github/workflows` tại thư mục gốc của dự án và lưu file sau với tên `deploy.yml`:

```yaml
name: CI/CD Pipeline - TranscriptHub

on:
  push:
    branches: [ "main" ] # Kích hoạt khi push lên nhánh main
  pull_request:
    branches: [ "main" ] # Kích hoạt khi mở PR vào nhánh main

jobs:
  # ── JOB 1: TÍCH HỢP LIÊN TỤC (CI) ────────────────────────────────
  continuous-integration:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: |
            services_ms/package-lock.json
            fe_next/package-lock.json

      # 1. Kiểm thử Backend
      - name: Install & Test Backend
        run: |
          cd services_ms
          npm ci
          npx prisma generate
          npm run lint
          npm run test -- --passWithNoTests

      # 2. Kiểm thử Frontend
      - name: Install & Build Frontend
        run: |
          cd fe_next
          npm ci
          npm run build

  # ── JOB 2: TRIỂN KHAI LIÊN TỤC (CD) ──────────────────────────────
  continuous-deployment:
    needs: continuous-integration # Chỉ chạy nếu job CI thành công
    if: github.event_name == 'push' && github.ref == 'refs/heads/main' # Chỉ deploy khi push trực tiếp lên main
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      # Đăng nhập vào Docker Hub sử dụng Credentials lưu trong GitHub Secrets
      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      # Cài đặt Docker Buildx để build image tối ưu
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      # Build & Push: Users Microservice
      - name: Build & Push Users Service
        uses: docker/build-push-action@v5
        with:
          context: ./services_ms
          file: ./services_ms/apps/users/Dockerfile
          push: true
          tags: ${{ secrets.DOCKERHUB_USERNAME }}/transcripthub-users:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # Build & Push: Identity Microservice
      - name: Build & Push Identity Service
        uses: docker/build-push-action@v5
        with:
          context: ./services_ms
          file: ./services_ms/apps/identity/Dockerfile
          push: true
          tags: ${{ secrets.DOCKERHUB_USERNAME }}/transcripthub-identity:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # Build & Push: API Gateway
      - name: Build & Push API Gateway
        uses: docker/build-push-action@v5
        with:
          context: ./services_ms
          file: ./services_ms/apps/api-gateway/Dockerfile
          push: true
          tags: ${{ secrets.DOCKERHUB_USERNAME }}/transcripthub-api-gateway:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # Build & Push: Frontend Next.js
      - name: Build & Push Frontend
        uses: docker/build-push-action@v5
        with:
          context: ./fe_next
          file: ./fe_next/Dockerfile
          push: true
          tags: ${{ secrets.DOCKERHUB_USERNAME }}/transcripthub-frontend:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # SSH vào VPS để cập nhật dự án
      - name: Deploy to VPS via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USERNAME }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /app/VDT_miniproject_TranscriptHub
            # Kéo các Docker Images mới nhất từ Registry
            docker compose pull
            # Khởi chạy lại hệ thống không gây gián đoạn
            docker compose up -d --remove-orphans
            # Dọn dẹp các image cũ không còn sử dụng để giải phóng dung lượng ổ đĩa
            docker image prune -f
```

---

## 3. Cấu hình GitHub Secrets

Để pipeline trên chạy được, bạn cần cấu hình các biến bảo mật trên kho chứa GitHub của bạn:
1. Vào repository trên GitHub -> Chọn **Settings** -> **Secrets and variables** -> **Actions**.
2. Nhấn **New repository secret** và thêm các khóa sau:

| Tên Secret | Ý nghĩa | Ví dụ giá trị |
| :--- | :--- | :--- |
| `DOCKERHUB_USERNAME` | Username đăng nhập Docker Hub | `yourusername` |
| `DOCKERHUB_TOKEN` | Access Token sinh ra từ tài liệu bảo mật Docker Hub | `dckr_pat_xxxx...` |
| `VPS_HOST` | Địa chỉ IP của máy chủ VPS của bạn | `192.168.1.100` |
| `VPS_USERNAME` | Username đăng nhập SSH vào VPS | `root` hoặc `ubuntu` |
| `VPS_SSH_KEY` | Nội dung SSH Private Key của bạn (`id_rsa` / `id_ed25519`) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |

---

## 4. Hướng dẫn thiết lập ban đầu trên máy chủ VPS

Trước khi chạy CD lần đầu tiên, hãy đăng nhập SSH vào VPS và chuẩn bị thư mục chứa dự án:

```bash
# 1. SSH vào VPS
ssh ubuntu@<vps_ip>

# 2. Tạo thư mục chứa app
mkdir -p /app/VDT_miniproject_TranscriptHub
cd /app/VDT_miniproject_TranscriptHub

# 3. Copy file docker-compose.yml từ local lên VPS
# (Bạn có thể clone dự án hoặc chỉ tạo thủ công file docker-compose.yml tại đây)
```
Sau đó, mỗi lần bạn push code lên nhánh `main`, mã nguồn mới sẽ được tự động biên dịch thành image, push lên Docker Hub, và cập nhật trực tiếp trên VPS mà không cần bạn phải can thiệp thủ công.
