# Hướng dẫn Triển khai TranscriptHub từ đầu trên GCP VM (K3s) & CI/CD Pipeline

Tài liệu này hướng dẫn chi tiết từng bước (Step-by-Step) từ lúc bắt đầu tạo mới một máy ảo trên Google Cloud Platform (GCP) Compute Engine, thiết lập hạ tầng Kubernetes (k3s), cài đặt Ingress/Helm, clone dự án, đến việc cấu hình Secrets trên GitHub để chạy tự động luồng CI/CD (GitHub Actions).

---

## MỤC LỤC
1. [Bước 1: Tạo và cấu hình máy ảo Compute Engine trên GCP](#bước-1-tạo-và-cấu-hình-máy-ảo-compute-engine-trên-gcp)
2. [Bước 2: Kết nối SSH vào máy ảo GCP](#bước-2-kết-nối-ssh-vào-máy-ảo-gcp)
3. [Bước 3: Cài đặt và cấu hình cụm K8s (k3s)](#bước-3-cài-đặt-và-cấu-hình-cụm-k8s-k3s)
4. [Bước 4: Cài đặt Ingress Controller & Helm 3](#bước-4-cài-đặt-ingress-controller--helm-3)
5. [Bước 5: Cài đặt Git & Clone mã nguồn dự án](#bước-5-cài-đặt-git--clone-mã-nguồn-dự-án)
6. [Bước 6: Khởi tạo ConfigMap và Secrets trên cụm K8s](#bước-6-khởi-tạo-configmap-và-secrets-trên-cụm-k8s)
7. [Bước 7: Triển khai lớp hạ tầng (Databases & Message Broker)](#bước-7-triển-khai-lớp-hạ-tầng-databases--message-broker)
8. [Bước 8: Thiết lập tự động hóa CI/CD với GitHub Actions](#bước-8-thiết-lập-tự-động-hóa-cicd-với-github-actions)
9. [Bước 9: Cấu hình DNS phân giải tên miền ảo và Truy cập ứng dụng](#bước-9-cấu-hình-dns-phân-giải-tên-miền-ảo-và-truy-cập-ứng-dụng)

---

## Bước 1: Tạo và cấu hình máy ảo Compute Engine trên GCP

### 1.1. Khởi tạo VM Instance trên GCP Console:
1. Đăng nhập vào [Google Cloud Console](https://console.cloud.google.com/).
2. Chọn dự án của bạn $\rightarrow$ Mở menu bên trái chọn **Compute Engine** $\rightarrow$ **VM Instances**.
3. Nhấp vào nút **Create Instance**.
4. Thiết lập cấu hình máy ảo như sau:
   * **Name**: `transcripthub-prod-vm`
   * **Region & Zone**: Chọn khu vực gần bạn nhất (ví dụ: `asia-southeast1-a` tại Singapore).
   * **Machine configuration**: 
     * Series: **E2**
     * Machine type: **e2-standard-2** (2 vCPUs, 8 GB RAM) – *Đây là cấu hình tối thiểu để có thể gánh được toàn bộ 9 microservices cùng Kafka và DB.*
   * **Boot disk**:
     * Nhấp vào **Change** để thay đổi thông số đĩa cứng:
     * Operating system: **Ubuntu**
     * Version: **Ubuntu 22.04 LTS (x86/64)**
     * Boot disk type: **Balanced persistent disk** (hoặc SSD để tốc độ build/migration nhanh hơn).
     * Size (GB): Tối thiểu **40 GB** (khuyên dùng **50 GB**).
     * Nhấp **Select**.
   * **Firewall**: 
     * Tích chọn: **Allow HTTP traffic**
     * Tích chọn: **Allow HTTPS traffic** (Mở cổng 80 & 443 cho Nginx Ingress).
5. Nhấp vào nút **Create** ở dưới cùng để khởi tạo máy ảo.

### 1.2. Mở cổng kết nối API Server (Cổng 6443):
Để GitHub Actions ở bên ngoài có thể gửi lệnh triển khai trực tiếp vào cụm K8s trên VM, bạn cần mở cổng `6443` trên Firewall của GCP:
1. Trên GCP Console, vào **VPC Network** $\rightarrow$ **Firewall**.
2. Nhấp vào nút **Create Firewall Rule**.
3. Thiết lập thông số:
   * **Name**: `allow-k8s-api`
   * **Targets**: **Specified target tags**
   * **Target tags**: `transcripthub-ports`
   * **Source filter**: IPv4 ranges
   * **Source IPv4 ranges**: `0.0.0.0/0`
   * **Protocols and ports**: Tích chọn **Specified protocols and ports** $\rightarrow$ Tích chọn **TCP** và điền cổng `6443`.
4. Nhấp **Create**.
5. Quay lại danh sách VM Instances $\rightarrow$ Chọn VM vừa tạo $\rightarrow$ Nhấp **Edit** $\rightarrow$ Cuộn xuống mục **Network tags** điền tag `transcripthub-ports` $\rightarrow$ Nhấp **Save**.

---

## Bước 2: Kết nối SSH vào máy ảo GCP

Khi máy ảo đã khởi tạo xong và có địa chỉ IP Public (External IP), bạn có thể kết nối vào hệ điều hành bằng một trong hai cách:

### Cách 1: Sử dụng SSH trực tiếp từ Trình duyệt (Dễ nhất)
* Tại danh sách VM Instances trên GCP Console, nhấp thẳng vào chữ **SSH** ở cột **Connect** của máy ảo của bạn. Một cửa sổ dòng lệnh terminal sẽ tự động hiện lên trên trình duyệt.

### Cách 2: Sử dụng Terminal cục bộ (Máy cá nhân của bạn)
* Sử dụng khóa SSH cá nhân (Private Key) để truy cập thông qua Git Bash (Windows) hoặc Terminal (macOS/Linux):
  ```bash
  ssh -i <đường-dẫn-tới-ssh-private-key> <username-gcp>@<địa-chỉ-ip-ngoại-vi-gcp-vm>
  ```

---

## Bước 3: Cài đặt và cấu hình cụm K8s (k3s)

Sau khi đã SSH thành công vào máy ảo, hãy chạy các lệnh sau để cài đặt môi trường K8s siêu nhẹ (k3s):

### 3.1. Cập nhật hệ thống:
```bash
sudo apt-get update && sudo apt-get upgrade -y
```

### 3.2. Cài đặt k3s (vô hiệu hóa Traefik mặc định để dùng Nginx Ingress Controller):
```bash
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable traefik" sh -
```

### 3.3. Cấu hình phân quyền sử dụng `kubectl` không cần `sudo`:
Mặc định cấu hình Kubeconfig của k3s chỉ cho phép quyền root truy cập. Hãy chuyển cấu hình này về tài khoản user hiện tại của bạn:
```bash
# Tạo thư mục cấu hình cục bộ cho user
mkdir -p ~/.kube

# Sao chép tệp cấu hình k3s
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config

# Phân quyền tệp cho user hiện tại của bạn
sudo chown $USER:$USER ~/.kube/config

# Cấu hình biến môi trường vĩnh viễn
export KUBECONFIG=~/.kube/config
echo "export KUBECONFIG=~/.kube/config" >> ~/.bashrc
```

### 3.4. Xác minh trạng thái cụm K8s:
```bash
kubectl get nodes
```
*(Nếu trạng thái nút hiển thị là `Ready` tức là cụm K8s đã hoạt động bình thường).*

---

## Bước 4: Cài đặt Ingress Controller & Helm 3

### 4.1. Cài đặt Nginx Ingress Controller:
Sử dụng Ingress Nginx để xử lý phân giải tên miền ảo và định tuyến URL (`/`, `/api`, `/socket.io`):
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml
```
Kiểm tra trạng thái các Pod của Ingress hoạt động ổn định:
```bash
kubectl get pods -n ingress-nginx
```
*(Hãy đợi cho đến khi Pod của ingress-nginx chuyển sang trạng thái `Running`).*

### 4.2. Cài đặt Helm 3 (Dùng để cài đặt Loki/Prometheus sau này):
```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

---

## Bước 5: Cài đặt Git & Clone mã nguồn dự án

Để có sẵn các file cấu hình manifests (`k8s/`) trên máy ảo phục vụ việc khởi tạo cơ sở dữ liệu ban đầu:

### 5.1. Cài đặt Git:
```bash
sudo apt-get update
sudo apt-get install -y git
```

### 5.2. Clone mã nguồn dự án (nhánh `dev_js`):
```bash
# Clone dự án (hãy thay URL bằng đường dẫn Repository của bạn)
git clone -b dev_js <YOUR_GITHUB_REPOSITORY_URL>

# Truy cập vào thư mục gốc của dự án
cd VDT_miniproject_TranscriptHub
```

---

## Bước 6: Khởi tạo ConfigMap và Secrets trên cụm K8s

### 6.1. Tạo Namespace riêng cho dự án:
Tất cả các tài nguyên của dự án sẽ nằm trong namespace `transcripthub`:
```bash
kubectl create namespace transcripthub
```

### 6.2. Áp dụng tệp ConfigMap chứa thông số chung:
Tệp này chứa các cấu hình kết nối mạng thông thường giữa các service:
```bash
kubectl apply -f k8s/configmap.yaml
```

### 6.3. Khởi tạo Secrets bảo mật bằng câu lệnh CLI:
> [!WARNING]
> Không bao giờ lưu mật khẩu thật vào file YAML trên Git. Hãy thay thế các giá trị `"YOUR_..."` dưới đây bằng mật khẩu/khóa thật của bạn rồi copy chạy trực tiếp trên máy ảo:

```bash
kubectl create secret generic transcripthub-secrets \
  --from-literal=database-password="YOUR_DATABASE_PASSWORD" \
  --from-literal=jwt-secret="YOUR_JWT_SECRET_KEY" \
  --from-literal=jwt-refresh-secret="YOUR_JWT_REFRESH_SECRET_KEY" \
  --from-literal=gemini-api-key="YOUR_GEMINI_API_KEY" \
  --from-literal=nextauth-secret="YOUR_NEXTAUTH_SECRET_KEY" \
  -n transcripthub
```

---

## Bước 7: Triển khai lớp hạ tầng (Databases & Message Broker)

Trước khi khởi động các microservices của dự án, bạn cần triển khai và đảm bảo các cơ sở dữ liệu và hàng đợi tin nhắn hoạt động trước:

### 7.1. Chạy lệnh triển khai hạ tầng:
```bash
kubectl apply -f k8s/infrastructure/
```
Lệnh này sẽ tự động khởi chạy:
* **PostgreSQL** (lưu trữ thông tin tài khoản, người dùng, cuộc họp)
* **Redis** (dành cho bộ nhớ đệm và lưu cache phiên đăng nhập)
* **MinIO** (lưu trữ file âm thanh và transcript dạng thô, kèm Job tự động khởi tạo bucket)
* **Kafka & Zookeeper** (broker truyền thông điệp bất đồng bộ giữa các service)

### 7.2. Kiểm tra tiến trình hoạt động:
```bash
kubectl get pods -n transcripthub -w
```
*(Hãy nhấn `Ctrl + C` để thoát khi tất cả các Pod hạ tầng chuyển sang trạng thái `Running` hoặc `Completed` đối với job khởi tạo).*

---

## Bước 8: Thiết lập tự động hóa CI/CD với GitHub Actions

Mục tiêu: Đẩy code mới lên nhánh `dev_js` là hệ thống tự động build Docker image, đẩy lên Docker Hub và thực hiện Rolling Update (không downtime) lên cụm K8s của máy ảo GCP VM.

### 8.1. Khai báo Secrets trên GitHub Repository của bạn:
Truy cập vào trang dự án của bạn trên GitHub $\rightarrow$ **Settings** $\rightarrow$ **Secrets and variables** $\rightarrow$ **Actions** $\rightarrow$ **New repository secret** và thêm lần lượt các biến sau:

1. **`DOCKER_USERNAME`**: Tên tài khoản Docker Hub của bạn (dùng để lưu trữ ảnh Docker).
2. **`DOCKER_PASSWORD`**: Personal Access Token của Docker Hub (Tạo tại Docker Hub $\rightarrow$ Account Settings $\rightarrow$ Security $\rightarrow$ New Access Token).
3. **`GCP_VM_HOST`**: Địa chỉ IP Ngoại vi (External IP) của máy ảo GCP VM.
4. **`GCP_VM_USER`**: Tên tài khoản kết nối SSH của máy ảo (thường là username hiển thị trên GCP terminal, ví dụ `ubuntu` hoặc tên tài khoản Google của bạn).
5. **`GCP_SSH_PRIVATE_KEY`**: Nội dung toàn bộ file Khóa SSH Private Key dùng để truy cập vào máy ảo GCP (Bao gồm cả dòng `-----BEGIN OPENSSH PRIVATE KEY-----` và `-----END OPENSSH PRIVATE KEY-----`).

### 8.2. Kích hoạt luồng CI/CD:
* Thực hiện commit bất kỳ thay đổi nào hoặc chỉ cần đẩy nhánh `dev_js` lên GitHub:
  ```bash
  git add .
  git commit -m "feat: setup k8s manifests and cicd"
  git push origin dev_js
  ```
* Vào mục **Actions** trên GitHub để theo dõi tiến trình build và deploy tự động. Luồng CD sẽ tự kết nối SSH tới máy ảo GCP, cập nhật lại các file cấu hình K8s mới nhất, và ra lệnh cho k3s thực hiện cập nhật không gián đoạn (Zero-Downtime Rolling Update) cho toàn bộ 9 microservices và Next.js Frontend.

---

## Bước 9: Cấu hình DNS phân giải tên miền ảo và Truy cập ứng dụng

Dự án sử dụng Ingress để điều phối các yêu cầu từ tên miền `transcripthub.local`. Để có thể truy cập được ứng dụng từ máy cá nhân của bạn:

### 9.1. Trỏ Domain ảo trên máy cá nhân:
1. Mở file quản lý tên miền cục bộ trên máy tính của bạn:
   * **Trên Windows**: Mở Notepad bằng quyền Administrator, tìm mở tệp `C:\Windows\System32\drivers\etc\hosts`.
   * **Trên macOS/Linux**: Mở Terminal chạy lệnh `sudo nano /etc/hosts`.
2. Thêm dòng cấu hình sau vào cuối tệp (Thay thế địa chỉ IP bằng **IP Ngoại vi - External IP** của máy ảo GCP VM):
   ```text
   <IP-NGOAI-VI-GCP-VM> transcripthub.local
   ```
3. Lưu tệp lại.

### 9.2. Sử dụng ứng dụng:
* Mở trình duyệt web cá nhân và truy cập: `http://transcripthub.local` để bắt đầu trải nghiệm toàn bộ hệ thống TranscriptHub chạy trên K8s Production!

### 9.3. Cấu hình tên miền thật (Public Domain) qua Cloudflare hoặc Google Cloud DNS:
Nếu bạn muốn cấu hình tên miền thật của riêng mình (ví dụ: `yourdomain.com`) thay vì tên miền giả lập `transcripthub.local` để bất cứ ai cũng có thể truy cập qua Internet:

#### 1. Đăng ký IP Tĩnh (Static IP) cho máy ảo GCP:
Theo mặc định, IP ngoại vi của máy ảo là IP động (Ephemeral) và sẽ đổi mỗi lần khởi động lại máy ảo. Bạn nên chuyển nó sang IP tĩnh:
- Truy cập **GCP Console** $\rightarrow$ **VPC Network** $\rightarrow$ **IP Addresses**.
- Tìm dòng IP ngoại vi đang gắn với máy ảo của bạn.
- Nhấp vào biểu tượng ba dấu chấm `⋮` ở cột Actions $\rightarrow$ chọn **Promote to static IP address** và đặt tên cho IP này để chuyển từ *Ephemeral* sang *Static*.

#### 2. Cấu hình DNS trỏ về máy ảo qua Cloudflare (Khuyên dùng và hoàn toàn miễn phí):
- Thêm tên miền của bạn vào tài khoản Cloudflare và trỏ Name Servers của tên miền từ nhà đăng ký (Namecheap, GoDaddy...) về Cloudflare.
- Tại giao diện quản lý DNS của Cloudflare, thêm 2 bản ghi `A Record`:
  * **Bản ghi thứ 1 (Trỏ domain chính)**: Type: `A`, Name: `@` (hoặc tên miền chính), IPv4 address: `34.21.188.53`, Proxy status: **DNS Only** (Hoặc bật Proxy nếu muốn sử dụng CDN).
  * **Bản ghi thứ 2 (Trỏ wildcard cho các dịch vụ con)**: Type: `A`, Name: `*`, IPv4 address: `34.21.188.53`, Proxy status: **DNS Only**.

#### 3. Cập nhật cấu hình trong mã nguồn:
Khi chuyển sang tên miền thật, bạn cần sửa lại tất cả các chỗ cấu hình tên miền `transcripthub.local` thành tên miền thật của bạn:
- **Tệp [ingress.yaml](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/k8s/apps/ingress.yaml)**: Sửa tất cả các dòng `host: transcripthub.local` thành `host: yourdomain.com`.
- **Tệp [configmap.yaml](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/k8s/configmap.yaml)**: Sửa các biến Endpoint/URL sau sang tên miền mới:
  * `NEXTAUTH_URL` $\rightarrow$ `http://yourdomain.com`
  * `NEXT_PUBLIC_COLLAB_WS_URL` $\rightarrow$ `ws://yourdomain.com`
  * `NEXT_PUBLIC_COLLAB_SERVICE_URL` $\rightarrow$ `http://yourdomain.com`
  * `MINIO_PUBLIC_ENDPOINT` $\rightarrow$ `http://yourdomain.com`
- Thực hiện **Commit và Push** các thay đổi này lên GitHub (`git push origin dev_js`). Luồng CI/CD sẽ tự động deploy bản cập nhật mới lên máy ảo và bạn có thể mở trình duyệt truy cập thẳng qua tên miền thật của mình!
