# Hướng dẫn Thiết kế và Triển khai trên Kubernetes (Minikube) cho TranscriptHub

Tài liệu này hướng dẫn chi tiết cách chuyển đổi hạ tầng của dự án **TranscriptHub** từ Docker Compose sang **Kubernetes (K8s)**, tập trung vào môi trường kiểm thử local bằng **Minikube**.

---

## 1. Giới thiệu về Kubernetes & Minikube

Khi dự án phát triển lớn và cần chạy trên môi trường Production thực tế, Docker Compose sẽ bộc lộ các hạn chế về giám sát container, tự động mở rộng (auto-scaling) và tự phục hồi (self-healing). **Kubernetes** ra đời để giải quyết những vấn đề này.

```mermaid
graph TD
    Client[Client Browser] --> Ingress[Ingress Controller]
    Ingress -- / --> FE[Frontend Pods]
    Ingress -- /api/* --> APIGW[API Gateway Pods]
    APIGW -- TCP/gRPC --> US[Users Service Pods]
    APIGW -- TCP/gRPC --> IS[Identity Service Pods]
    APIGW -- TCP/gRPC --> FS[File Service Pods]
    US & IS & FS --> DB[(PostgreSQL StatefulSet)]
```

### 1.1. Tại sao chuyển từ Docker Compose sang Kubernetes?
* **Tự phục hồi (Self-healing)**: Nếu một microservice bị crash hoặc bị treo, K8s sẽ tự động khởi động lại Pod đó (thay thế container lỗi).
* **Tự động mở rộng (Auto-scaling)**: Tự tăng/giảm số lượng bản sao (Replicas) của API Gateway hoặc Frontend dựa trên tải thực tế (CPU/RAM).
* **Rolling Update (Zero-downtime)**: Cập nhật ứng dụng mà không gây gián đoạn dịch vụ bằng cách thay thế dần từng Pod cũ bằng Pod mới.
* **Quản lý cấu hình tập trung**: Sử dụng **ConfigMap** và **Secret** thay vì tệp `.env` phân mảnh trên từng VPS.

### 1.2. Minikube là gì?
**Minikube** là một công cụ mã nguồn mở cho phép bạn chạy một cụm (cluster) Kubernetes đơn-node (single-node) ngay trên máy tính cá nhân. Đây là môi trường lý tưởng để lập trình viên thử nghiệm các file cấu hình YAML trước khi triển khai lên các dịch vụ K8s đám mây thực tế (AWS EKS, Google GKE, Azure AKS).

---

## 2. Bản đồ Tài nguyên Kubernetes (K8s Resources) cho TranscriptHub

Để chạy toàn bộ hệ thống TranscriptHub trên K8s, mã nguồn sẽ được chia thành các tài nguyên K8s tiêu chuẩn sau:

### 2.1. Nhóm Dịch vụ Lưu trạng thái (Stateful Services)
Đối với cơ sở dữ liệu và hàng đợi tin nhắn (message broker), ta cần lưu dữ liệu lâu dài ngay cả khi container bị xóa/khởi động lại:
* **PostgreSQL & Redis & MinIO**: Sử dụng **StatefulSet** kết hợp với **PersistentVolume (PV)** và **PersistentVolumeClaim (PVC)** để lưu dữ liệu database cố định trên ổ đĩa vật lý của host.
* **Apache Kafka & Zookeeper**: Triển khai bằng StatefulSet để đảm bảo tính nhất quán của ID broker mạng nội bộ.

### 2.2. Nhóm Dịch vụ Không trạng thái (Stateless Services)
Các dịch vụ này có thể dễ dàng nhân bản, tắt đi bật lại mà không sợ mất dữ liệu:
* **Microservices Backend (Users, Identity, File, Transcript, Meeting, Collab, API Gateway)**: Sử dụng **Deployment** để cấu hình chạy từ 2 đến 3 Replicas nhằm đảm bảo tính sẵn sàng cao.
* **Frontend Next.js**: Sử dụng **Deployment** để phục vụ giao diện người dùng.

### 2.3. Nhóm Kết nối Mạng & Định tuyến
* **K8s Services**:
  * **ClusterIP**: Dành cho các giao tiếp nội bộ giữa các microservices (ví dụ: API Gateway gọi Users Service thông qua service name `http://users-service:3001`).
  * **NodePort / LoadBalancer**: Dành cho các cổng cần mở ra ngoài (chỉ dùng tạm thời ở local).
