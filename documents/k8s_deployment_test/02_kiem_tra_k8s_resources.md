# Hướng Dẫn Kiểm Tra Tài Nguyên Kubernetes (K8s Resources)

Tài liệu này chứa các câu lệnh `kubectl` và các tiêu chí kiểm tra trực tiếp trạng thái của các tài nguyên Kubernetes đã triển khai trong cụm (Minikube hoặc Production) cho dự án **TranscriptHub**.

---

## 1. Kiểm Tra Không Gian Tên (Namespace)

Mục đích: Đảm bảo toàn bộ dự án TranscriptHub được cô lập trong namespace riêng để tránh xung đột với hệ thống khác.

### Câu lệnh kiểm tra:
```bash
kubectl get ns transcripthub
```

### Kết quả mong đợi:
```text
NAME            STATUS   AGE
transcripthub   Active   3h25m
```
* Trạng thái namespace phải là `Active`.

---

## 2. Kiểm Tra Cấu Hình Chung (ConfigMaps & Secrets)

Mục đích: Đảm bảo các cấu hình và chuỗi bảo mật nhạy cảm đã được nạp đúng vào cơ sở dữ liệu của cụm K8s.

### 2.1. Kiểm tra ConfigMap:
```bash
kubectl get configmap transcripthub-config -n transcripthub -o yaml
```
* **Kết quả mong đợi**: Trả về cấu hình YAML chứa các biến như `DATABASE_HOST`, `REDIS_HOST`, `KAFKA_BOOTSTRAP_SERVERS` khớp với cấu hình trong file `k8s-configmap.yaml`.

### 2.2. Kiểm tra Secrets (Thông tin bảo mật):
```bash
kubectl get secret transcripthub-secrets -n transcripthub
```
* **Kết quả mong đợi**:
  ```text
  NAME                   TYPE     DATA   AGE
  transcripthub-secrets  Opaque   2      3h25m
  ```
  * Trường `DATA` phải hiển thị số lượng key bảo mật tương ứng đã tạo (ví dụ: `database-password`, `jwt-secret`).

### 2.3. Kiểm tra tiêm Biến môi trường vào Pod (Env Injection Verification):
Mục đích: Xác minh rằng các Pods đang chạy thực sự nhận và áp dụng đúng các giá trị cấu hình và mã bí mật từ ConfigMap & Secret làm biến môi trường (env).

#### Các bước thực hiện:
1. Lấy tên một Pod bất kỳ đang hoạt động (ví dụ: `users-service-xxxx`):
   ```bash
   kubectl get pods -n transcripthub -l app=users-service
   ```
2. Thực thi lệnh in ra các biến môi trường trực tiếp từ bên trong container của Pod đó:
   ```bash
   kubectl exec -it <tên-pod-lấy-ở-bước-1> -n transcripthub -- printenv
   ```
   *(Hoặc `env` tùy thuộc vào hệ điều hành nền của image).*
3. Kiểm tra xem các biến môi trường cấu hình và thông tin bảo mật có xuất hiện và có giá trị đúng hay không.

#### Kết quả mong đợi:
* Đầu ra hiển thị danh sách các biến môi trường, trong đó phải xuất hiện các key được tiêm từ ConfigMap và Secret như:
  * `DATABASE_HOST=postgres-db-service`
  * `REDIS_HOST=redis-service`
  * `DATABASE_URL` (chứa mật khẩu được giải mã tự động từ secret `postgres` thay vì dạng mã hóa base64).
  * `JWT_SECRET` (khớp với chuỗi khóa an toàn đã cấu hình).

> [!IMPORTANT]
> **Lưu ý khi cập nhật biến môi trường (K8s Env Gotcha)**:
> Khi bạn chỉnh sửa tệp ConfigMap hoặc Secret và apply lại cụm bằng `kubectl apply -f`, Kubernetes **sẽ không tự động cập nhật** biến môi trường của các Pod đang chạy.
> * Để áp dụng các biến môi trường mới cập nhật, bạn bắt buộc phải thực hiện restart lại Deployment để K8s tái tạo lại các Pod mới:
>   ```bash
>   kubectl rollout restart deployment/users-service -n transcripthub
>   ```

---

## 3. Kiểm Tra Nhóm Dịch Vụ Lưu Trạng Thái (StatefulSets & Storage)

Mục đích: Đảm bảo cơ sở dữ liệu, hàng đợi và storage hoạt động ổn định và có ổ cứng lưu trữ lâu dài (Persistent Volumes).

### 3.1. Kiểm tra trạng thái StatefulSet:
```bash
kubectl get statefulset -n transcripthub
```
* **Kết quả mong đợi**: Danh sách các StatefulSets (`postgres-db`, `redis`, `minio`, `kafka`, `zookeeper`) đều hiển thị trạng thái `READY` đầy đủ (ví dụ: `1/1`).

