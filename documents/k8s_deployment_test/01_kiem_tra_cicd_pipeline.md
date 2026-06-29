# Hướng Dẫn Kiểm Tra Quy Trình CI/CD Pipeline (Nhánh `dev_js`)

Tài liệu này hướng dẫn cách kiểm tra và xác minh tính đúng đắn của quy trình CI/CD tự động khi triển khai ứng dụng **TranscriptHub** lên cụm Kubernetes (K8s). Quy trình này là dạng **Direct Deployment** (Sử dụng lệnh `kubectl` trực tiếp từ Jenkins/Actions, không qua GitOps).

---

## 1. Kịch Bản Kiểm Tra 1: Kích Hoạt Tự Động (Auto-Trigger)

Mục đích: Đảm bảo pipeline tự động khởi chạy khi có mã nguồn mới được cập nhật trên nhánh `dev_js`.

### Các bước thực hiện:
1. Đứng ở nhánh `dev_js` cục bộ, thực hiện một thay đổi nhỏ (ví dụ: Thêm dòng chú thích vào file log hoặc tài liệu).
2. Commit và push thay đổi lên Git Server (GitHub/GitLab):
   ```bash
   git add .
   git commit -m "docs: test trigger k8s pipeline"
   git push origin dev_js
   ```
3. Mở giao diện quản lý CI/CD (Jenkins Dashboard hoặc GitHub Actions tab).

### Kết quả mong đợi:
* Pipeline tương ứng với nhánh `dev_js` được kích hoạt tự động sau 10 - 30 giây (không cần nhấn chạy bằng tay).
* Trạng thái trigger hiển thị đúng Commit SHA và tên Developer vừa push.

---

## 2. Kịch Bản Kiểm Tra 2: Giai Đoạn Kiểm Thử Mã Nguồn (CI - Lint & Test)

Mục đích: Đảm bảo mã nguồn chất lượng cao và không có lỗi biên dịch trước khi đóng gói thành Docker Image.

### Các bước thực hiện:
1. Nhấp vào build hiện tại trên CI Tool, mở xem chi tiết logs của Stage **"Lint & Unit Test"** (hoặc stage tương đương).
2. Kiểm tra xem các tác vụ có chạy song song (parallel) đối với Frontend và Backend hay không.

### Kết quả mong đợi:
* **Đối với Backend (NestJS)**:
  * Lệnh `npm ci` chạy thành công không có lỗi mạng.
  * Lệnh `npx prisma generate` tạo thành công Prisma Client cho production.
  * Lệnh `npm run lint` hoàn thành (nếu có cảnh báo, không làm gãy pipeline nếu được cấu hình `|| true`).
  * Lệnh `npm run test` và `npm run test:e2e` chạy thành công, tạo ra các file báo cáo test dạng XML trong thư mục `services_ms/test-reports/`.
* **Đối với Frontend (Next.js)**:
  * Lệnh `npm ci` cài đặt thành công.
  * Lệnh `npm run build` biên dịch thành công ứng dụng Next.js (không có lỗi TypeScript hoặc cú pháp).
* **Kết quả báo cáo**:
  * Dashboard của Jenkins/Actions hiển thị biểu đồ **Test Result** với đúng số lượng test cases đã chạy.

---

## 3. Kịch Bản Kiểm Tra 3: Đóng Gói Và Gắn Nhãn Docker (Docker Build & Tagging)

Mục đích: Kiểm tra xem các image của các dịch vụ được build đúng cách, sử dụng cơ chế multi-stage build và gắn thẻ (tag) chuẩn xác.

### Các bước thực hiện:
1. Kiểm tra log chi tiết giai đoạn **"Docker Build & Push"**.
2. Kiểm tra xem có 9 dịch vụ microservices nào được build hay không (đặc biệt là các service của nhánh `dev_js` bao gồm frontend và backend microservices).

### Kết quả mong đợi:
* Docker images được build thành công từ các Dockerfile tương ứng:
  * Api-Gateway, Users, Identity, File, Transcript, Meeting, Collab, Collab-Gateway, và Frontend.
* Mỗi dịch vụ phải được gắn đồng thời 2 thẻ (tags):
  1. Thẻ theo số hiệu Build (ví dụ: `transcripthub-users:45`).
  2. Thẻ `latest` để phục vụ kéo ảnh mặc định (ví dụ: `transcripthub-users:latest`).
* Dung lượng của các image ở production stage phải tối ưu (nhỏ hơn nhiều so với dev image do sử dụng multi-stage builds).

---

## 4. Kịch Bản Kiểm Tra 4: Xác Thực Và Đẩy Ảnh Lên Registry (Docker Push)

Mục đích: Kiểm tra khả năng đăng nhập và push ảnh của CI runner lên Docker Hub.

### Các bước thực hiện:
1. Xác nhận trong logs của pipeline có dòng `Login Succeeded` sau khi thực hiện đăng nhập.
2. Mở trình duyệt, đăng nhập vào tài khoản Docker Hub được cấu hình.
3. Kiểm tra các repository tương ứng của dự án (ví dụ: `docker.io/yourusername/transcripthub-users`).

