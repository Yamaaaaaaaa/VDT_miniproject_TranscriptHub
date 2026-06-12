# Hướng dẫn Tích hợp Redis và Quản lý Token Blacklist

Tài liệu này hướng dẫn chi tiết về cấu hình **Redis** và cơ chế **Stateless Token Blacklist** phục vụ tính năng Đăng xuất (Logout) và kiểm tra thu hồi quyền truy cập (Token Revocation) của TranscriptHub.

---

## 1. Tại sao dùng Redis thay vì Database PostgreSQL?

Trong thiết kế ban đầu, Refresh Token được lưu trong bảng `refresh_tokens` tại PostgreSQL. Tuy nhiên, cách làm này có một số nhược điểm lớn:
- **Tải Database nặng:** Mỗi lần người dùng gọi API Refresh Token hoặc thực thi xác thực hệ thống lại phải đọc/ghi vào ổ đĩa qua PostgreSQL.
- **Dữ liệu rác tích tụ:** Các token hết hạn vẫn tồn tại trong DB cho đến khi có một script dọn dẹp chạy định kỳ.

**Giải pháp tối ưu bằng Redis:**
- **Tốc độ đọc/ghi siêu nhanh:** Redis lưu trữ dữ liệu hoàn toàn trên RAM.
- **Tự động xóa (TTL):** Khi đưa token vào danh sách đen (Blacklist) sau khi Logout, ta đặt thời gian sống (TTL) cho key đó. Redis sẽ tự động giải phóng bộ nhớ khi hết hạn mà không cần dọn dẹp thủ công.

---

## 2. Luồng nghiệp vụ của Token Blacklist

```
[Người dùng nhấn Logout]
          │
          ▼
[Identity Service decode Token] ──► Lấy thời gian hết hạn (exp)
          │
          ▼
[Tính toán TTL] ──────────────────► TTL = exp - thời gian hiện tại + 10 phút (đệm an toàn)
          │
          ▼
[Lưu vào Redis] ──────────────────► SET key "blacklist:<token>" với EXPIRE = TTL
```

Khi người dùng thực hiện API yêu cầu đăng nhập (`validateToken` hoặc `refresh`):
1. **Kiểm tra Redis:** Kiểm tra nhanh sự tồn tại của key `blacklist:<token>`.
2. **Từ chối ngay lập tức:** Nếu key tồn tại, trả về `401 Unauthorized` (Token đã bị đăng xuất trước đó).
3. **Tiếp tục xác thực:** Nếu không có trong blacklist, tiếp tục giải mã chữ ký JWT.

---

## 3. Cấu hình Redis Container

Dịch vụ Redis được định nghĩa trong tệp [docker-compose.yml](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/docker-compose.yml):
```yaml
  # Redis Container phục vụ làm cổng lọc danh sách đen Token
  redis:
    image: redis:7-alpine
    container_name: transcripthub-redis
    restart: always
    ports:
      - "6379:6379"
    networks:
      - transcripthub_net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
```

---

## 4. Hướng dẫn Kiểm tra dữ liệu trong Redis trực quan

Để xem và kiểm tra các token đã bị vô hiệu hóa có được lưu đúng vào Redis hay không:

### Bước 1: Mở Terminal của Container Redis
Nếu bạn dùng Docker Desktop, mở tab **Exec** của container `transcripthub-redis`. Hoặc chạy lệnh sau ở Terminal của máy:
```bash
docker exec -it transcripthub-redis redis-cli
```

### Bước 2: Truy vấn dữ liệu qua redis-cli
Khi giao diện chuyển về dạng `127.0.0.1:6379>`, chạy các câu lệnh:

1. **Liệt kê danh sách các token đang bị chặn:**
   ```bash
   keys *
   ```
   *(Kết quả sẽ hiển thị các key có dạng `blacklist:<chuỗi_token_dài>`)*

2. **Xem giá trị lưu trữ của token:**
   ```bash
   get blacklist:<chuỗi_token_dài>
   ```

3. **Xem thời gian tự động xóa còn lại của token (tính bằng giây):**
   ```bash
   ttl blacklist:<chuỗi_token_dài>
   ```

4. **Thoát giao diện kiểm tra:**
   ```bash
   exit
   ```