* **Ingress Controller (Nginx)**: Đóng vai trò là reverse proxy tiếp nhận duy nhất lưu lượng truy cập từ ngoài Internet trên cổng 80/443 và định tuyến thông minh:
  * `/` -> Định tuyến về Next.js Frontend.
  * `/api/*` -> Định tuyến về API Gateway.
  * `/socket.io/*` -> Định tuyến về Collab Gateway (WebSocket).

---

## 3. Hướng dẫn các bước Triển khai chi tiết trên Minikube

### Bước 1: Khởi động Minikube
Cài đặt Minikube và chạy lệnh khởi động cụm với driver thích hợp (ví dụ: Docker):
```bash
minikube start --driver=docker --memory=6144 --cpus=4
```
*(Cấp tối thiểu 6GB RAM và 4 Cores CPU cho máy ảo Minikube vì hệ thống của bạn chạy 9 dịch vụ microservices cùng database, Kafka).*

### Bước 2: Sử dụng Docker daemon của Minikube để build image (Không cần đẩy lên Docker Hub)
Để Minikube trực tiếp nhận diện các Docker Image của bạn mà không cần bạn phải push lên Docker Hub rồi tải về:
```bash
# Trên Linux/macOS:
eval $(minikube docker-env)

# Trên Windows PowerShell:
minikube docker-env | Invoke-Expression
```
Sau lệnh này, bất kỳ lệnh `docker build` nào bạn chạy ở local sẽ đẩy thẳng image vào bộ nhớ đệm (registry nội bộ) của Minikube.

Tiến hành build ảnh cho backend và frontend:
```bash
# Build Frontend
cd fe_next
docker build -t transcripthub-frontend:latest .

# Build Backend Microservices
cd ../services_ms
docker build -t transcripthub-api-gateway:latest -f apps/api-gateway/Dockerfile --target production .
docker build -t transcripthub-users:latest -f apps/users/Dockerfile --target production .
docker build -t transcripthub-identity:latest -f apps/identity/Dockerfile --target production .
docker build -t transcripthub-file:latest -f apps/file/Dockerfile --target production .
docker build -t transcripthub-transcript:latest -f apps/transcript/Dockerfile --target production .
docker build -t transcripthub-meeting:latest -f apps/meeting/Dockerfile --target production .
docker build -t transcripthub-collab:latest -f apps/collab/Dockerfile --target production .
docker build -t transcripthub-collab-gateway:latest -f apps/collab-gateway/Dockerfile apps/collab-gateway
```

### Bước 3: Tạo Namespace & Cấu hình ConfigMaps / Secrets
Tạo một không gian tên riêng biệt để quản lý dự án:
```bash
kubectl create namespace transcripthub
```

Tạo tệp `k8s-configmap.yaml` lưu cấu hình chung (ví dụ):
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: transcripthub-config
  namespace: transcripthub
data:
  DATABASE_HOST: "postgres-db-service"
  REDIS_HOST: "redis-service"
  KAFKA_BOOTSTRAP_SERVERS: "kafka-service:9092"
  MINIO_ENDPOINT: "minio-service"
```
Apply vào K8s:
```bash
kubectl apply -f k8s-configmap.yaml
```

Tạo Secrets cho các chuỗi nhạy cảm:
```bash
kubectl create secret generic transcripthub-secrets \
  --from-literal=database-password=postgres \
  --from-literal=jwt-secret=th_jwt_s3cr3t_k3y_x9mK2pL8qR4nW6vY1bZ5cE0aF7gH3jN \
  --namespace=transcripthub