### Kết quả mong đợi:
* Trong logs hiển thị các lệnh `docker push` hoàn thành thành công 100%.
* Trên Docker Hub UI, xuất hiện tag mới trùng khớp với số hiệu build (`BUILD_NUMBER`) và tag `latest` có thời gian cập nhật cách đó vài phút.

---

## 5. Kịch Bản Kiểm Tra 5: Triển Khai Trực Tiếp Lên Cụm K8s (Kubectl Deploy)

Mục đích: Xác minh CI runner có thể thiết lập ngữ cảnh K8s (K8s Context) và đẩy cấu hình mới xuống cụm Kubernetes thành công mà không thông qua GitOps.

### Các bước thực hiện:
1. Kiểm tra log của giai đoạn **"Deploy to Kubernetes"** (hoặc `Deploy to VPS/Minikube`).
2. Xác minh các lệnh `kubectl apply` được thực thi đối với các file manifest:
   * `init-config.yaml` (Namespace, ConfigMap, Secrets)
   * Các file yaml định nghĩa Deployment và Service của các microservices.
   * `ingress.yaml`
3. Kiểm tra xem lệnh cập nhật ảnh động có chạy không:
   ```bash
   kubectl set image deployment/users-service users-service=docker.io/yourusername/transcripthub-users:${BUILD_NUMBER} -n transcripthub
   ```
4. Kiểm tra dòng log của lệnh xác thực trạng thái rollout:
   ```bash
   kubectl rollout status deployment/users-service -n transcripthub
   ```

### Kết quả mong đợi:
* Các tệp tin cấu hình yaml được áp dụng thành công (logs hiển thị `configured` hoặc `unchanged`, không có lỗi `validation error` hay `unauthorized`).
* Lệnh `kubectl rollout status` trả về kết quả: `deployment "users-service" successfully rolled out`.
* Pipeline kết thúc với trạng thái **SUCCESS** (màu xanh).

---

## 6. Kịch Bản Kiểm Tra 6: Dọn Dẹp Tài Nguyên Sau Build (Post-build Cleanup)

Mục đích: Tránh tình trạng tràn ổ đĩa trên máy chủ Jenkins/CI Runner khi build liên tục nhiều phiên bản Docker.

### Các bước thực hiện:
1. Xem log của block `post -> always` hoặc `post -> success`.
2. Kiểm tra xem lệnh `docker rmi` có chạy và xóa các image trung gian hoặc image vừa build ở local Runner hay không.

### Kết quả mong đợi:
* Lệnh dọn dẹp chạy thành công:
  ```bash
  docker rmi $(docker images | grep 'transcripthub' | awk '{print $3}') -f || true
  ```
* Không còn các dangling images (`<none>:<none>`) chiếm dụng dung lượng lớn trên ổ đĩa của CI runner.

---

## 7. Bảng Tổng Hợp Tiêu Chí Đạt/Không Đạt (CI/CD Checklist)

| Tên Giai Đoạn | Tác vụ cần kiểm tra | Trạng thái Đạt (PASS) | Cách kiểm tra nhanh |
| :--- | :--- | :--- | :--- |
| **Prepare** | Kiểm tra phiên bản công cụ trên runner | Node >= 20, Docker >= 24, Kubectl >= 1.28 | Xem log đầu tiên của pipeline |
| **Lint & Test** | Chạy linter, unit test & build thử | Không có lỗi compile. Tạo file XML báo cáo | Xem tab "Test Result" trên Jenkins |
| **Docker Build**| Build image cho 9 services | Build thành công dạng multi-stage | Xem logs stage Build |
| **Docker Push** | Đẩy image lên Docker Hub | Xuất hiện image tag `${BUILD_NUMBER}` trên Hub | Kiểm tra trang web Docker Hub |
| **Deploy K8s** | Áp dụng yaml & Cập nhật tag image | Khởi chạy pod chạy image mới, rollout thành công | `kubectl get pods -n transcripthub` |
| **Cleanup** | Xóa cache image thừa ở runner | Giải phóng bộ nhớ đĩa | Lệnh `docker images` trên Runner |

> [!WARNING]
> **Lỗi Credentials thường gặp**: Nếu pipeline bị lỗi ngay từ bước đăng nhập Docker Hub hoặc deploy K8s, hãy kiểm tra lại cấu hình Credentials trong Jenkins:
> * `dockerhub-credentials` (Username & Access Token - chứ không dùng mật khẩu thường nếu có xác thực 2 lớp).
> * `k8s-kubeconfig` (Tệp cấu hình Kubeconfig). Hãy chắc chắn IP trong trường `server` của kubeconfig không trỏ về `127.0.0.1` của Jenkins Container mà trỏ về IP máy host chứa Minikube (ví dụ: `host.docker.internal` hoặc IP LAN).
