# Hướng dẫn Triển khai CI/CD với GitHub Actions, Docker và Kubernetes (Minikube)

Tài liệu này hướng dẫn từng bước chi tiết để thiết lập, viết cấu hình và chạy thực tế quy trình CI/CD tự động cho dự án **TranscriptHub** sử dụng **GitHub Actions**, kết hợp đóng gói **Docker** và triển khai lên máy chủ VPS hoặc cụm **Kubernetes (Minikube)**.

---

## 1. Chuẩn bị môi trường cài đặt

Để thực hiện toàn bộ quy trình kiểm thử và deploy, hãy chuẩn bị:
1. Tài khoản **GitHub** chứa repository dự án TranscriptHub.
2. Tài khoản **Docker Hub** để lưu trữ Docker Images.
3. Môi trường triển khai:
   * **Phương án A: Máy chủ VPS** đã được cài đặt sẵn Docker và Docker Compose.
   * **Phương án B: Cụm Kubernetes (Minikube)** đang chạy cục bộ (kèm CLI `kubectl` và Ingress Addon).

---

## 2. Bước 1: Tạo các tệp cấu hình Kubernetes YAML (Nếu triển khai lên K8s)

Tạo thư mục `k8s/` ở thư mục gốc của dự án để lưu trữ các manifest định nghĩa tài nguyên của Kubernetes:

### 2.1. Cấu hình Namespace và ConfigMap chung (`k8s/init-config.yaml`)
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: transcripthub
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: transcripthub-config
  namespace: transcripthub
data:
  DATABASE_HOST: "postgres-db-service"
  REDIS_HOST: "redis-service"
```

### 2.2. Cấu hình Deployment & Service cho Microservice mẫu (ví dụ: `k8s/users-service.yaml`)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: users-service
  namespace: transcripthub
spec:
  replicas: 2
  selector:
    matchLabels:
      app: users-service
  template:
    metadata:
      labels:
        app: users-service
    spec:
      containers:
      - name: users-service
        image: yourusername/transcripthub-users:latest
        ports:
        - containerPort: 3001
        env:
        - name: DATABASE_URL
          value: "postgresql://postgres:postgres@postgres-db-service:5432/transcripthub"
---
apiVersion: v1
kind: Service
metadata:
  name: users-service
  namespace: transcripthub
spec:
  selector:
    app: users-service
  ports:
  - port: 3001
    targetPort: 3001
  type: ClusterIP
```

### 2.3. Cấu hình Deployment & Service cho Frontend (`k8s/frontend-service.yaml`)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: transcripthub
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: yourusername/transcripthub-frontend:latest
        ports:
        - containerPort: 3000
---
apiVersion: v1
kind: Service
metadata:
  name: frontend-service
  namespace: transcripthub
spec:
  selector:
    app: frontend
  ports:
  - port: 3000
    targetPort: 3000
  type: ClusterIP
```

### 2.4. Cấu hình Ingress định tuyến (`k8s/ingress.yaml`)
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: transcripthub-ingress
  namespace: transcripthub
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
  - host: transcripthub.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend-service
            port:
              number: 3000
```

---

## 3. Bước 2: Viết cấu hình Workflow GitHub Actions

Tạo một tệp cấu hình mới tại đường dẫn: **`.github/workflows/ci-cd.yml`** tại thư mục gốc dự án. Cú pháp này thay thế hoàn toàn cho tệp `Jenkinsfile`.

Quy trình này sử dụng **Matrix Strategy** để xây dựng và đẩy song song cả 9 Docker images lên Docker Hub, giúp tận dụng tối đa băng thông và tài nguyên máy ảo đám mây của GitHub, rút ngắn thời gian build từ 30 phút xuống còn 4-5 phút.

