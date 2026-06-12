# Hướng dẫn Thiết lập Nginx Reverse Proxy & HTTPS (SSL/TLS)

Tài liệu này hướng dẫn chi tiết cách cấu hình **Nginx** làm Reverse Proxy đứng đầu hệ thống TranscriptHub để định tuyến lưu lượng truy cập và thiết lập mã hóa bảo mật **HTTPS** (SSL/TLS).

---

## 1. Tại sao cần Nginx làm Reverse Proxy?

Trong môi trường Production thực tế, ta không nên mở cổng của API Gateway (`3000`) hay Frontend (`3333`) trực tiếp ra internet vì:
1. **Thiếu mã hóa bảo mật**: Mặc định các service này chạy trên giao thức HTTP không mã hóa dữ liệu truyền tải.
2. **Khó quản lý Domain**: Rất khó cấu hình chạy chung một tên miền (Domain) cho cả Frontend và API Gateway trên các cổng khác nhau.
3. **Hiệu năng**: Nginx tối ưu hóa việc phân phát các file tĩnh (static files), nén dữ liệu (Gzip/Brotli) và xử lý SSL handshake nhanh hơn Node.js rất nhiều.

```
                  ┌───────────────────────────────────────────────┐
                  │                 Máy chủ VPS                   │
                  │                                               │
                  │   Nginx (Cổng 80/443 HTTPS)                   │
                  │       │                                       │
                  │       ├─► (Đường dẫn /)     ─► Frontend :3000 │
Trình duyệt ─────►│       │                                       │
(HTTPS Request)   │       └─► (Đường dẫn /api) ─► Gateway  :3000 │
                  │                                               │
                  └───────────────────────────────────────────────┘
```

---

## 2. File cấu hình Nginx mẫu: `nginx.conf`

Dưới đây là file cấu hình Nginx chuẩn để chạy hệ thống trên cùng một tên miền (Ví dụ: `transcripthub.example.com`).

Tạo thư mục `docker/nginx` và lưu file cấu hình này tại `docker/nginx/default.conf`:

```nginx
# Cấu hình nén gzip để tối ưu hóa tốc độ tải trang
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml;

# 1. Server Block chuyển hướng HTTP -> HTTPS (Buộc bảo mật)
server {
    listen 80;
    listen [::]:80;
    server_name transcripthub.example.com;

    # Chuyển hướng toàn bộ request từ http:// sang https://
    return 301 https://$host$request_uri;
}

# 2. Server Block HTTPS chính
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name transcripthub.example.com;

    # Cấu hình đường dẫn chứa chứng chỉ SSL (Let's Encrypt cấp)
    ssl_certificate /etc/letsencrypt/live/transcripthub.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/transcripthub.example.com/privkey.pem;

    # Cấu hình SSL tối ưu hóa bảo mật
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Hỗ trợ upload file dung lượng lớn (nếu cần thiết)
    client_max_body_size 50M;

    # Định tuyến các request API (Bắt đầu bằng /api) sang API Gateway
    location /api {
        proxy_pass http://api-gateway:3000; # Tên service trong Docker Compose
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Định tuyến tất cả các request còn lại sang Frontend Next.js
    location / {
        proxy_pass http://frontend:3000;    # Port 3000 nội bộ của Next.js Container
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 3. Tích hợp Nginx vào Docker Compose cho Production

Bổ sung service `nginx` vào file `docker-compose.yml` để tự động khởi chạy và nạp cấu hình:

```yaml
  # ─────────────────────────────────────────────
  # Nginx Reverse Proxy (Cổng ngoài HTTPS)
  # ─────────────────────────────────────────────
  nginx:
    image: nginx:1.25-alpine
    container_name: transcripthub_nginx
    restart: unless-stopped
    ports:
      - "80:80"   # Mở cổng HTTP để redirect
      - "443:443" # Mở cổng HTTPS bảo mật
    volumes:
      # Mount file cấu hình vào container
      - ./docker/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      # Mount thư mục chứng chỉ SSL từ máy Host vào Container (Let's Encrypt)
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - api-gateway
      - frontend
    networks:
      - transcripthub_net
```
*Lưu ý: Sau khi tích hợp Nginx, bạn có thể đóng (xóa bỏ) phần `ports` ánh xạ trực tiếp của `api-gateway` (`3000:3000`) và `frontend` (`3333:3000`) ra ngoài máy host để tăng tính bảo mật, bắt buộc mọi request đi qua Nginx cổng 80/443.*

---

## 4. Hướng dẫn sinh chứng chỉ SSL miễn phí với Let's Encrypt

Khi triển khai trên máy chủ Linux (Ubuntu/Debian), hãy dùng công cụ **Certbot** để tạo SSL:

### Bước 1: Cài đặt Certbot và Nginx Plugin
```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
```

### Bước 2: Tạo chứng chỉ SSL cho Domain của bạn
```bash
sudo certbot certonly --nginx -d transcripthub.example.com
```
*Certbot sẽ tự động xác thực tên miền của bạn và sinh ra các file chứng chỉ SSL tại thư mục `/etc/letsencrypt/live/transcripthub.example.com/`.*

### Bước 3: Thiết lập tự động gia hạn SSL
Chứng chỉ của Let's Encrypt có hiệu lực trong 90 ngày. Bạn có thể kiểm tra cơ chế tự động gia hạn của Certbot bằng lệnh:
```bash
sudo certbot renew --dry-run
```
*(Certbot đã tự động thêm một cronjob chạy dưới nền hệ thống của bạn để tự động gia hạn trước khi hết hạn 30 ngày).*
