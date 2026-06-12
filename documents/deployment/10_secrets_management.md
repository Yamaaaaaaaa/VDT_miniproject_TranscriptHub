# Hướng dẫn Bảo mật Biến Môi trường & Quản lý Secrets

Tài liệu này hướng dẫn cách bảo mật các thông tin nhạy cảm (như mật khẩu cơ sở dữ liệu, khóa JWT, API token) trong hệ thống TranscriptHub nhằm tránh rò rỉ mã nguồn và bảo đảm an toàn hệ thống.

---

## 1. Nguyên tắc Không commit Secrets lên Git

Các file chứa thông tin nhạy cảm như `.env` (Backend) và `.env.local` (Frontend) tuyệt đối **không được đẩy lên Git**.

### 1.1. Cấu hình `.gitignore`
Đảm bảo các file này đã được liệt kê trong file `.gitignore` ở thư mục gốc của dự án:
```gitignore
# Loại bỏ các file môi trường nhạy cảm
.env
.env.local
.env.*.local
```

### 1.2. Tạo file cấu hình mẫu `.env.example`
Để hướng dẫn người dùng khác các trường cấu hình cần thiết mà không tiết lộ mật khẩu thật, hãy tạo file `.env.example` để chia sẻ công khai:
```env
# Mẫu cấu hình Backend (.env.example)
DATABASE_URL="postgresql://<username>:<password>@<host>:<port>/<dbname>"

JWT_SECRET="generate_a_long_random_string_here"
JWT_REFRESH_SECRET="generate_another_long_random_string_here"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Port các dịch vụ
PORT=3000
USERS_SERVICE_HOST=localhost
USERS_SERVICE_PORT=3001
IDENTITY_SERVICE_HOST=localhost
IDENTITY_SERVICE_PORT=3002

# Cấu hình Redis
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## 2. Quản lý Secrets trong Docker Compose trên Production

Thay vì ghi cứng (hardcode) mật khẩu trực tiếp vào file `docker-compose.yml`, hãy sử dụng cơ chế **tham chiếu biến môi trường** (Environment Variable Interpolation) của Docker Compose.

### Cấu hình `docker-compose.yml` an toàn:
```yaml
  # ─────────────────────────────────────────────
  # Users Microservice (TCP :3001)
  # ─────────────────────────────────────────────
  users-service:
    build:
      context: ./services_ms
      dockerfile: apps/users/Dockerfile
      target: production
    container_name: transcripthub_users
    restart: unless-stopped
    environment:
      # Lấy giá trị động từ máy Host VPS thay vì ghi trực tiếp trong file này
      DATABASE_URL: ${DATABASE_URL}
      USERS_SERVICE_PORT: ${USERS_SERVICE_PORT}
    depends_on:
      postgres:
        condition: service_healthy
```
Khi Docker Compose chạy, nó sẽ tự động tìm kiếm biến `DATABASE_URL` trong shell hiện tại hoặc trong file `.env` nằm cùng thư mục để điền vào.

---

## 3. Thiết lập Bảo mật file cấu hình trên VPS

Khi triển khai hệ thống lên máy chủ VPS Linux, thực hiện các bước sau để bảo vệ file chứa biến môi trường:

### Bước 1: Tạo file `.env` trên thư mục triển khai của VPS
Đăng nhập SSH vào VPS và tạo file `.env` thủ công tại thư mục `/app/VDT_miniproject_TranscriptHub/`:
```bash
nano /app/VDT_miniproject_TranscriptHub/.env
```
Nhập các thông tin mật khẩu thực tế cho môi trường Production của bạn tại đây.

### Bước 2: Thiết lập phân quyền bảo mật (Chmod)
Mặc định khi tạo mới, các tài khoản user khác đăng nhập vào VPS có thể đọc được file này. Hãy phân quyền để **chỉ có tài khoản sở hữu (owner)** và **root** được phép đọc và sửa file:
```bash
# Phân quyền chỉ cho phép owner đọc/ghi
chmod 600 /app/VDT_miniproject_TranscriptHub/.env
```

Nếu chạy lệnh kiểm tra quyền truy cập:
```bash
ls -la /app/VDT_miniproject_TranscriptHub/.env
```
Bạn sẽ thấy quyền hạn hiển thị dạng `-rw-------` (tức là chỉ Owner có quyền đọc và viết, Group và Others hoàn toàn không có quyền truy cập).

---

## 4. Tạo các khóa JWT an toàn cho Production

Trong môi trường local, bạn có thể dùng các khóa mặc định đơn giản. Nhưng trong Production, các khóa bí mật JWT (`JWT_SECRET`, `JWT_REFRESH_SECRET`) phải là các chuỗi ngẫu nhiên có độ dài tối thiểu 256-bit để tránh bị tấn công giải mã brute-force.

Bạn có thể tạo ra chuỗi khóa an toàn ngẫu nhiên bằng cách chạy lệnh sau trên Terminal (yêu cầu cài đặt Node.js):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Kết quả:**
```
9d832a849f2b3e8c7634db2fe89e023190ab76d5e34bcf12de6283ef928ab023
```
Hãy sao chép chuỗi sinh ra này để làm giá trị khóa bảo mật trong file `.env` trên Production của bạn.
