# Hướng dẫn Giám sát Hệ thống & Quản lý Log Tập trung

Tài liệu này hướng dẫn cách thiết lập hệ thống **Giám sát hiệu năng (Monitoring)** và **Gom Log tập trung (Centralized Logging)** sử dụng bộ công cụ **Prometheus**, **cAdvisor**, **Loki** và **Grafana** cho kiến trúc microservices TranscriptHub.

---

## 1. Tại sao cần Giám sát & Gom Log tập trung?

Trong mô hình Microservices:
1. **Khó điều tra lỗi**: Một request của người dùng đi qua nhiều service (Frontend -> API Gateway -> Identity -> Users). Nếu xảy ra lỗi, bạn phải lục lọi log của từng container rất mất thời gian.
2. **Quản lý tài nguyên**: Bạn cần biết chính xác service nào đang chiếm dụng nhiều RAM, CPU để tiến hành tối ưu hóa hoặc nâng cấp server kịp thời.

---

## 2. Mô hình Kiến trúc Giám sát & Logging

```
┌─────────────────┐      ┌────────────┐
│ Docker Daemon   ├─────►│ Promtail   │ (Thu thập log)
└─────────────────┘      └─────┬──────┘
                               │
                               ▼
┌─────────────────┐      ┌────────────┐      ┌───────────┐
│ Container Logs  ├─────►│ Loki       ├─────►│ Grafana   │ (Hiển thị biểu đồ & logs)
└─────────────────┘      └────────────┘      └─────▲─────┘
                                                   │
┌─────────────────┐      ┌────────────┐            │
│ cAdvisor        ├─────►│ Prometheus ├────────────┘
│ (Đo RAM/CPU)    │      │ (Lưu trữ)  │
└─────────────────┘      └────────────┘
```

---

## 3. Cấu hình Giám sát Hệ thống (Prometheus + cAdvisor)

### 3.1. Cấu hình Prometheus: `docker/prometheus/prometheus.yml`
Tạo file cấu hình để Prometheus quét dữ liệu hiệu năng từ cAdvisor mỗi 15 giây:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080'] # Quét dữ liệu từ container cAdvisor
```

---

## 4. Tích hợp Stack Giám sát vào Docker Compose

Tạo một file Docker Compose riêng biệt có tên là `docker-compose.monitoring.yml` để dễ dàng bật/tắt hệ thống giám sát khi cần:

```yaml
version: '3.8'

services:
  # cAdvisor: Đọc thông số RAM/CPU/Network trực tiếp từ Docker Socket
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.47.2
    container_name: transcripthub_cadvisor
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro
    expose:
      - 8080
    networks:
      - transcripthub_net
    restart: unless-stopped

  # Prometheus: Cơ sở dữ liệu lưu trữ các chỉ số đo lường hiệu năng
  prometheus:
    image: prom/prometheus:v2.45.0
    container_name: transcripthub_prometheus
    volumes:
      - ./docker/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"
    depends_on:
      - cadvisor
    networks:
      - transcripthub_net
    restart: unless-stopped

  # Grafana: Giao diện trực quan vẽ biểu đồ và hiển thị Log
  grafana:
    image: grafana/grafana:10.0.3
    container_name: transcripthub_grafana
    ports:
      - "3005:3000" # Ánh xạ ra cổng 3005 của máy host
    volumes:
      - grafana_data:/var/lib/grafana
    networks:
      - transcripthub_net
    restart: unless-stopped

  # Loki: Cơ sở dữ liệu gom log tập trung
  loki:
    image: grafana/loki:2.8.2
    container_name: transcripthub_loki
    ports:
      - "3100:3100"
    command: -config.file=/etc/loki/local-config.yaml
    networks:
      - transcripthub_net

  # Promtail: Client gom log từ Docker Daemon đẩy về Loki
  promtail:
    image: grafana/promtail:2.8.2
    container_name: transcripthub_promtail
    volumes:
      - /var/log:/var/log:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
    command: -config.file=/etc/promtail/config.yml
    # (Cấu hình Promtail gom log chi tiết tại docker/promtail/config.yml)
    networks:
      - transcripthub_net

volumes:
  prometheus_data:
  grafana_data:

networks:
  transcripthub_net:
    external: true # Sử dụng chung mạng ảo với app TranscriptHub
```

---

## 5. Hướng dẫn thiết lập và sử dụng trên Grafana

### Bước 1: Khởi chạy Stack Giám sát
```bash
docker compose -f docker-compose.monitoring.yml up -d
```
*Truy cập Grafana tại địa chỉ: `http://localhost:3005` (Tài khoản mặc định: `admin` / `admin`, hệ thống sẽ yêu cầu bạn đổi mật khẩu ngay lần đăng nhập đầu tiên).*

### Bước 2: Thêm nguồn dữ liệu (Data Source)
1. Trong giao diện Grafana, vào mục **Connections** -> **Data Sources** -> Nhấn **Add data source**.
2. **Thêm Prometheus**:
   * Chọn **Prometheus**.
   * Nhập URL: `http://prometheus:9090`.
   * Nhấn **Save & test**.
3. **Thêm Loki**:
   * Chọn **Loki**.
   * Nhập URL: `http://loki:3100`.
   * Nhấn **Save & test**.

### Bước 3: Xem Log tập trung
1. Vào mục **Explore** trong menu bên trái.
2. Chọn nguồn dữ liệu là **Loki**.
3. Tại ô truy vấn, bạn có thể lọc log của container cụ thể bằng lệnh:
   * `{container_name="transcripthub_api_gateway"}` để xem log của API Gateway.
   * `{container_name="transcripthub_users"}` để xem log của Users Service.
4. Bạn sẽ thấy luồng log hiển thị trực quan theo thời gian thực (Live), hỗ trợ tìm kiếm từ khóa lỗi nhanh chóng.

### Bước 4: Nhập biểu đồ giám sát mẫu (Dashboard)
Thay vì tự vẽ biểu đồ, bạn có thể sử dụng các Dashboard dựng sẵn của cộng đồng:
1. Vào mục **Dashboards** -> Nhấn **New** -> **Import**.
2. Nhập ID mẫu **14282** (Biểu đồ giám sát cAdvisor Docker Container chi tiết).
3. Chọn nguồn dữ liệu Prometheus vừa thêm và nhấn **Import**.
4. Bạn sẽ có ngay biểu đồ trực quan giám sát lượng RAM, CPU, mạng của từng container microservice đang chạy trên VPS.
