# Hướng dẫn Thiết lập và Cấu hình GitHub Actions cho VPS

Tài liệu này cung cấp hướng dẫn chi tiết cách cấu hình thông tin bảo mật (Secrets), thiết lập môi trường chạy để triển khai dự án **TranscriptHub** lên máy chủ VPS bằng GitHub Actions.

---

## 1. Tổng quan Hạ tầng chạy Pipeline

GitHub Actions hoạt động theo cơ chế **Serverless (Cloud-hosted)**:

* **Không cần cài máy chủ build**: Toàn bộ quy trình kiểm thử (Lint, Unit Test, E2E Test) và đóng gói (Docker Build & Push) diễn ra trên máy ảo Cloud do GitHub cung cấp (Ubuntu-latest).
* **Quy trình kích hoạt**: Khi bạn push code lên nhánh `dev_js`, GitHub sẽ khởi tạo máy ảo build. Sau khi build xong và đẩy image lên Docker Hub, máy ảo này sẽ gửi lệnh deploy qua cổng SSH tới VPS của bạn để VPS tự động kéo image về và chạy.
* **Tài nguyên VPS được bảo vệ**: Việc phân tách này giúp VPS không bị quá tải do thiếu RAM hay CPU khi build ứng dụng Node.js/Next.js (vốn tiêu tốn rất nhiều tài nguyên biên dịch).

---

## 2. Cấu hình GitHub Secrets (Thông tin xác thực bảo mật)

Tệp workflow của GitHub Actions (`ci-cd.yml`) sẽ cần các thông tin xác thực để push image lên Docker Hub và SSH vào VPS. Bạn cần cấu hình các thông tin này trong phần **Settings -> Secrets and variables -> Actions** của repository trên GitHub.

```text
GitHub Repository Settings
└── Secrets and variables
    └── Actions
        ├── DOCKER_USERNAME      # Tài khoản Docker Hub
        ├── DOCKER_PASSWORD      # Access Token Docker Hub
        ├── VPS_HOST             # IP máy chủ VPS triển khai
        ├── VPS_USER                   # User SSH truy cập VPS (ubuntu/root)
        ├── SSH_PRIVATE_KEY            # SSH Private Key dùng để login VPS
        ├── DATABASE_URL               # Connection string DB để chạy Test ở bước CI
        ├── JWT_SECRET                 # Secret Key của JWT để chạy Test ở bước CI
        └── JWT_REFRESH_SECRET         # Refresh Secret Key của JWT để chạy Test ở bước CI
```

### Hướng dẫn thiết lập từng Secrets:

1. **`DOCKER_USERNAME`**:
   * *Nội dung*: Tên tài khoản Docker Hub của bạn (ví dụ: `yourdockerhubusername`).
2. **`DOCKER_PASSWORD`**:
   * *Nội dung*: **Access Token** của tài khoản Docker Hub (Đăng nhập Docker Hub, vào *Account Settings -> Security -> New Access Token* để sinh mã). Không nên dùng mật khẩu chính để đảm bảo bảo mật.
3. **`VPS_HOST`**:
   * *Nội dung*: Địa chỉ IP public của máy chủ VPS của bạn (ví dụ: `159.223.x.x`).
4. **`VPS_USER`**:
   * *Nội dung*: Tên người dùng SSH để đăng nhập vào VPS (thường là `ubuntu`, `debian` hoặc `root`).
5. **`SSH_PRIVATE_KEY`**:
   * *Nội dung*: Nội dung của tệp SSH Private Key tương ứng với Public Key được cấu hình trên VPS để cho phép SSH không cần mật khẩu.
     > [!WARNING]
     > Hãy copy toàn bộ nội dung của tệp key, bao gồm cả dòng đầu `-----BEGIN OPENSSH PRIVATE KEY-----` (hoặc `-----BEGIN RSA PRIVATE KEY-----`) và dòng cuối `-----END OPENSSH PRIVATE KEY-----` (hoặc `-----END RSA PRIVATE KEY-----`).
   * *Hướng dẫn tạo và lấy khóa trực tiếp trên máy chủ VPS*:
     1. **SSH vào VPS của bạn và tạo cặp khóa mới**:
        ```bash
        ssh-keygen -t rsa -b 4096 -f ~/.ssh/github_actions_key -N ""
        ```
     2. **Đăng ký ổ khóa (Public Key) vào chính VPS**:
        ```bash
        cat ~/.ssh/github_actions_key.pub >> ~/.ssh/authorized_keys
        chmod 600 ~/.ssh/authorized_keys
        ```
     3. **Hiển thị chìa khóa (Private Key) để cấu hình lên GitHub**:
        ```bash
        cat ~/.ssh/github_actions_key
        ```
        *Hãy copy toàn bộ nội dung hiển thị trên terminal để dán làm giá trị cho secret `SSH_PRIVATE_KEY`.*
     4. **Dọn dẹp bảo mật trên VPS**: Xóa 2 file tạm vừa tạo sau khi đã cấu hình xong:
        ```bash
        rm ~/.ssh/github_actions_key ~/.ssh/github_actions_key.pub
        ```
6. **`DATABASE_URL`**:
   * *Nội dung*: Chuỗi kết nối đến database chạy thử nghiệm trong môi trường test (Ví dụ: `postgresql://postgres:postgres@localhost:5432/transcripthub`).
7. **`JWT_SECRET`**:
   * *Nội dung*: Khóa bí mật ký JWT dùng cho quá trình kiểm thử Backend (NestJS).
8. **`JWT_REFRESH_SECRET`**:
   * *Nội dung*: Khóa bí mật làm mới JWT (Refresh Token) dùng cho kiểm thử.

---

## 3. Cấu hình Môi trường Triển khai phê duyệt thủ công (Environments - Tùy chọn)

Nếu bạn muốn quy trình CI/CD tạm dừng để người quản trị kiểm duyệt và nhấn nút đồng ý (Approval) trên giao diện GitHub trước khi deploy lên VPS:

1. Trên GitHub Repository, vào **Settings** -> **Environments** -> Nhấn **New environment**.
2. Đặt tên môi trường là `production`.
3. Tích chọn ô **Required reviewers**.
4. Thêm tài khoản GitHub của bạn hoặc người chịu trách nhiệm phê duyệt.
5. Nhấn **Save protection rules**.
6. Trong tệp cấu hình workflow YAML, chỉ cần thêm cấu hình `environment: production` vào job `deploy`.
