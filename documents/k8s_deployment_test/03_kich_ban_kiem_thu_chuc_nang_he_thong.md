# Kịch Bản Kiểm Thử Tính Năng Hệ Thống Trên Kubernetes

Tài liệu này chứa các kịch bản kiểm thử (Resilience & Integration Test Scenarios) nhằm đảm bảo hệ thống **TranscriptHub** đạt các tiêu chuẩn về tính sẵn sàng cao, tự phục hồi, cập nhật không downtime và tính toàn vẹn dữ liệu khi vận hành trên Kubernetes.

---

## KỊCH BẢN 1: KIỂM THỬ KHẢ NĂNG TỰ PHỤC HỒI (SELF-HEALING TEST)

Mục đích: Đảm bảo khi một Pod microservice bị crash đột ngột, Kubernetes sẽ tự động phát hiện và khởi chạy một bản sao mới thay thế ngay lập tức.

### Các bước thực hiện:
1. Xác định danh sách Pods của dịch vụ `users-service`:
   ```bash
   kubectl get pods -l app=users-service -n transcripthub
   ```
   *(Ghi nhận tên Pod, ví dụ: `users-service-58dcfcb547-abc12`)*
2. Mở một terminal mới và chạy lệnh giám sát Pod liên tục:
   ```bash
   kubectl get pods -n transcripthub -w
   ```
3. Ở terminal chính, giả lập sự cố crash bằng cách xóa Pod của `users-service`:
   ```bash
   kubectl delete pod <tên-pod-ghi-nhận-ở-bước-1> -n transcripthub
   ```
4. Quan sát terminal giám sát và kiểm tra lại trạng thái danh sách Pods.

### Kết quả mong đợi (PASS):
* Ngay sau khi lệnh xóa được phát đi, Kubernetes lập tức tạo một Pod mới có tên ngẫu nhiên khác (ví dụ: `users-service-58dcfcb547-xyz78`).
* Pod cũ chuyển sang trạng thái `Terminating` và biến mất. Pod mới chuyển qua `Pending` -> `ContainerCreating` -> `Running` thành công.
* Trong toàn bộ quá trình, người dùng truy cập ứng dụng không bị ảnh hưởng (nếu chạy cấu hình Replica >= 2, Pod còn lại sẽ gánh tải).

---

## KỊCH BẢN 2: CẬP NHẬT PHIÊN BẢN KHÔNG CÓ DOWNTIME (ZERO-DOWNTIME ROLLOUT)

Mục đích: Đảm bảo khi CI/CD cập nhật code mới cho các microservice, hệ thống vẫn duy trì kết nối liên tục, không gây ra lỗi ngắt quãng dịch vụ cho người dùng cuối.

### Các bước thực hiện:
1. Mở một terminal thực hiện gọi liên tiếp (polling) tới endpoint kiểm tra sức khỏe của API Gateway (hoặc Frontend):
   * **Trên Windows PowerShell**:
     ```powershell
     while ($true) {
         try {
             $resp = Invoke-WebRequest -Uri "http://transcripthub.local/api/health" -UseBasicParsing -TimeoutSec 2
             Write-Host "$(Get-Date -Format 'HH:mm:ss') - HTTP Status: $($resp.StatusCode)" -ForegroundColor Green
         } catch {
             Write-Host "$(Get-Date -Format 'HH:mm:ss') - REQUEST FAILED: $_" -ForegroundColor Red
         }
         Start-Sleep -Seconds 1
     }
     ```
   * **Trên Linux/macOS Bash**:
     ```bash
     while true; do 
         curl -o /dev/null -s -w "%{http_code}\n" http://transcripthub.local/api/health
         sleep 1
     done
     ```
2. Trong terminal khác, giả lập một đợt rollout cập nhật (hoặc kích hoạt Jenkins Pipeline chạy CD):
   ```bash
   kubectl rollout restart deployment/users-service -n transcripthub
   ```
3. Quan sát các phản hồi HTTP status ở terminal polling trong suốt thời gian rollout.

### Kết quả mong đợi (PASS):
* Logs ở terminal polling hiển thị liên tục trạng thái `HTTP Status: 200` (hoặc phản hồi thành công khác). Không xuất hiện bất kỳ mã lỗi `502 Bad Gateway` hay `503 Service Unavailable`.
* Kubernetes triển khai chiến lược **Rolling Update**: Khởi động Pod mới chạy phiên bản code mới trước. Sau khi Pod mới hoàn thành khởi chạy và vượt qua các bài kiểm tra sẵn sàng (Readiness Probe), K8s mới bắt đầu tắt Pod cũ.

---

## KỊCH BẢN 3: ĐỘ BỀN VỮNG CỦA DỮ LIỆU (DATABASE PERSISTENCE TEST)

Mục đích: Đảm bảo dữ liệu trong cơ sở dữ liệu PostgreSQL không bị mất khi Pod PostgreSQL bị xóa hoặc khởi động lại (dữ liệu lưu trữ thực tế được bảo toàn trên ổ cứng đĩa vật lý nhờ PVC).

### Các bước thực hiện:
1. Truy cập giao diện ứng dụng tại `http://transcripthub.local`. Thực hiện đăng ký một tài khoản mới (ví dụ: `test_k8s@gmail.com`).
2. Xác minh tài khoản đăng ký thành công bằng cách đăng nhập vào hệ thống.
3. Trên terminal, tìm Pod của PostgreSQL StatefulSet:
   ```bash
   kubectl get pods -n transcripthub -l app=postgres-db
   ```
   *(Ghi nhận tên Pod, thường là `postgres-db-0`)*
