# Hướng dẫn Thiết lập và Cấu hình GitHub Actions

Tài liệu này cung cấp hướng dẫn chi tiết cách cấu hình thông tin bảo mật (Secrets), thiết lập môi trường chạy và đăng ký **Self-hosted Runner** (nếu cần) cho dự án **TranscriptHub** khi sử dụng GitHub Actions.

---

## 1. Tổng quan Hạ tầng chạy Pipeline

Khác với Jenkins (yêu cầu bạn tự xây dựng một Docker Container custom chứa Node.js, npm, Docker CLI và chạy qua Docker Compose), GitHub Actions hoạt động theo cơ chế **Serverless** mặc định:

* **GitHub-hosted Runners (Khuyên dùng cho production/staging)**: GitHub cung cấp sẵn máy ảo cloud (Ubuntu-latest) đã được cài đặt sẵn hầu hết các công cụ phát triển phổ biến bao gồm **Node.js**, **npm**, **Docker CLI**, và **kubectl**. Bạn hoàn toàn **không cần thiết lập máy chủ build**.
* **Self-hosted Runners (Thích hợp cho thử nghiệm cục bộ/môi trường mạng nội bộ)**: Nếu bạn muốn chạy pipeline kiểm thử và deploy trực tiếp vào cụm Minikube hoặc Docker Compose đang chạy trên **máy cá nhân (local)** của bạn (vốn không mở cổng ra ngoài internet công cộng), bạn có thể cài đặt một ứng dụng agent nhỏ của GitHub lên máy local. Máy ảo GitHub Actions Cloud sẽ gửi lệnh về máy local của bạn để thực thi trực tiếp.

---

## 2. Bước 1: Cấu hình GitHub Secrets (Thông tin xác thực bảo mật)

Tệp workflow của GitHub Actions (`ci-cd.yml`) sẽ cần các thông tin xác thực để push image lên Docker Hub, SSH vào VPS hoặc tương tác với Minikube. Để bảo mật và tránh lộ mật khẩu, bạn cần lưu trữ chúng trong **GitHub Secrets**:

### 2.1. Hướng dẫn truy cập và tạo Secrets trên GitHub:
1. Mở repository dự án của bạn trên GitHub.
2. Chọn tab **Settings** (Cấu hình dự án) ở menu trên cùng.
3. Ở menu bên trái, cuộn xuống phần **Security** -> chọn **Secrets and variables** -> nhấn vào **Actions**.
4. Nhấn nút **New repository secret** ở góc phải màn hình để tạo mới từng biến dưới đây.

```text
GitHub Repository
└── Settings
    └── Secrets and variables
        └── Actions
            ├── DOCKER_USERNAME      # Tài khoản Docker Hub
            ├── DOCKER_PASSWORD      # Access Token Docker Hub
            ├── VPS_HOST             # IP máy chủ VPS triển khai
            ├── VPS_USER             # User SSH truy cập VPS (ubuntu/root)
            ├── SSH_PRIVATE_KEY      # SSH Private Key dùng để login VPS
            └── KUBECONFIG_RAW       # Nội dung tệp cấu hình kubeconfig (K8s)
```

### 2.2. Danh sách các Secrets cần tạo:

1. **`DOCKER_USERNAME`**:
   * *Nội dung*: Tên tài khoản Docker Hub của bạn (ví dụ: `yourdockerhubusername`).
2. **`DOCKER_PASSWORD`**:
   * *Nội dung*: **Access Token** sinh ra từ tài khoản Docker Hub của bạn (Khuyên dùng Access Token thay vì mật khẩu chính để có thể thu hồi khi cần).
3. **`VPS_HOST`**:
   * *Nội dung*: Địa chỉ IP công cộng của máy chủ VPS dùng để deploy ứng dụng (ví dụ: `1.2.3.4`).
4. **`VPS_USER`**:
   * *Nội dung*: Username đăng nhập SSH của VPS (ví dụ: `ubuntu` hoặc `root`).
5. **`SSH_PRIVATE_KEY`**:
   * *Nội dung*: Nội dung của tệp SSH Private Key của bạn (thường là nội dung file `id_rsa` hoặc `private_key.pem` dùng để SSH từ máy của bạn tới VPS mà không cần mật khẩu).
     > [!WARNING]
     > Hãy copy toàn bộ nội dung của tệp key, bao gồm cả dòng đầu `-----BEGIN OPENSSH PRIVATE KEY-----` và dòng cuối `-----END OPENSSH PRIVATE KEY-----`.
