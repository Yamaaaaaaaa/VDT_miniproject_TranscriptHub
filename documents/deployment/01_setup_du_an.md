# Hướng dẫn Khởi tạo Dự án từ số 0 (Project Setup)

Tài liệu này hướng dẫn bạn từng bước cách khởi tạo cấu trúc thư mục, cài đặt các công cụ cần thiết và xây dựng dự án **NestJS Monorepo** từ con số 0.

---

## 1. Cấu trúc Dự án Đề xuất

Chúng ta sẽ xây dựng một dự án chứa cả Backend và Frontend trong cùng một thư mục gốc:

```
VDT_miniproject_TranscriptHub/
├── fe_next/                      # Frontend Next.js (Khởi tạo ở bước sau)
└── services_ms/                  # Backend NestJS Monorepo (Khởi tạo ở bước này)
```

---

## 1.1. Kiến trúc Cơ sở Dữ liệu (Database Architecture) & Đánh giá Đánh đổi (Trade-off)

Trong hệ thống microservices này:
* **Mặt Vật lý (Physical Level):** Cả hai dịch vụ `users-service` và `identity-service` đều kết nối chung vào **một database PostgreSQL vật lý** duy nhất (`transcripthub`) nhưng dữ liệu được phân chia thành **hai schema độc lập** (`identity` và `users`). Chúng vẫn dùng chung một file Prisma schema ở thư mục gốc của monorepo (`services_ms/prisma/schema.prisma`) sử dụng tính năng `multiSchema`.
* **Mặt Logic / Phân quyền sở hữu (Logical Level):** 
  * `users-service` chịu trách nhiệm độc quyền quản lý các bảng trong schema `users` (ví dụ `user_profiles`).
  * `identity-service` chịu trách nhiệm độc quyền quản lý các bảng trong schema `identity` (như `accounts`, `roles`, `permissions`). Các token đã hết hiệu lực do người dùng đăng xuất sẽ được lưu trữ stateless trong danh sách đen (Blacklist) tại Redis với thời gian sống (TTL) xác định.
  * Khi `identity-service` cần thao tác hoặc lấy dữ liệu liên quan đến người dùng, nó **không truy vấn trực tiếp** bảng `user_profiles` từ database khác schema, mà gửi yêu cầu RPC qua cổng TCP (port 3001) đến `users-service`. Điều này đảm bảo tính độc lập dữ liệu tuyệt đối ở tầng ứng dụng.

### Đánh giá kiến trúc từ thực tế dự án (Trade-off Analysis)

> [!IMPORTANT]
> **Đây là mô hình Shared Database - Multiple Schemas (Dùng chung DB vật lý - Khác schema).**
> Đây là một bước tiến so với việc dùng chung schema `public` mặc định, giúp chúng ta vừa tách biệt được không gian lưu trữ của từng microservice ngay từ tầng database, vừa không tốn quá nhiều tài nguyên hệ thống.

#### 1. Ưu điểm của lựa chọn hiện tại (Shared Database - Multiple Schemas):
* **Tách biệt dữ liệu tốt hơn:** Các bảng được nhóm rõ ràng vào các schema tương ứng (`users.*` và `identity.*`), tránh nhầm lẫn và xung đột tên bảng.
* **Chuẩn bị sẵn sàng cho việc phân tách hoàn toàn:** Dễ dàng cấu hình phân quyền đăng nhập (User DB) sau này hoặc tách riêng hẳn ra 2 database độc lập mà không cần đổi tên hay cấu trúc bảng.
* **Tiết kiệm tài nguyên:** Vẫn chạy chung trên một container PostgreSQL duy nhất, không tốn thêm tài nguyên chạy nhiều server DB.

#### 2. Nhược điểm cần lưu ý (Dưới góc nhìn Microservices thực tế):
* **Phụ thuộc vào tính năng Prisma MultiSchema:** Cần bật preview feature `multiSchema` trong Prisma và gán thẻ `@@schema()` cho tất cả các Model.
* **Single Point of Failure (SPOF):** Nếu database server vật lý gặp sự cố, cả hai service đều sẽ bị ảnh hưởng.

#### 3. Định hướng cải tiến khi mở rộng (Scaling Path):
Nếu dự án phát triển lên quy mô lớn hơn, kiến trúc này có thể được nâng cấp tiếp:
1. **Access Control (Phân quyền):** Cấu hình 2 tài khoản đăng nhập Postgres khác nhau cho 2 service. Tài khoản của `identity-service` chỉ có quyền thao tác trên schema `identity`, tài khoản của `users-service` chỉ có quyền thao tác trên schema `users`.
2. **Database-per-service (Hoàn toàn độc lập):** Tách 2 schema này sang 2 máy chủ PostgreSQL vật lý riêng biệt và đồng bộ trạng thái qua Message Broker (ví dụ: Kafka, RabbitMQ) khi cần liên kết.

---

## 2. Bước 1: Khởi tạo Thư mục Gốc và Cài đặt Nest CLI

1. **Tạo thư mục cha cho toàn bộ dự án:**
   ```bash
   mkdir VDT_miniproject_TranscriptHub
   cd VDT_miniproject_TranscriptHub
   ```

2. **Cài đặt NestJS CLI (Command Line Interface) toàn cục trên máy tính:**
   ```bash
   npm install -g @nestjs/cli
   ```