```yaml
name: TranscriptHub CI/CD Pipeline

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
  # Cho phép kích hoạt thủ công từ giao diện GitHub
  workflow_dispatch:

env:
  DOCKER_REGISTRY: docker.io
  DOCKER_USER: ${{ secrets.DOCKER_USERNAME }}
  # Biến môi trường giả lập phục vụ quá trình test
  DATABASE_URL: postgresql://postgres:postgres@localhost:5432/transcripthub
  REDIS_HOST: localhost
  REDIS_PORT: 6379
  JWT_SECRET: th_jwt_s3cr3t_k3y_x9mK2pL8qR4nW6vY1bZ5cE0aF7gH3jN
  JWT_REFRESH_SECRET: th_refresh_s3cr3t_k3y_p2mX8nL4qK9vR6bW1zY5cE0aF7gH3jN

jobs:
  # ── JOB 1: KIỂM TRA MÔ TRƯỜNG & KIỂM THỬ (CI) ──────────────────
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

      # Kiểm thử Backend NestJS
      - name: Install & Test Backend
        run: |
          cd services_ms
          npm ci
          npx prisma generate
          npm run lint || true
          npm run test -- --passWithNoTests
          npm run test:e2e -- --passWithNoTests

      # Kiểm thử Frontend Next.js
      - name: Install & Build Frontend
        run: |
          cd fe_next
          npm ci
          npm run build

      # Lưu trữ kết quả báo cáo kiểm thử
      - name: Publish Test Report
        uses: mikepenz/action-junit-report@v4
        if: always() # Luôn luôn chạy dù các step trước lỗi hay thành công
        with:
          report_paths: 'services_ms/test-reports/*.xml'

  # ── JOB 2: ĐÓNG GÓI DOCKER IMAGES SONG SONG ───────────────────
  docker-build-and-push:
    needs: lint-and-test
    runs-on: ubuntu-latest
    if: github.event_name == 'push' # Chỉ build/push khi merge/push trực tiếp vào main
    strategy:
      matrix:
        # Cấu hình danh sách 9 service chạy song song trên 9 máy ảo độc lập
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
            target: "" # Không dùng multi-stage target
          - name: frontend
            context: fe_next
            dockerfile: fe_next/Dockerfile
            image: transcripthub-frontend
            target: ""

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

  # ── JOB 3: TRIỂN KHAI LIÊN TỤC (CD) ───────────────────────────
  deploy:
    needs: docker-build-and-push
    runs-on: ubuntu-latest
    # environment: production # Kích hoạt phê duyệt thủ công nếu đã cấu hình Settings
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      # PHƯƠNG ÁN 1: Deploy lên máy chủ VPS bằng SSH & Docker Compose
      - name: Deploy to VPS (Docker Compose)
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd ${{ secrets.DEPLOY_PATH || '/app/VDT_miniproject_TranscriptHub' }}
            echo "Connected to VPS. Pulling new Docker Images..."
            docker compose pull
            echo "Updating stack without downtime..."
            docker compose up -d --remove-orphans
            echo "Cleaning old Docker images..."
            docker image prune -f
            echo "Deployment Completed successfully!"

      # PHƯƠNG ÁN 2: Deploy lên Kubernetes (Minikube / Cluster) - Mặc định comment
      # - name: Deploy to Kubernetes
      #   run: |
      #     mkdir -p ~/.kube
      #     echo "${{ secrets.KUBECONFIG_RAW }}" > ~/.kube/config
      #     
      #     echo "Applying Kubernetes Manifests..."
      #     kubectl apply -f k8s/init-config.yaml
      #     kubectl apply -f k8s/users-service.yaml
      #     kubectl apply -f k8s/frontend-service.yaml
      #     kubectl apply -f k8s/ingress.yaml
      #     
      #     echo "Updating image tags..."
      #     kubectl set image deployment/users-service users-service=${{ env.DOCKER_USER }}/transcripthub-users:${{ github.run_number }} -n transcripthub
      #     kubectl set image deployment/frontend frontend=${{ env.DOCKER_USER }}/transcripthub-frontend:${{ github.run_number }} -n transcripthub
      #     
      #     echo "Checking Rollout status..."
      #     kubectl rollout status deployment/users-service -n transcripthub
      #     kubectl rollout status deployment/frontend -n transcripthub
```

---

## 4. Bước 3: Chạy thử và Kiểm tra kết quả

### 4.1. Kích hoạt Pipeline
1. Tiến hành commit và push tệp tin cấu hình `.github/workflows/ci-cd.yml` lên GitHub:
   ```bash
   git add .github/workflows/ci-cd.yml
   git commit -m "ci: add GitHub Actions workflow"
   git push origin main
   ```
2. Truy cập vào trang GitHub của bạn -> Chọn tab **Actions**.
3. Bạn sẽ thấy workflow bắt đầu chạy. Click chọn vào tiêu đề commit để xem sơ đồ phân luồng đồ họa trực quan (Dependency Graph) giữa các jobs.

```text
  [ lint-and-test ]
         │
         ▼
[ docker-build-and-push ] (Chạy song song 9 luồng Matrix)
         │
         ▼
     [ deploy ]
```

### 4.2. Xem Logs và Kết quả Kiểm thử
* Bạn có thể click vào từng Job để theo dõi logs xuất ra thời gian thực của các tiến trình cài đặt, linting, build Docker, hoặc lệnh SSH deploy.
* Nếu cấu hình plugin kiểm thử `mikepenz/action-junit-report`, kết quả test cases sẽ xuất hiện trực tiếp ngay dưới mục tổng kết build của GitHub (Tab **Summary**), chỉ rõ các case thành công/thất bại mà không cần xem log text thô.

### 4.3. Xác minh triển khai (Nếu dùng Kubernetes/Minikube local)
Nếu bạn triển khai thông qua **Self-hosted runner** kết nối tới Minikube local, hãy chạy các lệnh kiểm tra sau trên máy của bạn:
```bash
kubectl get pods -n transcripthub
kubectl get svc -n transcripthub
kubectl get ingress -n transcripthub
```

Để kiểm nghiệm liên kết và sử dụng tên miền ảo:
1. Lấy IP của Minikube: `minikube ip`
2. Thêm bản ghi phân giải tên miền vào file `/etc/hosts` (hoặc `C:\Windows\System32\drivers\etc\hosts` trên Windows):
   ```text
   <minikube_ip> transcripthub.local
   ```
3. Chạy cổng kết nối: `minikube tunnel`
4. Truy cập trình duyệt tại địa chỉ: `http://transcripthub.local` để trải nghiệm phiên bản code mới nhất vừa được GitHub Actions tự động triển khai thành công.