### 3.2. Kiểm tra trạng thái Lưu trữ (PVC & PV):
```bash
kubectl get pvc -n transcripthub
```
* **Kết quả mong đợi**: Các Yêu cầu Cấp phát Ổ đĩa (PersistentVolumeClaims) phải ở trạng thái `Bound` (Đã liên kết):
  ```text
  NAME                     STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   AGE
  postgres-pvc-postgres-0  Bound    pvc-8bf9cf68-dfc6-47b1-ba91-3e4b3c4f728c   10Gi       RWO            standard       3h25m
  minio-pvc-minio-0        Bound    pvc-c9af7e03-a1bf-4c7c-aa12-7c8b9d0e1f2a   10Gi       RWO            standard       3h25m
  redis-pvc-redis-0        Bound    pvc-f7df6e01-d7cb-4b3b-82cf-9a0b1c2d3e4f   2Gi        RWO            standard       3h25m
  ```
> [!CAUTION]
> Nếu cột `STATUS` hiển thị là `Pending`, Pod database sẽ bị treo ở trạng thái `Pending`. Hãy dùng lệnh `kubectl describe pvc <pvc_name> -n transcripthub` để xem chi tiết lỗi (thường do StorageClass chưa được hỗ trợ trên cụm K8s).

---

## 4. Kiểm Tra Nhóm Dịch Vụ Không Trạng Thái (Deployments & Pods)

Mục đích: Đảm bảo các microservices backend và giao diện frontend Next.js đã chạy đủ số lượng bản sao (Replicas) và không bị lỗi crash.

### 4.1. Kiểm tra trạng thái Deployment:
```bash
kubectl get deployment -n transcripthub
```
* **Kết quả mong đợi**:
  * Các dịch vụ: `frontend`, `api-gateway-service`, `users-service`, `identity-service`, `file-service`, `transcript-service`, `meeting-service`, `collab-service`, `collab-gateway-service`.
  * Cột `READY` hiển thị đầy đủ số lượng replicas thiết kế (ví dụ: `2/2` nếu chạy HA hoặc `1/1` nếu chạy thử local).

### 4.2. Kiểm tra chi tiết trạng thái Pods:
```bash
kubectl get pods -n transcripthub
```
* **Kết quả mong đợi**:
  * Tất cả các Pods phải hiển thị trạng thái `Running`.
  * Cột `RESTARTS` (Số lần khởi động lại) bằng `0` hoặc số rất nhỏ (nếu Pod mới khởi động).
  * Cột `READY` hiển thị `1/1` (hoặc `2/2` đối với pod có container sidecar).

> [!WARNING]
> Nếu Pod ở trạng thái `CrashLoopBackOff` hoặc `ImagePullBackOff`:
> * Xem nhật ký lỗi (logs) của Pod: `kubectl logs <pod_name> -n transcripthub`
> * Xem lịch sử sự kiện lỗi: `kubectl describe pod <pod_name> -n transcripthub`

---

## 5. Kiểm Tra Khả Năng Kết Nối Mạng Nội Bộ (Cluster Services & DNS)

Mục đích: Đảm bảo các microservices có thể tìm thấy nhau thông qua DNS nội bộ của Kubernetes (ví dụ: API Gateway gọi Users Service qua tên miền dịch vụ).

### 5.1. Xem danh sách Services:
```bash
kubectl get svc -n transcripthub
```
* **Kết quả mong đợi**: Mỗi microservice có một Service tương ứng với `TYPE` là `ClusterIP` và được cấp một địa chỉ `CLUSTER-IP` nội bộ.

### 5.2. Kiểm tra phân giải tên miền (DNS Resolution) giữa các Pods:
Chạy lệnh `nslookup` từ bên trong Container API Gateway để kiểm tra DNS dịch vụ `users-service`:
```bash
# Lấy tên Pod API Gateway trước
$POD_NAME = (kubectl get pods -l app=api-gateway -n transcripthub -o jsonpath='{.items[0].metadata.name}')

# Thực thi lệnh kiểm tra DNS
kubectl exec -it $POD_NAME -n transcripthub -- nslookup users-service
```
* **Kết quả mong đợi**: Phân giải tên miền trả về địa chỉ IP của Service `users-service` nội bộ cụm (ví dụ: `10.96.x.x`).

---

## 6. Kiểm Tra Định Tuyến Ingress (External Routing)

Mục đích: Đảm bảo Ingress Controller tiếp nhận traffic từ ngoài Internet và định tuyến đúng tới Frontend, API Gateway và WebSocket.

