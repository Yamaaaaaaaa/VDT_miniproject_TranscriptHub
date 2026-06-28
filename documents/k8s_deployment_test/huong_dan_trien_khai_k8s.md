# Hướng Dẫn Triển Khai Toàn Diện TranscriptHub Trên Kubernetes
## (Môi trường Minikube/GCP VM & Tự động hóa CI/CD qua GitHub Actions)

Tài liệu này cung cấp quy trình triển khai chuẩn hóa từng bước (end-to-end) cho dự án **TranscriptHub** trên hai môi trường: Kiểm thử cục bộ (**Minikube**) và Môi trường thực tế (**Máy ảo GCP VM**), kết hợp bảo mật biến môi trường, CI/CD qua GitHub Actions (tuân thủ nguyên tắc Shift Left & Quality Gate), và giám sát hệ thống bằng Helm.

---

## MỤC LỤC
1. [Bước 1: Chuẩn bị Hạ tầng (Minikube Local / GCP VM k3s)](#1-bước-1-chuẩn-bị-hạ-tầng-minikube-local--gcp-vm-k3s)
2. [Bước 2: Xử lý Biến môi trường & Bảo mật (Env & Secrets)](#2-bước-2-xử-lý-biến-môi-trường--bảo-mật-env--secrets)
3. [Bước 3: Triển khai Cơ sở dữ liệu & Message Broker (StatefulSets)](#3-bước-3-triển-khai-cơ-sở-dữ-liệu--message-broker-statefulsets)
4. [Bước 4: Thiết lập CI/CD Pipeline với GitHub Actions](#4-bước-4-thiết-lập-cicd-pipeline-với-github-actions)
5. [Bước 5: Triển khai Ứng dụng & Định tuyến Ingress (Stateless)](#5-bước-5-triển-khai-ứng-dụng--định-tuyến-ingress-stateless)
6. [Bước 6: Triển khai Hạ tầng Giám sát & Logs tập trung (Helm)](#6-bước-6-triển-khai-hạ-tầng-giám-sát--logs-tập-trung-helm)
7. [Bước 7: Xác minh, Định tuyến Local/Domain & Kiểm tra](#7-bước-7-xác-minh-định-tuyến-localdomain--kiểm-tra)

---

## 1. Bước 1: Chuẩn bị Hạ tầng (Minikube Local / GCP VM k3s)

Để chạy toàn bộ hệ thống gồm 9 microservices, database, Kafka, Redis, MinIO và stack giám sát, cấu hình tài nguyên phần cứng tối thiểu cần **8 GB RAM** và **2 vCPUs** (Khuyên dùng 4 vCPUs). 

### PHƯƠNG ÁN A: Triển khai Local với Minikube

#### 1.1. Khởi chạy cụm Minikube
Mở terminal và khởi chạy Minikube với driver Docker và cấu hình tài nguyên tối ưu:
```bash
minikube start --driver=docker --memory=8192 --cpus=4 --disk-size=30g
```
> [!TIP]
> Nếu máy tính vật lý của bạn có RAM lớn (ví dụ từ 24GB trở lên), nên cấu hình `--memory=12288` (12 GB) hoặc `--memory=16384` (16 GB) để giảm tải và ngăn ngừa lỗi Out-Of-Memory (OOM) khi chạy toàn bộ hệ thống.

#### 1.2. Kích hoạt Addon Ingress Controller (Nginx)
Kích hoạt Ingress để xử lý phân giải tên miền ảo và định tuyến URL:
```bash
minikube addons enable ingress
```

#### 1.3. Cài đặt Helm CLI
Đảm bảo máy tính của bạn đã cài đặt Helm.
* **Trên Windows (qua Chocolatey/Scoop)**:
  ```powershell
  choco install kubernetes-helm
  # Hoặc
  scoop install helm
  ```
* **Trên macOS/Linux**:
  ```bash
  brew install helm
  ```

---

### PHƯƠNG ÁN B: Triển khai trên máy ảo GCP VM (k3s)
Đối với máy ảo GCP (Compute Engine VM Instance chạy Ubuntu 22.04 LTS), sử dụng **k3s** là giải pháp Kubernetes gọn nhẹ, tối ưu bộ nhớ nhất (tiêu tốn rất ít RAM so với chạy Minikube).

#### 1.1. Chuẩn bị cấu hình VM trên GCP Console:
* **Machine Type**: Chọn series **E2**, cấu hình **e2-standard-2** (2 vCPU, 8 GB RAM) hoặc cao hơn.
* **Boot Disk**: Ubuntu 22.04 LTS, dung lượng tối thiểu **40 GB Balanced Persistent Disk**.
* **Firewall**: Tích chọn **Allow HTTP traffic** và **Allow HTTPS traffic** (Mở cổng 80 & 443).

#### 1.2. Cấu hình Firewall Rule bổ sung trên GCP:
Mở cổng `6443` (Kubernetes API server) nếu muốn GitHub Actions runner kết nối từ bên ngoài bằng file Kubeconfig.
* Vào **VPC Network** $\rightarrow$ **Firewall** $\rightarrow$ **Create Firewall Rule**.
* Thiết lập: Name: `allow-k8s-api`, Target tags: `transcripthub-ports`, Source IPv4 range: `0.0.0.0/0`, TCP: `6443`.
* Nhấp **Create** và thêm tag `transcripthub-ports` vào VM instance.

#### 1.3. Kết nối SSH vào máy ảo GCP:
* **Qua GCP Web Console**: Nhấp vào nút **SSH** ở danh sách VM instance trên GCP Console.
* **Qua terminal cục bộ**: Sử dụng SSH key để kết nối trực tiếp:
  ```bash
  ssh -i <path-to-private-key> <username>@<external-ip-gcp-vm>
  ```

#### 1.4. Cài đặt k3s trên máy ảo:
Chạy lệnh cài đặt k3s (với cờ `--disable traefik` để sử dụng Ingress Nginx đồng nhất với local):
```bash
# Cài đặt k3s không dùng Traefik (để dùng Nginx Ingress)
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable traefik" sh -
```

#### 1.5. Cấu hình phân quyền `kubectl` không cần `sudo`:
Mặc định k3s lưu trữ kubeconfig với quyền của root. Để thuận tiện sử dụng `kubectl` trực tiếp bằng tài khoản user hiện tại:
```bash
# Tạo thư mục lưu cấu hình cục bộ
mkdir -p ~/.kube

# Sao chép tệp cấu hình k3s
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config

# Cấp quyền sở hữu tệp cho user hiện tại
sudo chown $USER:$USER ~/.kube/config

# Thiết lập biến môi trường trỏ tới tệp cấu hình
export KUBECONFIG=~/.kube/config
echo "export KUBECONFIG=~/.kube/config" >> ~/.bashrc
```

**Xác minh trạng thái cụm K8s**:
```bash
kubectl get nodes
```
*(Nếu cụm phản hồi trạng thái máy ảo của bạn là `Ready` tức là cụm K8s đã hoạt động bình thường)*.

#### 1.6. Cài đặt Nginx Ingress Controller trên k3s:
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml
```
*Kiểm tra trạng thái Ingress hoạt động:*
```bash
kubectl get pods -n ingress-nginx
```

#### 1.7. Cài đặt Helm CLI trên máy ảo GCP:
```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

#### 1.8. Cài đặt Git & Clone mã nguồn dự án trên máy ảo:
Để lấy toàn bộ mã nguồn và các tệp cấu hình Kubernetes manifests (`k8s/`) về máy ảo, bạn thực hiện cài đặt Git và clone dự án:

```bash
# Cập nhật danh sách gói hệ thống và cài đặt Git
sudo apt-get update
sudo apt-get install -y git

# Clone nhánh dev_js của dự án về máy ảo (thay link GitHub của bạn)
git clone -b dev_js <YOUR_GITHUB_REPOSITORY_URL>

# Di chuyển vào thư mục dự án vừa clone
cd VDT_miniproject_TranscriptHub
```
*(Sau bước này, bạn sẽ đứng ở thư mục gốc của dự án trên máy ảo. Thư mục cấu hình `k8s/` đã sẵn sàng để áp dụng cho các bước tiếp theo).*

---

## 2. Bước 2: Xử lý Biến môi trường & Bảo mật (Env & Secrets)

Nguyên tắc cốt lõi: Không bao giờ commit file chứa mật khẩu nhạy cảm lên Git. Thay vào đó, ta ánh xạ các biến môi trường thành các tài nguyên **ConfigMap** (cấu hình thông thường) và **Secret** (cấu hình nhạy cảm).

### 2.1. Tạo Namespace cho Dự án
Tạo namespace riêng biệt có tên là `transcripthub`:
```bash
kubectl create namespace transcripthub
```

### 2.2. Triển khai ConfigMap chứa thông số chung (`k8s/configmap.yaml`)
Tệp cấu hình chung của hệ thống đã được tạo sẵn tại đường dẫn `k8s/configmap.yaml` trong project. Bạn chỉ cần thực thi lệnh sau để áp dụng nó lên cụm:

```bash
kubectl apply -f k8s/configmap.yaml
```

### 2.3. Tạo Secrets an toàn (Bảo mật tuyệt đối)
> [!WARNING]
> Không nên tạo và commit file `k8s/secrets.yaml` lên repository. Thay vào đó, hãy thực hiện tạo Secret trực tiếp bằng CLI bằng câu lệnh sau:

```bash
kubectl create secret generic transcripthub-secrets \
  --from-literal=database-password="YOUR_DATABASE_PASSWORD" \
  --from-literal=jwt-secret="YOUR_JWT_SECRET_KEY" \
  --from-literal=jwt-refresh-secret="YOUR_JWT_REFRESH_SECRET_KEY" \
  --from-literal=gemini-api-key="YOUR_GEMINI_API_KEY" \
  --from-literal=nextauth-secret="YOUR_NEXTAUTH_SECRET_KEY" \
  -n transcripthub
```

#### 2.3.1. Hướng dẫn cập nhật hoặc sửa đổi Secrets:

Khi hệ thống đang vận hành, nếu bạn muốn thay đổi hoặc cập nhật giá trị của các khóa bí mật (ví dụ: đổi mật khẩu DB, cập nhật Gemini API Key mới), hãy thực hiện theo các cách sau:

##### **Cách 1: Ghi đè toàn bộ Secret bằng câu lệnh mới (Khuyên dùng)**
Để cập nhật lại toàn bộ giá trị mà không cần xóa đi tạo lại làm gián đoạn hệ thống, bạn sử dụng cơ chế `--dry-run` kết hợp `apply`:
```bash
kubectl create secret generic transcripthub-secrets \
  --from-literal=database-password="NEW_DATABASE_PASSWORD" \
  --from-literal=jwt-secret="NEW_JWT_SECRET_KEY" \
  --from-literal=jwt-refresh-secret="NEW_JWT_REFRESH_SECRET_KEY" \
  --from-literal=gemini-api-key="NEW_GEMINI_API_KEY" \
  --from-literal=nextauth-secret="NEW_NEXTAUTH_SECRET_KEY" \
  -n transcripthub \
  --dry-run=client -o yaml | kubectl apply -f -
```

##### **Cách 2: Cập nhật duy nhất một khóa cụ thể (Patch)**
If you only want to change a specific key (e.g., updating `gemini-api-key`) while keeping the others:
1. **Base64 encode the new value** on your machine:
   ```bash
   echo -n "YOUR_NEW_KEY" | base64
   ```
2. **Run the Patch command** to overwrite the encoded value in K8s:
   ```bash
   kubectl patch secret transcripthub-secrets -n transcripthub -p '{"data":{"gemini-api-key":"ENCODED_VALUE"}}'
   ```

> [!IMPORTANT]
> **Yêu cầu khởi động lại ứng dụng (Restart Rollout):**
> Sau khi cập nhật ConfigMap hoặc Secret, các container đang chạy **sẽ không tự động nhận cấu hình mới** vì biến môi trường chỉ được nạp một lần duy nhất lúc khởi động container.
> Bạn bắt buộc phải yêu cầu Kubernetes khởi động lại (restart) các Pod stateless để chúng đọc cấu hình mới:
> ```bash
> # Khởi động lại toàn bộ ứng dụng stateless để nhận key mới
> kubectl rollout restart deployment -n transcripthub
> ```

---

## 3. Bước 3: Triển khai Cơ sở dữ liệu & Message Broker (StatefulSets)

Các dịch vụ lưu trữ cần chạy dưới dạng **StatefulSet** kết hợp với **PersistentVolumeClaim (PVC)** để bảo toàn dữ liệu khi Pod bị tắt hoặc lỗi.
Các tệp tin cấu hình cho lớp hạ tầng đã được tạo sẵn trong project bao gồm:
1. **PostgreSQL** (`k8s/infrastructure/postgres.yaml`)
2. **Redis** (`k8s/infrastructure/redis.yaml`)
3. **MinIO** (`k8s/infrastructure/minio.yaml`) - Đi kèm với Job tự động tạo bucket.
4. **Kafka & Zookeeper** (`k8s/infrastructure/kafka.yaml`)

Để triển khai toàn bộ lớp hạ tầng cơ sở dữ liệu và hàng đợi tin nhắn lên cụm, bạn chạy duy nhất một lệnh sau:

```bash
kubectl apply -f k8s/infrastructure/
```
---

## 4. Bước 4: Thiết lập CI/CD Pipeline với GitHub Actions

Chúng ta cấu hình luồng GitHub Actions theo mô hình **Quality Gate (Shift Left)**: tự động kiểm thử code mới $\rightarrow$ build Docker image $\rightarrow$ quét lỗi bảo mật $\rightarrow$ push lên Docker Hub $\rightarrow$ kết nối và cập nhật image trực tiếp vào cụm K8s.

> [!NOTE]
> Để áp dụng luồng Kubernetes này, bạn cần vô hiệu hóa/xóa file cấu hình deploy Docker Compose cũ (`.github/workflows/ci-cd.yml`) và sử dụng cấu trúc tách biệt dưới đây.

### 4.1. Khai báo Secrets trên GitHub Repository
Thêm các biến Secrets sau vào Action Secrets:
1. `DOCKER_USERNAME`: Tên tài khoản Docker Hub.
2. `DOCKER_PASSWORD`: Personal Access Token từ Docker Hub.
3. `GCP_VM_HOST`: IP máy ảo GCP VM.
4. `GCP_VM_USER`: Tên tài khoản SSH của VM (ví dụ: `ubuntu`).
5. `GCP_SSH_PRIVATE_KEY`: Khóa SSH Private Key dùng để kết nối vào máy ảo GCP.

### 4.2. Cấu trúc Tách biệt Workflows (CI và CD)

Để đảm bảo hiệu quả tối đa và tuân thủ nguyên lý **Shift Left**, chúng ta chia làm 2 file workflow tách biệt:
* **CI Workflow (`ci.yml`)**: Tự động kích hoạt khi có PR và Push vào nhánh `dev_js` nhằm kiểm tra toàn diện chất lượng mã nguồn (Lint, Test, Compile) ở cả 2 phần Frontend và Backend song song.
* **CD Workflow (`cd.yml`)**: Tự động kích hoạt khi push trực tiếp hoặc merge PR vào nhánh `dev_js`. CD Workflow thực hiện build ảnh Docker song song cho 9 dịch vụ (sử dụng Strategy Matrix và GHA Cache), push lên Docker Hub và thực thi deploy an toàn trực tiếp qua SSH tới cụm K8s trên GCP VM.

#### 4.2.1. Cấu hình Continuous Integration (`.github/workflows/ci.yml`)

Tệp này tập trung vào kiểm tra chất lượng mã nguồn, chạy song song 2 job cho Frontend và Backend:

```yaml
name: Continuous Integration (CI)

on:
  push:
    branches: [ dev_js ]
  pull_request:
    branches: [ dev_js ]

jobs:
  # ─── BACKEND CI ──────────────────────────────────────────────────────────
  backend-ci:
    name: Backend CI (NestJS)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: services_ms/package-lock.json

      - name: Install Dependencies
        run: |
          cd services_ms
          npm ci

      - name: Generate Prisma Client
        run: |
          cd services_ms
          npx prisma generate

      - name: Run Linter
        run: |
          cd services_ms
          npm run lint

      - name: Run Unit Tests
        run: |
          cd services_ms
          npm run test

      - name: Build Check
        run: |
          cd services_ms
          npm run build

  # ─── FRONTEND CI ─────────────────────────────────────────────────────────
  frontend-ci:
    name: Frontend CI (Next.js)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: fe_next/package-lock.json

      - name: Install Dependencies
        run: |
          cd fe_next
          npm ci

      - name: Run Linter
        run: |
          cd fe_next
          npm run lint

      - name: Build Next.js App
        run: |
          cd fe_next
          npm run build
        env:
          NEXT_TELEMETRY_DISABLED: 1
```

#### 4.2.2. Cấu hình Continuous Delivery (`.github/workflows/cd.yml`)

Tệp này thực hiện tự động hóa build/push Docker và trigger deployment. Tác vụ build 9 dịch vụ được chạy **song song hoàn toàn** qua `matrix`:

```yaml
name: Continuous Delivery (CD)

on:
  push:
    branches: [ dev_js ]

jobs:
  # ─── RUN QUALITY CHECKS FIRST ────────────────────────────────────────────
  validation:
    name: Run CI Validation
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Set up Node.js (Backend)
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: services_ms/package-lock.json

      - name: Install and Lint Backend
        run: |
          cd services_ms
          npm ci
          npx prisma generate
          npm run lint
          npm run test

      - name: Set up Node.js (Frontend)
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: fe_next/package-lock.json

      - name: Install and Build Frontend
        run: |
          cd fe_next
          npm ci
          npm run lint
          npm run build
        env:
          NEXT_TELEMETRY_DISABLED: 1

  # ─── PARALLEL DOCKER BUILD & PUSH ────────────────────────────────────────
  build-and-push:
    name: Build & Push Images
    needs: validation
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        include:
          - service: api-gateway
            context: ./services_ms
            dockerfile: apps/api-gateway/Dockerfile
            image: transcripthub-api-gateway
          - service: collab
            context: ./services_ms
            dockerfile: apps/collab/Dockerfile
            image: transcripthub-collab
          - service: collab-gateway
            context: ./services_ms/apps/collab-gateway
            dockerfile: Dockerfile
            image: transcripthub-collab-gateway
          - service: file
            context: ./services_ms
            dockerfile: apps/file/Dockerfile
            image: transcripthub-file
          - service: identity
            context: ./services_ms
            dockerfile: apps/identity/Dockerfile
            image: transcripthub-identity
          - service: meeting
            context: ./services_ms
            dockerfile: apps/meeting/Dockerfile
            image: transcripthub-meeting
          - service: transcript
            context: ./services_ms
            dockerfile: apps/transcript/Dockerfile
            image: transcripthub-transcript
          - service: users
            context: ./services_ms
            dockerfile: apps/users/Dockerfile
            image: transcripthub-users
          - service: frontend
            context: ./fe_next
            dockerfile: Dockerfile
            image: transcripthub-frontend

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and Push Docker Image
        uses: docker/build-push-action@v5
        with:
          context: ${{ matrix.context }}
          file: ${{ matrix.context }}/${{ matrix.dockerfile }}
          push: true
          tags: |
            ${{ secrets.DOCKER_USERNAME }}/${{ matrix.image }}:latest
            ${{ secrets.DOCKER_USERNAME }}/${{ matrix.image }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ─── DEPLOY TO GCP KUBERNETES ────────────────────────────────────────────
  deploy-to-k8s:
    name: Deploy to GCP VM (K8s)
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Set up SSH Connection
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.GCP_SSH_PRIVATE_KEY }}

      - name: Register SSH Known Hosts
        run: |
          mkdir -p ~/.ssh
          ssh-keyscan -H ${{ secrets.GCP_VM_HOST }} >> ~/.ssh/known_hosts

      - name: Copy K8s Manifests via SCP
        run: |
          ssh ${{ secrets.GCP_VM_USER }}@${{ secrets.GCP_VM_HOST }} "mkdir -p ~/transcripthub/k8s"
          scp -r k8s/* ${{ secrets.GCP_VM_USER }}@${{ secrets.GCP_VM_HOST }}:~/transcripthub/k8s/

      - name: Execute Deployment & Rolling Update on VM
        run: |
          ssh ${{ secrets.GCP_VM_USER }}@${{ secrets.GCP_VM_HOST }} '
            # 1. Áp dụng Config & Secrets ban đầu
            kubectl apply -f ~/transcripthub/k8s/configmap.yaml -n transcripthub
            
            # 2. Áp dụng các StatefulSet hạ tầng (Postgres, Redis, MinIO, Kafka)
            kubectl apply -f ~/transcripthub/k8s/infrastructure/ -n transcripthub
            
            # 3. Áp dụng toàn bộ Stateless Apps và Ingress định tuyến
            kubectl apply -f ~/transcripthub/k8s/apps/ -n transcripthub
            
            # 4. Thực hiện Rolling Update cập nhật tag ảnh Docker mới nhất (Git Commit SHA)
            kubectl set image deployment/api-gateway-service api-gateway-service=${{ secrets.DOCKER_USERNAME }}/transcripthub-api-gateway:${{ github.sha }} -n transcripthub
            kubectl set image deployment/collab-service collab-service=${{ secrets.DOCKER_USERNAME }}/transcripthub-collab:${{ github.sha }} -n transcripthub
            kubectl set image deployment/collab-gateway collab-gateway=${{ secrets.DOCKER_USERNAME }}/transcripthub-collab-gateway:${{ github.sha }} -n transcripthub
            kubectl set image deployment/file-service file-service=${{ secrets.DOCKER_USERNAME }}/transcripthub-file:${{ github.sha }} -n transcripthub
            kubectl set image deployment/identity-service identity-service=${{ secrets.DOCKER_USERNAME }}/transcripthub-identity:${{ github.sha }} -n transcripthub
            kubectl set image deployment/meeting-service meeting-service=${{ secrets.DOCKER_USERNAME }}/transcripthub-meeting:${{ github.sha }} -n transcripthub
            kubectl set image deployment/transcript-service transcript-service=${{ secrets.DOCKER_USERNAME }}/transcripthub-transcript:${{ github.sha }} -n transcripthub
            kubectl set image deployment/users-service users-service=${{ secrets.DOCKER_USERNAME }}/transcripthub-users:${{ github.sha }} -n transcripthub
            kubectl set image deployment/frontend-service frontend-service=${{ secrets.DOCKER_USERNAME }}/transcripthub-frontend:${{ github.sha }} -n transcripthub
            
            # 5. Đợi rollout hoàn thành thành công (Zero-downtime Verification)
            kubectl rollout status deployment/api-gateway-service -n transcripthub
            kubectl rollout status deployment/collab-service -n transcripthub
            kubectl rollout status deployment/collab-gateway -n transcripthub
            kubectl rollout status deployment/file-service -n transcripthub
            kubectl rollout status deployment/identity-service -n transcripthub
            kubectl rollout status deployment/meeting-service -n transcripthub
            kubectl rollout status deployment/transcript-service -n transcripthub
            kubectl rollout status deployment/users-service -n transcripthub
            kubectl rollout status deployment/frontend-service -n transcripthub
          '
```

---

## 5. Bước 5: Triển khai Ứng dụng & Định tuyến Ingress (Stateless)

Toàn bộ các tệp tin cấu hình triển khai microservices, API Gateway, Next.js Frontend và Ingress đã được định nghĩa sẵn trong thư mục `k8s/apps/` của project.

> [!IMPORTANT]
> **Quy tắc cấu hình Ingress:**
> **Không sử dụng** annotation `nginx.ingress.kubernetes.io/rewrite-target: /` cho API Gateway vì API Gateway của bạn đã được cấu hình hậu tố mặc định là `/api` (qua `setGlobalPrefix('api')`). Việc dùng rewrite target sẽ xóa bỏ thông tin routing dẫn tới lỗi 404.

Để triển khai toàn bộ các ứng dụng không trạng thái (stateless) và thiết lập định tuyến Ingress, bạn chạy duy nhất một lệnh sau:

```bash
kubectl apply -f k8s/apps/
```

---

## 6. Bước 6: Triển khai Hạ tầng Giám sát & Logs tập trung (Helm)

Sử dụng Helm để quản lý tập trung toàn bộ log và metrics của cụm.

### 6.1. Thêm Helm Repositories & Cập nhật
```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

### 6.2. Triển khai Loki Stack (Log tập trung & Grafana)
```bash
helm install loki-stack grafana/loki-stack \
  --namespace transcripthub \
  --set grafana.enabled=true
```

### 6.3. Triển khai Prometheus Stack
Tích hợp metrics vào chung bảng hiển thị Grafana của Loki Stack:
```bash
helm install prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace transcripthub \
  --set grafana.enabled=false
```

---

## 7. Bước 7: Xác minh, Định tuyến Local & Kiểm tra

### 7.1. Cấu hình phân giải Domain ảo trên máy Host
Lấy địa chỉ IP của Ingress Controller:
```bash
minikube ip
```
Mở file `hosts` của máy kiểm thử (`C:\Windows\System32\drivers\etc\hosts` trên Windows hoặc `/etc/hosts` trên Linux/macOS) và thêm dòng cấu hình:
```text
<địa-chỉ-ip-lấy-được-ở-trên> transcripthub.local
```

### 7.2. Kích hoạt Minikube Tunnel (Bắt buộc cho Windows/macOS)
Mở một terminal riêng biệt và chạy:
```bash
minikube tunnel
```

### 7.3. Truy cập ứng dụng & Giám sát hiệu năng
* **Giao diện người dùng**: Mở trình duyệt web truy cập `http://transcripthub.local`
* **Giao diện Giám sát (Grafana)**:
  1. Lấy mật khẩu tài khoản `admin` của Grafana:
     * *Windows (PowerShell)*:
       ```powershell
       [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String((kubectl get secret loki-stack-grafana -n transcripthub -o jsonpath="{.data.admin-password}")))
       ```
     * *Linux/macOS (Bash)*:
       ```bash
       kubectl get secret loki-stack-grafana -n transcripthub -o jsonpath="{.data.admin-password}" | base64 --decode; echo
       ```
  2. Thực hiện Forward cổng dịch vụ Grafana ra máy cục bộ:
     ```bash
     kubectl port-forward svc/loki-stack-grafana 3005:80 -n transcripthub
     ```
  3. Truy cập `http://localhost:3005`, đăng nhập tài khoản `admin` để xem logs/metrics.