---

## 3. Bước 2: Tạo dự án NestJS gốc (Root Application)

Chúng ta sẽ tạo ứng dụng Backend gốc có tên là `services_ms`:
```bash
nest new services_ms
```
*Hệ thống sẽ hỏi bạn chọn Trình quản lý gói (Package Manager). Hãy chọn **npm**.*

Sau khi chạy xong, NestJS sẽ tạo ra một dự án Standard NestJS đơn lẻ thông thường.

---

## 4. Bước 3: Chuyển đổi dự án NestJS sang dạng Monorepo

Để chạy được kiến trúc Microservices gồm nhiều ứng dụng nhỏ độc lập (`api-gateway`, `users`, `identity`) dùng chung một repo, chúng ta cần chuyển đổi dự án này thành cấu trúc Monorepo.

1. **Di chuyển vào thư mục backend vừa tạo:**
   ```bash
   cd services_ms
   ```

2. **Sinh ứng dụng con `users` (microservice):**
   ```bash
   nest generate app users
   ```
   *Khi bạn chạy lệnh này lần đầu tiên, Nest CLI sẽ tự động tái cấu trúc dự án của bạn:*
   * Tạo thư mục `apps/`.
   * Di chuyển mã nguồn ban đầu của ứng dụng gốc vào thư mục `apps/services_ms/` (chúng ta sẽ đổi tên nó thành `api-gateway` sau).
   * Tạo ứng dụng con `users` mới nằm tại `apps/users/`.
   * Tạo file cấu hình `nest-cli.json` kiểu monorepo.

3. **Sinh ứng dụng con `identity` (microservice xác thực):**
   ```bash
   nest generate app identity
   ```
   *Ứng dụng này sẽ được tự động tạo tại `apps/identity/`.*

---

## 5. Bước 4: Đổi tên ứng dụng gốc thành `api-gateway`

Để khớp với cấu trúc thực tế của dự án, chúng ta đổi tên thư mục và cấu hình của root app từ `services_ms` sang `api-gateway`.

1. **Đổi tên thư mục mã nguồn:**
   Đổi tên thư mục `apps/services_ms` thành `apps/api-gateway`.

2. **Cập nhật cấu hình trong [nest-cli.json](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/nest-cli.json):**
   Mở file `nest-cli.json` và cấu hình các trường `projects` khớp với cấu trúc mới:
   ```json
   {
     "$schema": "https://json.schemastore.org/nest-cli",
     "collection": "@nestjs/schematics",
     "sourceRoot": "apps/api-gateway/src",
     "monorepo": true,
     "root": "apps/api-gateway",
     "compilerOptions": {
       "webpack": false,
       "tsConfigPath": "apps/api-gateway/tsconfig.app.json"
     },
     "projects": {
       "api-gateway": {
         "type": "application",
         "root": "apps/api-gateway",
         "entryFile": "main",
         "sourceRoot": "apps/api-gateway/src",
         "compilerOptions": {
           "tsConfigPath": "apps/api-gateway/tsconfig.app.json"
         }
       },
       "users": {
         "type": "application",
         "root": "apps/users",
         "entryFile": "main",
         "sourceRoot": "apps/users/src",
         "compilerOptions": {
           "tsConfigPath": "apps/users/tsconfig.app.json"
         }
       },
       "identity": {
         "type": "application",
         "root": "apps/identity",
         "entryFile": "main",
         "sourceRoot": "apps/identity/src",
         "compilerOptions": {
           "tsConfigPath": "apps/identity/tsconfig.app.json"
         }
       }
     }
   }
   ```

---

## 6. Bước 5: Cài đặt các Thư viện phụ thuộc (Dependencies)

Để toàn bộ Backend hoạt động được với Microservices, Database, JWT và Mã hóa, chạy lệnh cài đặt các gói sau tại thư mục gốc `services_ms`:

```bash
# 1. Các gói chính (Dependencies)
npm install @nestjs/microservices @nestjs/jwt @nestjs/passport passport passport-jwt bcryptjs class-validator class-transformer @prisma/client pg @prisma/adapter-pg dotenv

# 2. Các gói hỗ trợ phát triển (Dev Dependencies)
npm install --save-dev prisma @types/bcryptjs @types/pg @types/node @types/passport-jwt
```

---

## 7. Bước 6: Khởi tạo tệp cấu hình Môi trường `.env`

Tạo file `.env` tại thư mục gốc của `services_ms` để phục vụ cấu hình kết nối local trong quá trình viết code:
```env
# Chuỗi kết nối Database local
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/transcripthub"

# Khóa bí mật JWT xác thực
JWT_SECRET="th_jwt_s3cr3t_k3y_x9mK2pL8qR4nW6vY1bZ5cE0aF7gH3jN"
JWT_REFRESH_SECRET="th_refresh_s3cr3t_k3y_p2mX8nL4qK9vR6bW1zY5cE0aF7gH3jN"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Port các dịch vụ
PORT=3000
USERS_SERVICE_HOST=localhost
USERS_SERVICE_PORT=3001
IDENTITY_SERVICE_HOST=localhost
IDENTITY_SERVICE_PORT=3002
```

Đến đây, bạn đã khởi tạo thành công khung dự án NestJS Monorepo. Bước tiếp theo, chúng ta sẽ thiết lập Database Prisma và lập trình Users Microservice.
