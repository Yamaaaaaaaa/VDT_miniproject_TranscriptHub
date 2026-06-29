# Hướng dẫn Tạo và Cấu hình Máy ảo (Virtual Machine - VM) trên Google Cloud Platform (GCP)

Tài liệu này hướng dẫn chi tiết cách thiết lập máy ảo (Compute Engine Instance) trên GCP phù hợp với dự án **TranscriptHub** (sử dụng Docker Compose để chạy Microservices, Kafka, Zookeeper, MinIO, PostgreSQL, Redis và Next.js Frontend).

---

## 1. Đánh giá và Chọn Cấu hình Máy ảo (Sizing VM)

Dự án **TranscriptHub** chạy mô hình Microservices với nhiều container chạy đồng thời bao gồm:
*   **Infrastructure**: PostgreSQL, Redis, MinIO, Apache Kafka, Zookeeper, pgAdmin.
*   **Backend Services**: API Gateway, Users Service, Identity Service, File Service, Transcript Service, Meeting Service, Collab Service, Collab Gateway (WebSocket).
*   **Frontend**: Next.js (chạy SSR/Standalone).

> [!IMPORTANT]
> Do Kafka, Zookeeper và các dịch vụ NestJS tiêu tốn dung lượng RAM đáng kể trong quá trình khởi chạy và vận hành, cấu hình đề xuất như sau:
> *   **CPU / RAM**: Tối thiểu **4 GB RAM** (`e2-medium` - 2 vCPU, 4 GB memory). Khuyên dùng **8 GB RAM** (`e2-standard-2` - 2 vCPU, 8 GB memory) để đảm bảo hệ thống chạy mượt mà, không bị tràn RAM (Out of Memory - OOM).
> *   **Dung lượng đĩa (Boot Disk)**: Tối thiểu **30 GB - 50 GB** sử dụng ổ **SSD Persistent Disk** hoặc **Balanced Persistent Disk**. Các Docker image trong quá trình build và cache GitHub Actions chiếm khá nhiều dung lượng.
> *   **Hệ điều hành (OS)**: **Ubuntu 22.04 LTS** (ổn định nhất cho Docker và môi trường production).

---

## 2. Phương án 1: Tạo VM bằng GCP Console (Giao diện Web)

