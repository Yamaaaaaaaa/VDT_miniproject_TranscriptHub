# BÁO CÁO TUẦN 6

## MỤC LỤC

- [NỘI DUNG TỔNG HỢP](#nội-dung-tổng-hợp)
- [PHẦN 1: LỘ TRÌNH HỌC TẬP](#phần-1-lộ-trình-học-tập)
- [PHẦN 2: TIẾN ĐỘ DỰ ÁN TRANSCRIPTHUB](#phần-2-tiến-độ-dự-án-transcripthub)
  - [2.1 Docker — Đóng gói toàn bộ microservice](#21-docker--đóng-gói-toàn-bộ-microservice)
  - [2.2 Kubernetes — Điều phối hệ thống lên GCP](#22-kubernetes--điều-phối-hệ-thống-lên-gcp)
  - [2.3 CI/CD với GitHub Actions](#23-cicd-với-github-actions)

---

## NỘI DUNG TỔNG HỢP

Tuần 6 tập trung vào tầng **DevOps & Triển khai**:

**Phần học tập (2 buổi chính):**
- **Kubernetes (K8s):** Tổng quan kiến trúc K8s (Control Plane, Worker Node, etcd), các workload (Deployment, StatefulSet, DaemonSet), Service types (ClusterIP, NodePort, LoadBalancer), Ingress, ConfigMap/Secret và thực hành trên GCP GKE.
- **CI/CD:** Giới thiệu CI/CD pipeline, các công cụ phổ biến (GitHub Actions, GitLab CI, Jenkins, ArgoCD), thiết kế pipeline chất lượng với automated test + build + deploy.

**Phần dự án:** Đóng gói toàn bộ 8 microservice bằng Docker multi-stage build, viết đầy đủ manifest Kubernetes (Deployment, Service, Ingress, ConfigMap, migrate Job), triển khai lên GCP GKE và thiết lập pipeline CI/CD tự động với GitHub Actions.

---

## PHẦN 1: LỘ TRÌNH HỌC TẬP

| Buổi học | Môn học / Chủ đề | Nội dung chi tiết |
|----------|-----------------|-------------------|
| **Buổi 1** | Kubernetes (K8s) | - Tổng quan Kubernetes: Tại sao cần K8s sau khi có Docker? <br>- Kiến trúc K8s: Control Plane (API Server, Scheduler, Controller Manager, etcd) và Worker Node (kubelet, kube-proxy, Container Runtime). <br>- Các K8s object: Pod, Deployment (rolling update), StatefulSet, DaemonSet. <br>- Networking: Service (ClusterIP/NodePort/LoadBalancer), Ingress + Ingress Controller (Nginx). <br>- Configuration: ConfigMap, Secret. <br>- Storage: PersistentVolume (PV), PersistentVolumeClaim (PVC). <br>- Lợi ích: Self-healing, Auto-scaling (HPA), Zero-downtime deployment. <br>- Thực hành: Deploy ứng dụng đơn giản lên cluster K8s local (minikube) và trên GCP GKE. |
| **Buổi 2** | CI/CD | - Giới thiệu CI (Continuous Integration) và CD (Continuous Delivery / Deployment). <br>- Lợi ích: Phát hiện lỗi sớm, rút ngắn release cycle, giảm rủi ro triển khai. <br>- Các công cụ: GitHub Actions, GitLab CI/CD, Jenkins, CircleCI, ArgoCD (GitOps). <br>- Thiết kế pipeline chất lượng: Lint → Unit Test → Build Image → Push Registry → Deploy. <br>- Branch strategy: Trunk-based Development, GitFlow, Feature Branch. <br>- Thực hành: Viết GitHub Actions workflow tự động test và deploy TranscriptHub. |

---

## PHẦN 2: TIẾN ĐỘ DỰ ÁN TRANSCRIPTHUB

### 2.1 Docker — Đóng gói toàn bộ microservice

Mỗi microservice được đóng gói bằng **Dockerfile multi-stage build** để giảm kích thước image production và tăng bảo mật:

#### Mẫu Dockerfile cho NestJS service

```dockerfile
# === Stage 1: Build ===
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build identity      # Chỉ build service cần thiết

# === Stage 2: Production ===
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Chỉ copy production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy build artifacts từ stage 1
COPY --from=builder /app/dist/apps/identity ./dist/apps/identity
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 4000
CMD ["node", "dist/apps/identity/main"]
```

**Kết quả:** Image production ~180MB thay vì ~900MB nếu không dùng multi-stage.

#### Docker Compose cho môi trường local

```yaml
# docker-compose.yml (tóm tắt)
services:
  postgres:
    image: postgres:16-alpine
    volumes: [postgres_data:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine

  kafka:
    image: bitnami/kafka:3.7
    environment:
      KAFKA_CFG_PROCESS_ROLES: broker,controller

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"

  api-gateway:
    build: { context: ./services_ms, dockerfile: apps/api-gateway/Dockerfile }
    depends_on: [postgres, redis, kafka]
    ports: ["3000:3000"]

  identity:    { depends_on: [postgres, redis] }
  users:       { depends_on: [postgres] }
  file:        { depends_on: [postgres, minio, kafka] }
  meeting:     { depends_on: [postgres, kafka] }
  transcript:  { depends_on: [postgres, kafka] }
  collab:      { depends_on: [postgres, redis] }
  collab-gateway: { ports: ["8080:8080"] }
  frontend:    { build: ./fe_next, ports: ["4000:3000"] }
```

---

### 2.2 Kubernetes — Điều phối hệ thống lên GCP

#### Cấu trúc manifest K8s

```
k8s/
├── configmap.yaml                   ← Biến môi trường dùng chung
├── infrastructure/                  ← PostgreSQL, Redis, Kafka, MinIO trên K8s
└── apps/
    ├── api-gateway-service.yaml     ← Deployment + Service (LoadBalancer)
    ├── identity-service.yaml        ← Deployment + Service (ClusterIP)
    ├── users-service.yaml
    ├── file-service.yaml
    ├── meeting-service.yaml
    ├── transcript-service.yaml
    ├── collab-service.yaml
    ├── collab-gateway-service.yaml
    ├── frontend-service.yaml
    ├── ingress.yaml                 ← Nginx Ingress Controller
    └── migrate-job.yaml             ← Prisma migrate Job (chạy 1 lần)
```

#### Cấu hình Deployment mẫu (Identity Service)

```yaml
# identity-service.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: identity-service
spec:
  replicas: 2
  selector:
    matchLabels: { app: identity-service }
  template:
    spec:
      containers:
      - name: identity-service
        image: gcr.io/PROJECT_ID/identity-service:latest
        ports: [{ containerPort: 4000 }]
        envFrom:
        - configMapRef: { name: transcripthub-config }
        - secretRef:    { name: transcripthub-secrets }
        resources:
          requests: { cpu: 100m, memory: 128Mi }
          limits:   { cpu: 500m, memory: 512Mi }
        readinessProbe:
          httpGet: { path: /health, port: 4000 }
          initialDelaySeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: identity-service
spec:
  selector: { app: identity-service }
  ports: [{ port: 4000, targetPort: 4000 }]
  type: ClusterIP
```

#### Ingress — Định tuyến traffic từ Internet

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: transcripthub-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/proxy-body-size: "100m"
spec:
  rules:
  - host: transcripthub.example.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service: { name: api-gateway-service, port: { number: 3000 } }
      - path: /collab
        pathType: Prefix
        backend:
          service: { name: collab-gateway-service, port: { number: 8080 } }
      - path: /
        pathType: Prefix
        backend:
          service: { name: frontend-service, port: { number: 3000 } }
```

#### Migrate Job (Chạy Prisma migrate khi deploy)

```yaml
# migrate-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: prisma-migrate
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: migrate
        image: gcr.io/PROJECT_ID/identity-service:latest
        command: ["npx", "prisma", "migrate", "deploy"]
        envFrom:
        - configMapRef: { name: transcripthub-config }
        - secretRef:    { name: transcripthub-secrets }
```

---

### 2.3 CI/CD với GitHub Actions

Dự án sử dụng hai workflow riêng biệt để tách biệt giai đoạn kiểm thử và triển khai.

#### CI Workflow (ci.yml) — Chạy trên mọi Pull Request

```
Trigger: push to main / pull_request

Jobs:
  lint-and-test:
    - Checkout code
    - Setup Node.js 20
    - npm ci (cache node_modules)
    - Run ESLint (npm run lint)
    - Run unit tests (npm run test)
    - Upload test coverage report

  build-check:
    - Build tất cả services (npm run build)
    - Kiểm tra Docker image build thành công
```

#### CD Workflow (cd.yml) — Chạy khi merge vào main

```
Trigger: push to main (sau khi CI pass)

Jobs:
  build-and-push:
    - Checkout code
    - Authenticate với GCP (google-github-actions/auth)
    - Configure Docker để push lên GCR
    - Build & tag image: gcr.io/PROJECT_ID/SERVICE:${{ github.sha }}
    - Push image lên Google Container Registry

  deploy-to-gke:
    needs: [build-and-push]
    - Setup kubectl + kubeconfig cho GKE cluster
    - Cập nhật image tag trong deployment:
        kubectl set image deployment/api-gateway \
          api-gateway=gcr.io/PROJECT_ID/api-gateway:$SHA
    - Rolling update tự động (zero-downtime)
    - Chờ rollout hoàn tất:
        kubectl rollout status deployment/api-gateway
```

#### Kết quả đạt được

| Chỉ số | Giá trị |
|--------|---------|
| Thời gian CI pipeline | ~4 phút |
| Thời gian CD pipeline | ~8 phút |
| Zero-downtime deploy | ✅ (Rolling update K8s) |
| Tự động rollback khi lỗi | ✅ (readinessProbe fail → K8s giữ pod cũ) |
| Image size sau multi-stage | ~180MB/service |
