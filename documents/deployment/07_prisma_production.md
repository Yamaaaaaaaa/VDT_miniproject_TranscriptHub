# Hướng dẫn Quản lý Migration Database an toàn trong Production với Prisma

Tài liệu này giải thích sự khác biệt giữa các phương thức đồng bộ cơ sở dữ liệu của Prisma ORM và hướng dẫn thiết lập quy trình **Database Migration an toàn** trên môi trường Production của TranscriptHub.

---

## 1. Phân biệt `db push` và `migrate deploy`

Trong quá trình làm việc với Prisma, bạn có hai cách chính để đồng bộ file `schema.prisma` vào cơ sở dữ liệu PostgreSQL:

| Tiêu chí | `npx prisma db push` | `npx prisma migrate deploy` |
| :--- | :--- | :--- |
| **Mục đích** | Đồng bộ nhanh cấu trúc DB từ schema. | Áp dụng các bản cập nhật SQL đã lưu vết. |
| **Lịch sử di chuyển** | Không lưu vết (Không dùng file `.sql`). | Có lưu vết trong bảng `_prisma_migrations`. |
| **Mức độ an toàn** | **Thấp**. Sẵn sàng drop cột/bảng nếu xung đột. | **Cao**. Không bao giờ tự ý xóa dữ liệu. |
| **Khuyên dùng cho** | Môi trường phát triển cục bộ (Development). | Môi trường sản xuất thực tế (Production). |

> [!CAUTION]
> Sử dụng lệnh `npx prisma db push --accept-data-loss` trên Production là cực kỳ nguy hiểm. Nếu bạn thay đổi tên một cột (ví dụ từ `name` sang `fullName`), lệnh này sẽ **xóa cột cũ** (mất sạch dữ liệu tên cũ) và tạo một cột mới trống trơn.

---

## 2. Quy trình Migration chuẩn cho Production

Quy trình phát triển và cập nhật cơ sở dữ liệu chuẩn gồm 3 bước:

```
[Development]                                  [Git Repository]                    [Production Docker]
Thay đổi schema.prisma                         Commit thư mục                      Chạy container migrate
      │                                               │                                     │
      ▼                                               ▼                                     ▼
Chạy lệnh:                                     Đẩy lên kho chứa                    Chạy lệnh:
npx prisma migrate dev --name <ten_mig>        (GitHub, GitLab...)                 npx prisma migrate deploy
(Tạo file SQL trong prisma/migrations/)
```

### Bước 1: Tạo file Migration tại Development (Local)
Khi bạn thay đổi `schema.prisma` ở máy local (ví dụ: thêm trường `avatar` vào model `User`):
```bash
npx prisma migrate dev --name add_avatar_to_user
```
Prisma sẽ:
1. So sánh sự thay đổi và tự động tạo ra một file SQL migration tại thư mục: `prisma/migrations/20260611xxxxxx_add_avatar_to_user/migration.sql`.
2. Thực thi file SQL này lên PostgreSQL local của bạn.
3. Cập nhật trạng thái vào bảng hệ thống `_prisma_migrations`.

### Bước 2: Commit file SQL vào mã nguồn
Bạn bắt buộc phải commit toàn bộ thư mục `prisma/migrations/` lên Git. Đây là lịch sử thay đổi DB của toàn bộ dự án.

### Bước 3: Deploy lên Production bằng `migrate deploy`
Khi triển khai Docker lên Production, thay vì dùng `db push`, ta cấu hình để container migrate chạy lệnh:
```bash
npx prisma migrate deploy
```
Prisma sẽ:
1. Đọc danh sách các file SQL trong thư mục `prisma/migrations/`.
2. So sánh với bảng hệ thống `_prisma_migrations` trong DB Production để tìm ra các file SQL chưa từng được chạy.
3. Thực thi lần lượt các file SQL chưa chạy theo thứ tự thời gian.
4. Nếu phát hiện một file SQL có thể làm mất dữ liệu (ví dụ: thêm cột `NOT NULL` mà không có giá trị mặc định cho dữ liệu cũ), lệnh sẽ **dừng lại ngay lập tức và báo lỗi**, giữ an toàn tuyệt đối cho dữ liệu hiện có.

---

## 3. Cập nhật cấu hình Docker Compose cho Production

Thay đổi cấu hình của service `migrate` trong file [docker-compose.yml](file:///d:/VDT/VDT_miniproject_TranscriptHub/docker-compose.yml) từ dạng thử nghiệm sang dạng sản xuất (Production-ready):

```yaml
  # ─────────────────────────────────────────────
  # Prisma Migrate (Chạy một lần khi deploy, an toàn cho Production)
  # ─────────────────────────────────────────────
  migrate:
    build:
      context: ./services_ms
      dockerfile: apps/users/Dockerfile
      target: builder
    container_name: transcripthub-db-migrate
    # THAY ĐỔI: Sử dụng migrate deploy thay vì db push --accept-data-loss
    command: npx prisma migrate deploy
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/transcripthub
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - transcripthub_net
    restart: on-failure
```

Khi cấu hình như trên, mỗi lần bạn gõ lệnh `docker compose up -d --build`, container `transcripthub-db-migrate` sẽ khởi động trước, kiểm tra và chạy các file migration mới nhất, sau khi thành công nó sẽ tự động thoát và các service khác (`users-service`, `identity-service`) mới bắt đầu khởi động.
