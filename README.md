# TranscriptHub - Collaborative Meeting Minutes System


## 🚀 Hướng Dẫn Chạy & Build (Docker Compose)

### 1. Khởi chạy hệ thống lần đầu (hoặc chạy bình thường)
Chạy lệnh sau tại thư mục gốc của dự án:
```bash
docker compose up -d
```
Hệ thống sẽ khởi tạo và chạy các container dưới nền.

### 2. Build & chạy lại toàn bộ sau khi sửa đổi mã nguồn
Nếu có bất cứ thay đổi nào trong code của các dịch vụ, dùng lệnh này để build lại image mới và khởi chạy:
```bash
docker compose up --build -d
```

### 3. Build & chạy lại riêng một dịch vụ cụ thể
Khi bạn chỉ sửa đổi code ở một dịch vụ nhất định (ví dụ: `users`, `identity` hoặc `gateway`), bạn có thể build lại riêng dịch vụ đó mà không cần tác động đến các dịch vụ khác để tiết kiệm thời gian:

- **Dịch vụ Gateway (`api-gateway`)**:
  ```bash
  docker compose up --build -d api-gateway
  ```
- **Dịch vụ Identity (`identity-service`)**:
  ```bash
  docker compose up --build -d identity-service
  ```
- **Dịch vụ User (`user-service`)**:
  ```bash
  docker compose up --build -d user-service
  ```

## 🛠 Thông tin các cổng (Ports) và địa chỉ Swagger UI

Dưới đây là các cổng và địa chỉ Swagger UI tương ứng để bạn kiểm thử các API:

### 1. Hệ thống chính (qua API Gateway - Khuyên dùng)
- **API Gateway**: `http://localhost:8080`
- **Swagger UI (Tích hợp tất cả dịch vụ)**: `http://localhost:8080/swagger-ui.html`
  *(Tại giao diện này, bạn có thể chọn Definition ở góc trên cùng bên phải để chuyển đổi giữa **Identity Service** và **User Service**)*

### 2. Truy cập trực tiếp các dịch vụ (Direct Access)
- **Identity Service**:
  - Địa chỉ: `http://localhost:8081`
  - Swagger UI: `http://localhost:8081/swagger-ui.html`
- **User Service**:
  - Địa chỉ: `http://localhost:8082`
  - Swagger UI: `http://localhost:8082/swagger-ui.html`

### 3. Hạ tầng (Infrastructure)
- **MySQL Database**: Cổng `3306` (Gồm 2 database tự động khởi tạo: `identity_db`, `user_db`)
- **Redis Cache**: Cổng `6379` (Đã được cấu hình mật khẩu mặc định `bookland123` cho các service kết nối)