4. Thực hiện xóa Pod PostgreSQL để giả lập sự cố crash server vật lý chứa DB:
   ```bash
   kubectl delete pod postgres-db-0 -n transcripthub
   ```
5. Đợi khoảng 1-2 phút cho tới khi Pod PostgreSQL được khởi động lại thành công và chuyển sang trạng thái `Running`.
6. Quay lại trình duyệt, thực hiện Đăng nhập lại bằng tài khoản `test_k8s@gmail.com` vừa tạo ở bước 1.

### Kết quả mong đợi (PASS):
* Đăng nhập thành công. Dữ liệu tài khoản vẫn tồn tại đầy đủ trong cơ sở dữ liệu.
* Điều này chứng minh PersistentVolumeClaim (`postgres-pvc-postgres-0`) đã được liên kết lại chính xác vào Pod PostgreSQL mới khởi chạy mà không làm mất/ghi đè dữ liệu cũ.

---

## KỊCH BẢN 4: KIỂM THỬ KHẢ NĂNG KẾT NỐI LIÊN DỊCH VỤ (E2E BUSINESS FLOWS)

Mục đích: Đảm bảo tất cả các microservices và Ingress định tuyến phối hợp chính xác theo luồng nghiệp vụ thực tế.

### 4.1. Luồng Xác thực (Authentication Flow)
* **Thao tác**: Đăng ký và đăng nhập tài khoản.
* **Đường đi traffic**: Browser -> Ingress (`/api/auth/*`) -> API Gateway (port 3000) -> Identity Service (port 3002) -> Users Service (port 3001) -> PostgreSQL.
* **Tiêu chí Đạt**: Nhận được Access Token và Refresh Token, lưu thông tin phiên đăng nhập trên Cookie/LocalStorage của Frontend thành công.

### 4.2. Luồng Tải tệp lên (File Upload Flow)
* **Thao tác**: Người dùng tải một file âm thanh/video ghi âm lên hệ thống để tiến hành chuyển dịch (transcript).
* **Đường đi traffic**: Browser -> Ingress (`/api/files/*`) -> API Gateway -> File Service (port 3003) -> MinIO StatefulSet (lưu trữ tệp vật lý).
* **Tiêu chí Đạt**: File được upload thành công, API trả về link tải trực tiếp (URL qua MinIO) và bản ghi file được cập nhật vào database.

### 4.3. Luồng Cộng tác Thời gian thực (Real-time Collaboration Flow)
* **Thao tác**: Hai trình duyệt cùng mở một bản dịch để chỉnh sửa đồng thời.
* **Đường đi traffic**: 
  * WebSocket connection: Browser -> Ingress (`/socket.io/*`) -> Collab Gateway (port 3008).
  * Data Sync: Collab Gateway -> Collab Service -> Redis (pub/sub & state) & Kafka (event streaming).
* **Tiêu chí Đạt**:
  * WebSocket kết nối thành công (không bị lỗi fallback sang HTTP long-polling liên tục).
  * Con trỏ chuột của người dùng này hiển thị theo thời gian thực trên màn hình của người dùng kia.
  * Các ký tự chỉnh sửa được đồng bộ mượt mà không bị mất dữ liệu.

---

## HƯỚNG DẪN TRA CỨU & XỬ LÝ LỖI TRÊN K8S (TROUBLESHOOTING CHEAT SHEET)

### 1. Pod bị lỗi `ImagePullBackOff` hoặc `ErrImagePull`
* **Nguyên nhân**: K8s không thể tải được Docker image.
* **Cách khắc phục**:
  * Kiểm tra lại tên image và tag trên Docker Hub xem có trùng khớp với file YAML không.
  * Nếu dùng Minikube local registry: Đảm bảo đã chạy lệnh `minikube docker-env | Invoke-Expression` trước khi `docker build`, hoặc thiết lập thuộc tính `imagePullPolicy: Never` trong file deployment yaml.

### 2. Pod bị lỗi `CrashLoopBackOff`
* **Nguyên nhân**: Container khởi động thành công nhưng ngay lập tức bị lỗi crash/thoát ra.
* **Cách khắc phục**:
  * Xem log của Pod: `kubectl logs <pod-name> -n transcripthub --previous` (tham số `--previous` giúp xem log của container ngay trước khi crash).
  * Lỗi phổ biến: Thiếu biến môi trường hoặc không kết nối được tới Database/Redis/Kafka (do cấu hình Host sai).

### 3. Lỗi Ingress trả về `502 Bad Gateway` hoặc `503 Service Unavailable`
* **Nguyên nhân**: Ingress Controller không thể định tuyến traffic tới Service, hoặc Pod của Service đó chưa sẵn sàng nhận traffic.
* **Cách khắc phục**:
  * Kiểm tra xem Pod của microservice đích có đang `Running` và `READY` là `1/1` không.
  * Kiểm tra xem cấu hình cổng (`port` và `targetPort`) trong file Service YAML có khớp với cổng chạy thực tế của ứng dụng bên trong container không.
  * Kiểm tra xem tên của Service định nghĩa trong file Ingress YAML có trùng khớp chính xác 100% với tên Service trong file Service YAML không.