```

### Bước 4: Triển khai Cơ sở dữ liệu và Kafka (StatefulSets)
Bạn cần tạo các file YAML định nghĩa:
1. `PersistentVolumeClaim (PVC)` để cấp phát dung lượng ổ cứng.
2. `StatefulSet` để định nghĩa Container PostgreSQL/Redis/Kafka.
3. `Service (ClusterIP)` để các Pod khác kết nối tới DB.

Lệnh deploy:
```bash
kubectl apply -f k8s/postgres.yaml -n transcripthub
kubectl apply -f k8s/redis.yaml -n transcripthub
kubectl apply -f k8s/minio.yaml -n transcripthub
kubectl apply -f k8s/kafka.yaml -n transcripthub
```

### Bước 5: Triển khai các Microservices & Frontend (Deployments)
Sau khi database và message broker đã khởi chạy thành công, ta tiến hành apply các file Deployment của từng dịch vụ.

Ví dụ về file cấu hình YAML của một microservice (`users-deployment.yaml`):
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: users-service
  namespace: transcripthub
spec:
  replicas: 2 # Chạy 2 Pod để dự phòng lỗi
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
        image: transcripthub-users:latest
        imagePullPolicy: Never # Bắt buộc dùng ảnh build ở local của Minikube
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
Apply toàn bộ các Deployment:
```bash
kubectl apply -f k8s/users.yaml -f k8s/identity.yaml -f k8s/api-gateway.yaml -f k8s/frontend.yaml -n transcripthub
```

### Bước 6: Cấu hình Ingress và Định tuyến Tên miền (Domain)
Bật Addon Ingress trên Minikube:
```bash
minikube addons enable ingress
```

Tạo file định tuyến `ingress.yaml`:
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: transcripthub-ingress
  namespace: transcripthub
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/websocket-services: "collab-gateway"
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
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api-gateway-service
            port:
              number: 3000
      - path: /socket.io
        pathType: Prefix
        backend:
          service:
            name: collab-gateway-service
            port:
              number: 3008
```
Apply file ingress:
```bash
kubectl apply -f ingress.yaml -n transcripthub
```

### Bước 7: Truy cập ứng dụng ở local
Lấy địa chỉ IP của Minikube Ingress:
```bash
minikube ip
```
Thêm dòng sau vào file hosts của máy tính (`C:\Windows\System32\drivers\etc\hosts` trên Windows hoặc `/etc/hosts` trên Linux/macOS):
```text
<minikube_ip> transcripthub.local
```
Mở terminal và chạy lệnh mở đường truyền mạng (tunnel) tới Ingress:
```bash
minikube tunnel
```
Giờ đây, bạn có thể mở trình duyệt và truy cập hệ thống tại: `http://transcripthub.local`

---

## 4. Tích hợp K8s vào Jenkins CI/CD Pipeline (Giới thiệu luồng GitOps)

Khi kết hợp Jenkins với Kubernetes, quy trình triển khai sẽ chuyển dịch theo hướng tự động hóa **GitOps** thông qua các bước:

```mermaid
graph LR
    Push[Push Code] --> Jenkins[Jenkins Pipeline]
    Jenkins --> Docker[Build & Push Image]
    Docker --> UpdateYaml[Cập nhật image tag trong YAML/Helm]
    UpdateYaml --> K8s[Apply to Kubernetes]
```

### 4.1. Cách thức hoạt động
1. **Jenkins** thực hiện kiểm thử thành công, build Docker image và gắn nhãn theo số build (ví dụ: `transcripthub-users:v12`).
2. Jenkins đẩy image lên Docker Hub.
3. Jenkins kết nối tới cụm K8s bằng lệnh `kubectl` (thông qua chứng chỉ bảo mật `kubeconfig` được cài đặt trên Jenkins credentials dưới dạng Secret File).
4. Jenkins chạy lệnh cập nhật động phiên bản trên cụm:
   ```bash
   kubectl set image deployment/users-service users-service=docker.io/yourusername/transcripthub-users:v12 -n transcripthub
   ```
5. Kubernetes tự động thực hiện **Rolling Update**: Khởi động Pod mới chạy ảnh `v12`, khi Pod mới chuyển sang trạng thái Ready (sẵn sàng), K8s mới tiến hành tắt và xóa Pod cũ. Đảm bảo toàn bộ quá trình cập nhật không gây downtime cho người dùng.

### 4.2. Helm Chart (Công cụ quản lý gói trên K8s)
Khi số lượng file YAML của K8s tăng lên quá nhiều (9 dịch vụ x 2 file/dịch vụ = 18 file YAML), việc quản lý thủ công bằng lệnh `kubectl apply` trở nên khó khăn. 

Trong tương lai, bạn nên cấu hình thêm **Helm Chart** để đóng gói toàn bộ cấu hình K8s của TranscriptHub vào một thư mục template duy nhất, cho phép cài đặt/cập nhật toàn bộ hệ thống bằng một lệnh duy nhất:
```bash
helm upgrade --install transcripthub ./helm-charts --set global.image.tag=v12
```