### 6.1. Kiểm tra tài nguyên Ingress:
```bash
kubectl get ingress -n transcripthub
```
* **Kết quả mong đợi**:
  * Xuất hiện Ingress tên `transcripthub-ingress`.
  * Cột `ADDRESS` hiển thị địa chỉ IP của Ingress Controller (ví dụ: `192.168.49.2` trên Minikube).

### 6.2. Kiểm tra Addon Ingress Nginx (trên Minikube local):
```bash
kubectl get pods -n ingress-nginx
```
* **Kết quả mong đợi**: Pod của Ingress Controller phải đang chạy (`Running`).

### 6.3. Kiểm tra Tunnel định tuyến (dành cho Windows/macOS dùng Minikube):
Trên Windows, Minikube chạy trong mạng ảo cô lập. Bạn cần kích hoạt lệnh sau trên 1 terminal riêng để mở cổng (Giữ terminal này chạy liên tục):
```bash
minikube tunnel
```
* **Xác minh**: Chạy lệnh ping tới domain ảo để đảm bảo kết nối mạng thành công:
  ```bash
  ping transcripthub.local
  ```
  *(Kết quả ping trả về IP của Minikube).*

---

## 7. Kiểm Trả Hạ Tầng Giám Sát & Logging (Cài Đặt Qua Helm)

Mục đích: Sử dụng **Helm** để triển khai nhanh chóng và kiểm tra độ ổn định của stack giám sát (Prometheus, Loki, Promtail, Grafana) trong namespace `transcripthub`.

### 7.1. Cài đặt nhanh bằng Helm CLI (Thực hiện bởi Admin)
Nếu cụm chưa được cài đặt stack giám sát, hãy thực thi các lệnh sau:

```bash
# 1. Thêm các repository chính thức
helm repo add grafana https://grafana.github.io/helm-charts
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# 2. Cài đặt Loki Stack (Bao gồm Loki, Promtail thu thập logs và Grafana UI)
helm install loki-stack grafana/loki-stack \
  --namespace transcripthub \
  --set grafana.enabled=true

# 3. Cài đặt Kube-Prometheus-Stack (Bao gồm Prometheus, Node Exporter, cAdvisor tự động thu thập metrics)
helm install prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace transcripthub \
  --set grafana.enabled=false # Sử dụng chung Grafana của Loki Stack để tiết kiệm tài nguyên
```

### 7.2. Kiểm tra trạng thái các Pod giám sát
Chạy lệnh hiển thị Pods thuộc các service giám sát:
```bash
kubectl get pods -n transcripthub -l "app.kubernetes.io/part-of=member-of-monitoring-stack" || kubectl get pods -n transcripthub
```
* **Kết quả mong đợi**:
  * Pod `loki-stack-0` (StatefulSet của Loki) có trạng thái `Running` (1/1).
  * Pod `loki-stack-promtail-xxxx` (DaemonSet chạy trên mỗi node) có trạng thái `Running` (1/1).
  * Pod `prometheus-prometheus-stack-xxxx` có trạng thái `Running`.
  * Pod `loki-stack-grafana-xxxx` (Giao diện trực quan) có trạng thái `Running`.

### 7.3. Kiểm tra Truy cập Giao diện Grafana

#### Bước 1: Lấy mật khẩu tài khoản `admin` do Helm tự động sinh ra:
* **Trên Linux/macOS (Bash)**:
  ```bash
  kubectl get secret loki-stack-grafana -n transcripthub -o jsonpath="{.data.admin-password}" | base64 --decode; echo
  ```
* **Trên Windows (PowerShell)**:
  ```powershell
  [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String((kubectl get secret loki-stack-grafana -n transcripthub -o jsonpath="{.data.admin-password}")))
  ```

#### Bước 2: Thực hiện Port-Forward từ cụm K8s ra cổng local máy tính:
```bash
kubectl port-forward svc/loki-stack-grafana 3005:80 -n transcripthub
```
*(Giữ terminal này hoạt động liên tục).*

#### Bước 3: Truy cập và Kiểm tra Data Source:
1. Mở trình duyệt và truy cập `http://localhost:3005`.
2. Đăng nhập với tài khoản:
   * **Username**: `admin`
   * **Password**: Mật khẩu lấy được từ Bước 1.
3. Truy cập **Connections** -> **Data Sources** và xác minh:
   * **Loki Data Source**: Đã được tự động thêm cấu hình (đọc từ `http://loki-stack:3100`).
   * **Prometheus Data Source**: Nếu chưa có, thêm thủ công bằng URL `http://prometheus-stack-kube-prom-prometheus:9090`.
4. Vào phần **Explore**, chọn **Loki** và chạy câu truy vấn `{namespace="transcripthub"}` để xác minh log của các microservices đang được đổ về thời gian thực.