6. **`KUBECONFIG_RAW`** (Chỉ cần nếu deploy lên Kubernetes/Minikube):
   * *Nội dung*: Copy toàn bộ nội dung tệp `~/.kube/config` trên máy có quyền quản lý cụm.
     > [!IMPORTANT]
     > * Nếu bạn dùng **GitHub-hosted runner** (máy ảo Cloud) để deploy lên cụm Kubernetes thật (như AWS EKS, Google GKE), API Server IP trong file config phải là IP public của cụm K8s.
     > * Nếu bạn chạy **Self-hosted runner** ngay trên máy local để deploy vào Minikube local, bạn có thể giữ nguyên IP local `127.0.0.1` hoặc IP mạng ảo docker.

---

## 3. Bước 2: Thiết lập Self-hosted Runner (Tùy chọn chạy cục bộ)

Nếu bạn muốn chạy thử nghiệm toàn bộ luồng CI/CD (bao gồm cả deploy lên Minikube cục bộ) trực tiếp trên máy của mình thay vì mua VPS, hãy cài đặt một **Self-hosted Runner**.

### Hướng dẫn cài đặt nhanh trên máy Local (Linux / WSL2 / macOS):

1. Trên trang GitHub Repository, vào **Settings** -> **Actions** -> **Runners**.
2. Nhấn nút **New self-hosted runner**.
3. Chọn hệ điều hành máy của bạn (ví dụ: **Linux** và kiến trúc **x64** nếu dùng Ubuntu/WSL2).
4. GitHub sẽ hiển thị chính xác các lệnh cần gõ trong Terminal. Thực hiện tuần tự các bước:

#### A. Tải ứng dụng runner về máy:
```bash
# Tạo thư mục và di chuyển vào
mkdir actions-runner && cd actions-runner

# Tải gói cài đặt runner (Thay phiên bản mới nhất tương ứng hiển thị trên web)
curl -o actions-runner-linux-x64-2.317.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.317.0/actions-runner-linux-x64-2.317.0.tar.gz

# Giải nén
tar xzf ./actions-runner-linux-x64-2.317.0.tar.gz
```

#### B. Cấu hình và Đăng ký Runner với GitHub:
Gõ lệnh cấu hình đi kèm token bảo mật do GitHub cung cấp sẵn trên giao diện (lưu ý thay URL và Token chính xác của bạn):
```bash
./config.sh --url https://github.com/username/VDT_miniproject_TranscriptHub --token AOBXYZ123456789...
```
* Trong quá trình cấu hình, hệ thống sẽ hỏi bạn một số câu hỏi (bạn có thể nhấn **Enter** để chọn mặc định):
  * *Enter the name of the runner group*: Nhấn Enter (Default)
  * *Enter the name of runner*: Nhập tên gợi nhớ (ví dụ: `my-local-runner`)
  * *Enter any additional labels*: Nhập label đặc trưng để lọc trong YAML workflow (ví dụ: `self-hosted`, `local-build`)
  * *Enter name of work folder*: Nhấn Enter (`_work`)

#### C. Khởi chạy Runner:
```bash
./run.sh
```
Sau khi chạy lệnh, màn hình hiển thị `Listening for Jobs` nghĩa là runner đã kết nối thành công và sẵn sàng nhận lệnh từ GitHub để build code.

---

## 4. Bước 3: Cấu hình Môi trường Triển khai phê duyệt thủ công (Environments)

Đối với quy trình **Continuous Delivery (CD)**, bạn có thể không muốn hệ thống tự động deploy lên Production mỗi khi push code, mà cần có người phê duyệt (Approval). GitHub hỗ trợ tính năng này qua **Environments**:

1. Vào **Settings** -> **Environments** -> Nhấn **New environment**.
2. Đặt tên môi trường là `production`.
3. Tích chọn ô **Required reviewers**.
4. Thêm tài khoản của bạn hoặc Leader của dự án làm người phê duyệt.
5. Nhấn **Save protection rules**.
6. Trong tệp cấu hình workflow YAML, bạn chỉ cần chỉ định `environment: production` cho job Deploy. Khi workflow chạy đến job này, nó sẽ tạm dừng và gửi thông báo yêu cầu bấm phê duyệt trên giao diện GitHub trước khi tiếp tục chạy lệnh deploy.
