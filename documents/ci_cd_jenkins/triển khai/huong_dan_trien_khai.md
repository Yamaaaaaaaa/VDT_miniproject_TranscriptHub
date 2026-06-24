# Hướng dẫn Triển khai CI/CD với Jenkins, Docker và Kubernetes (Minikube)

Tài liệu này cung cấp hướng dẫn từng bước để thiết lập và chạy thực tế quy trình CI/CD tự động cho dự án **TranscriptHub** trên môi trường local sử dụng **Jenkins**, **Docker**, và cụm **Kubernetes (Minikube)**.

---

## 1. Chuẩn bị môi trường cài đặt

Trước khi bắt đầu, hãy đảm bảo máy tính của bạn đã cài đặt sẵn các công cụ sau:
1. **Docker Desktop**: Để chạy container Jenkins và làm driver cho Minikube.
2. **Minikube**: Trình chạy cụm Kubernetes single-node trên máy cá nhân.
3. **kubectl**: Công cụ dòng lệnh để tương tác với cụm Kubernetes.

---

## 2. Bước 1: Khởi động Minikube

Khởi động cụm Minikube với cấu hình tài nguyên đủ lớn vì hệ thống TranscriptHub gồm nhiều microservices và database, message broker:

```bash
minikube start --driver=docker --memory=6144 --cpus=4
```
* **Giải thích**: Cấp phát 6GB RAM và 4 Cores CPU cho Minikube để đảm bảo toàn bộ hệ thống không bị treo khi vận hành.

Kích hoạt Addon Ingress trên Minikube để xử lý định tuyến URL:
```bash
minikube addons enable ingress
```

---

## 3. Bước 2: Cài đặt & Cấu hình Jenkins

Chúng ta sẽ chạy Jenkins Server bằng Docker Compose trên máy tính để dễ dàng quản lý.

### 3.1. Tạo tệp `docker-compose.jenkins.yml` tại thư mục gốc dự án:
```yaml
version: '3.8'
services:
  jenkins:
    image: jenkins/jenkins:lts-jdk17
    container_name: jenkins-server
    restart: always
    privileged: true
    user: root
    ports:
      - "8080:8080"
      - "50000:50000"
    volumes:
      - jenkins_data:/var/jenkins_home
      # Ánh xạ Docker socket để Jenkins có thể build Docker Image
      - /var/run/docker.sock:/var/run/docker.sock
      - /usr/bin/docker:/usr/bin/docker
    environment:
      - TZ=Asia/Ho_Chi_Minh

volumes:
  jenkins_data:
```

Chạy lệnh khởi động Jenkins:
```bash
docker compose -f docker-compose.jenkins.yml up -d
```

Truy cập địa chỉ `http://localhost:8080`. Lấy mật khẩu thiết lập ban đầu bằng lệnh:
```bash
docker exec jenkins-server cat /var/jenkins_home/secrets/initialAdminPassword
```
Tiến hành chọn **Install suggested plugins** để cài đặt các plugin mặc định.

### 3.2. Cài đặt các plugin bổ sung
Vào **Manage Jenkins** -> **Plugins** -> **Available Plugins**, tìm kiếm và cài đặt các plugin sau:
1. **Docker Pipeline**: Hỗ trợ build và push Docker images trong pipeline.
2. **Kubernetes CLI**: Cho phép thực thi lệnh `kubectl` với tệp cấu hình bảo mật `kubeconfig` trực tiếp trong pipeline.

### 3.3. Cấu hình Credentials (Thông tin xác thực)
Vào **Manage Jenkins** -> **Credentials** -> **System** -> **Global credentials** và thêm 2 credentials sau:

1. **Docker Hub Credentials**:
   * **Kind**: *Username with password*
   * **ID**: `dockerhub-credentials`
   * **Username**: Tài khoản Docker Hub của bạn.
   * **Password**: Access Token sinh ra từ tài khoản Docker Hub.

2. **Kubernetes Kubeconfig File**:
   * **Kind**: *Secret file*
   * **ID**: `k8s-kubeconfig`
   * **File**: Nhấn Upload và chọn tệp config của cụm K8s (mặc định nằm tại `~/.kube/config` trên máy host).
     > [!IMPORTANT]
     > Vì Jenkins đang chạy bên trong một container Docker, IP của Kubernetes API Server trong file `config` của Minikube thường trỏ tới `127.0.0.1` hoặc IP local. Hãy mở file `~/.kube/config` ra và thay thế địa chỉ `127.0.0.1` thành IP mạng nội bộ của máy tính bạn (ví dụ: `192.168.x.x` hoặc IP card mạng ảo `host.docker.internal`) để container Jenkins có thể kết nối được tới Minikube.