### Bước 1: Truy cập Compute Engine
1. Đăng nhập vào [Google Cloud Console](https://console.cloud.google.com/).
2. Chọn dự án (Project) của bạn ở góc trên bên trái.
3. Nhấp vào **Navigation Menu** (3 dấu gạch ngang) -> **Compute Engine** -> **VM instances**.
4. Chọn **Create Instance**.

### Bước 2: Cấu hình thông số Máy ảo
1.  **Name**: Nhập `transcripthub-server` (hoặc tên bất kỳ bạn muốn).
2.  **Region & Zone**: Chọn vùng gần Việt Nam nhất để tối ưu tốc độ mạng, ví dụ:
    *   Region: `asia-southeast1` (Singapore)
    *   Zone: `asia-southeast1-b` hoặc `asia-southeast1-a`
3.  **Machine configuration**:
    *   Machine family: **General-purpose**
    *   Series: **E2**
    *   Machine type: **e2-medium** (2 vCPU, 4 GB memory) hoặc **e2-standard-2** (2 vCPU, 8 GB memory - *Khuyên dùng*).
4.  **Boot disk**: Nhấp vào nút **Change**:
    *   Operating system: **Ubuntu**
    *   Version: **Ubuntu 22.04 LTS**
    *   Boot disk type: **Balanced Persistent Disk** (hoặc SSD để có tốc độ nhanh hơn).
    *   Size (GB): **40** (hoặc cao hơn).
    *   Nhấp **Select** để lưu.
5.  **Firewall**:
    *   Tích chọn **Allow HTTP traffic**
    *   Tích chọn **Allow HTTPS traffic**
    *(Điều này giúp GCP tự động tạo Firewall Rule mở cổng `80` và `443` cho VM)*.

### Bước 3: Hoàn tất tạo VM
1. Nhấp vào nút **Create** ở cuối trang.
2. Đợi 1-2 phút, bạn sẽ thấy VM instance mới xuất hiện trong danh sách kèm theo **External IP** (đây là IP công cộng để truy cập vào server).

---

## 3. Phương án 2: Tạo VM bằng gcloud CLI (Dòng lệnh)

Nếu bạn đã cài đặt và cấu hình [Google Cloud SDK](https://cloud.google.com/sdk) trên máy cá nhân, bạn có thể tạo nhanh VM bằng một dòng lệnh duy nhất trong PowerShell hoặc Terminal:

```bash
gcloud compute instances create transcripthub-server \
    --project="ID_PROJECT_CUA_BAN" \
    --zone="asia-southeast1-b" \
    --machine-type="e2-standard-2" \
    --network-interface="network-tier=PREMIUM,subnet=default" \
    --maintenance-policy="MIGRATE" \
    --provisioning-model="STANDARD" \
    --scopes="https://www.googleapis.com/auth/devstorage.read_only,https://www.googleapis.com/auth/logging.write,https://www.googleapis.com/auth/monitoring.write,https://www.googleapis.com/auth/servicecontrol,https://www.googleapis.com/auth/service.management.readonly,https://www.googleapis.com/auth/trace.append" \
    --tags="http-server,https-server,transcripthub-ports" \
    --create-disk="auto-delete=yes,boot=yes,device-name=transcripthub-server,image=projects/ubuntu-os-cloud/global/images/ubuntu-2204-jammy-v20240319,mode=rw,size=40,type=projects/ID_PROJECT_CUA_BAN/zones/asia-southeast1-b/diskTypes/pd-balanced" \
    --no-shielded-secure-boot \
    --shielded-vtpm \
    --shielded-integrity-monitoring \
    --reservation-affinity="any"
```
> [!NOTE]
> Thay thế `ID_PROJECT_CUA_BAN` bằng Project ID thực tế trên GCP của bạn.

---

## 4. Cấu hình Firewall Rule trên GCP

Mặc định, GCP chỉ mở cổng `22` (SSH), `80` (HTTP) và `443` (HTTPS). 
Nếu bạn muốn truy cập trực tiếp vào các cổng dịch vụ mà không qua Nginx Reverse Proxy (ví dụ: pgAdmin tại cổng `8080`, API Gateway tại cổng `3000`, Frontend tại `3333`), bạn cần tạo thêm Firewall Rule:

1. Trên GCP Console, tìm kiếm **VPC network** -> Chọn **Firewall**.
2. Nhấp vào **Create Firewall Rule**.
3. Cấu hình các thông số:
   *   **Name**: `allow-transcripthub-ports`
   *   **Targets**: Chọn **Specified target tags**.
   *   **Target tags**: Nhập `transcripthub-ports` (Đảm bảo tag này trùng với Network tag trên VM của bạn).
   *   **Source filter**: Chọn **IPv4 ranges**.
   *   **Source IPv4 ranges**: Nhập `0.0.0.0/0` (Cho phép mọi IP truy cập, hoặc cấu hình IP cụ thể của bạn để bảo mật).
   *   **Protocols and ports**: Tích chọn **Specified protocols and ports** -> tích chọn **TCP** -> nhập: `3000, 3333, 8080, 9100, 9101`.
4. Nhấn **Create**.
5. Quay lại trang cấu hình VM `transcripthub-server` -> Chọn **Edit** -> Tại phần **Network tags**, thêm tag `transcripthub-ports` -> Nhấn **Save**.

> [!TIP]
> Khuyên dùng: Để đảm bảo bảo mật cho hệ thống Production, **không** nên mở trực tiếp các cổng Database/Microservices ra Internet. Hãy cài đặt Nginx trên VM làm Reverse Proxy định tuyến cho cổng `80`/`443` vào API Gateway và Frontend (Tham khảo hướng dẫn [08_nginx_https.md](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/documents/deployment/08_nginx_https.md)).

---

## 5. Thiết lập Môi trường bên trong Máy ảo (VM Setup)

Sau khi tạo thành công VM, nhấp vào nút **SSH** ngay cạnh máy ảo trên GCP Console để mở Terminal điều khiển. Tiến hành cài đặt các công cụ cần thiết:

### 5.1. Cập nhật hệ thống và cài đặt Docker

Chạy các lệnh sau để cài đặt Docker và Docker Compose Plugin trên Ubuntu:

```bash
# Cập nhật index gói dịch vụ
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# Thêm khóa GPG chính thức của Docker
sudo mkdir -m 0755 -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Thiết lập repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Cài đặt Docker Engine và Docker Compose
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Phân quyền chạy Docker không cần sudo (Cần reconnect SSH sau khi chạy lệnh này)
sudo usermod -aG docker $USER
```

### 5.2. Clone dự án và khởi chạy bằng Docker Compose

1.  **Clone mã nguồn dự án**:
    ```bash
    git clone https://github.com/USERNAME/VDT_miniproject_TranscriptHub.git
    cd VDT_miniproject_TranscriptHub
    ```
2.  **Chuẩn bị file môi trường `.env`**:
    Tạo tệp `.env` tại thư mục gốc và thư mục `services_ms/` dựa trên các tệp mẫu `.env.example`.
3.  **Khởi chạy hệ thống**:
    ```bash
    docker compose up -d
    ```
4.  **Kiểm tra trạng thái các container**:
    ```bash
    docker compose ps
    ```
    Hãy đảm bảo tất cả các container chuyển sang trạng thái `running` (hoặc `healthy`).