---

## 4. Bước 3: Tạo các tệp cấu hình Kubernetes YAML cho dự án

Tạo thư mục `k8s` trong dự án để chứa các tệp cấu hình triển khai Kubernetes:

### 4.1. Tạo Namespace và ConfigMap chung (`k8s/init-config.yaml`)
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

### 4.2. Tạo Deployment & Service cho Microservice mẫu (ví dụ: `k8s/users-service.yaml`)
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

### 4.3. Tạo Deployment & Service cho Frontend (`k8s/frontend-service.yaml`)
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

### 4.4. Cấu hình Ingress định tuyến (`k8s/ingress.yaml`)
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
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api-gateway-service
            port:
              number: 3000
```

---

## 5. Bước 4: Viết Jenkinsfile tích hợp Kubernetes (Minikube)

Dưới đây là tệp `Jenkinsfile.k8s` (bạn có thể lưu thành tệp tin mới tại thư mục gốc) thực hiện đầy đủ quy trình: Lint & Test -> Build Docker Image -> Deploy trực tiếp lên Minikube bằng `kubectl`.

```groovy
pipeline {
    agent any

    environment {
        DOCKER_CREDS_ID   = 'dockerhub-credentials'
        K8S_CREDS_ID      = 'k8s-kubeconfig' // Khớp với ID Credentials của Kubeconfig
        DOCKER_REGISTRY   = 'docker.io'
        DOCKER_USER       = 'yourusername' // Thay bằng tên tài khoản Docker Hub của bạn
        IMAGE_TAG         = "${env.BUILD_NUMBER}"
    }

    options {
        timeout(time: 1, unit: 'HOURS')
        buildDiscarder(logRotator(numToKeepStr: '10'))
        disableConcurrentBuilds()
    }

    stages {
        // Stage 1: Kiểm thử mã nguồn
        stage('Lint & Unit Test') {
            parallel {
                stage('Test Backend') {
                    steps {
                        dir('services_ms') {
                            sh 'npm ci'
                            sh 'npx prisma generate'
                            sh 'npm run lint'
                            sh 'npm run test:e2e -- --passWithNoTests'
                        }
                    }
                }
                stage('Test Frontend') {
                    steps {
                        dir('fe_next') {
                            sh 'npm ci'
                            sh 'npm run build'
                        }
                    }
                }
            }
            post {
                always {
                    echo 'Publishing JUnit Test Reports...'
                    junit 'services_ms/test-reports/*.xml'
                }
            }
        }

        // Stage 2: Đóng gói và Push Docker Image
        stage('Docker Build & Push') {
            steps {
                script {
                    withCredentials([usernamePassword(credentialsId: env.DOCKER_CREDS_ID, 
                                                      usernameVariable: 'DOCKER_USER_VAR', 
                                                      passwordVariable: 'DOCKER_PASS_VAR')]) {
                        sh "echo \$DOCKER_PASS_VAR | docker login -u \$DOCKER_USER_VAR --password-stdin ${env.DOCKER_REGISTRY}"
                    }

                    parallel(
                        "users-service": {
                            sh "docker build -t ${env.DOCKER_USER}/transcripthub-users:${env.IMAGE_TAG} -t ${env.DOCKER_USER}/transcripthub-users:latest -f services_ms/apps/users/Dockerfile --target production services_ms"
                            sh "docker push ${env.DOCKER_USER}/transcripthub-users:${env.IMAGE_TAG}"
                            sh "docker push ${env.DOCKER_USER}/transcripthub-users:latest"
                        },
                        "frontend": {
                            sh "docker build -t ${env.DOCKER_USER}/transcripthub-frontend:${env.IMAGE_TAG} -t ${env.DOCKER_USER}/transcripthub-frontend:latest -f fe_next/Dockerfile fe_next"
                            sh "docker push ${env.DOCKER_USER}/transcripthub-frontend:${env.IMAGE_TAG}"
                            sh "docker push ${env.DOCKER_USER}/transcripthub-frontend:latest"
                        }
                    )
                }
            }
        }

        // Stage 3: Triển khai lên cụm Kubernetes (Minikube)
        stage('Deploy to Kubernetes') {
            steps {
                script {
                    // Sử dụng plugin Kubernetes CLI nạp file cấu hình kubeconfig
                    withKubeConfig([credentialsId: env.K8S_CREDS_ID]) {
                        echo 'Applying Kubernetes Manifests...'
                        // Áp dụng các cấu hình khởi tạo
                        sh "kubectl apply -f k8s/init-config.yaml"
                        sh "kubectl apply -f k8s/users-service.yaml"
                        sh "kubectl apply -f k8s/frontend-service.yaml"
                        sh "kubectl apply -f k8s/ingress.yaml"

                        echo 'Updating images to Kubernetes Deployment...'
                        // Thực hiện cập nhật động Image tag vừa build
                        sh "kubectl set image deployment/users-service users-service=${env.DOCKER_USER}/transcripthub-users:${env.IMAGE_TAG} -n transcripthub"
                        sh "kubectl set image deployment/frontend frontend=${env.DOCKER_USER}/transcripthub-frontend:${env.IMAGE_TAG} -n transcripthub"
                        
                        echo 'Checking Deployment status...'
                        sh "kubectl rollout status deployment/users-service -n transcripthub"
                        sh "kubectl rollout status deployment/frontend -n transcripthub"
                    }
                }
            }
        }
    }

    post {
        always {
            echo 'Cleaning local images on Jenkins Runner...'
            sh "docker rmi \$(docker images | grep '${env.DOCKER_USER}/transcripthub' | awk '{print \$3}') -f || true"
        }
    }
}
```

---

## 6. Bước 5: Chạy thử và xác minh kết quả

1. Tạo một Job **Pipeline** mới trên Jenkins có tên `TranscriptHub-K8s-Pipeline` và trỏ vào Git Repository của bạn chứa file `Jenkinsfile.k8s` (như cách cấu hình trong tài liệu tổng quan Jenkins).
2. Nhấn **Build Now** để kích hoạt pipeline chạy thủ công lần đầu.
3. Khi pipeline hoàn thành thành công, mở Terminal trên máy tính của bạn và kiểm tra trạng thái trên cụm Minikube:
   ```bash
   kubectl get pods -n transcripthub
   kubectl get svc -n transcripthub
   kubectl get ingress -n transcripthub
   ```

### 6.1. Truy cập ứng dụng qua Domain ảo
1. Lấy địa chỉ IP Ingress của Minikube:
   ```bash
   minikube ip
   ```
2. Mở tệp tin `hosts` trên máy tính của bạn:
   - Trên **Windows**: Chạy Notepad dưới quyền Administrator và mở file `C:\Windows\System32\drivers\etc\hosts`.
   - Trên **macOS/Linux**: Chạy lệnh `sudo nano /etc/hosts`.
3. Thêm dòng cấu hình sau (thay thế `<minikube_ip>` bằng kết quả lệnh `minikube ip` vừa lấy):
   ```text
   <minikube_ip> transcripthub.local
   ```
4. Chạy lệnh kích hoạt kết nối tới Ingress (giữ Terminal này chạy liên tục):
   ```bash
   minikube tunnel
   ```
5. Mở trình duyệt web và truy cập hệ thống tại: `http://transcripthub.local`
   * Toàn bộ traffic gửi tới `http://transcripthub.local/` sẽ được Ingress định tuyến tới Next.js Frontend.
   * Các request gửi tới `http://transcripthub.local/api/` sẽ được định tuyến tự động vào API Gateway.

### 6.2. Xem Báo cáo Kết quả Kiểm thử (JUnit Test Report)
Sau khi Pipeline hoàn thành, bạn có thể xem báo cáo kiểm thử trực quan trên Jenkins:
1. Truy cập vào Build mới nhất của Pipeline trên Jenkins.
2. Bạn sẽ thấy một mục mới tên là **Test Result** kèm biểu đồ xu hướng kết quả kiểm thử (Test Result Trend).
3. Click vào **Test Result** để xem chi tiết danh sách các test case (bao gồm cả Unit Test và E2E Test) đã chạy thành công hoặc thất bại, cũng như log chi tiết lỗi tương ứng.
