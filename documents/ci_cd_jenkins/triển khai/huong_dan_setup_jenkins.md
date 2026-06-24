# Hướng dẫn Thiết lập và Chạy Jenkins bằng Docker Compose

Tài liệu này cung cấp hướng dẫn chi tiết cách thiết lập, khởi chạy và cấu hình Jenkins Server bằng Docker Compose cho dự án **TranscriptHub** trên môi trường local.

---

## 1. Tổng quan Kiến trúc

Để chạy được quy trình CI/CD tích hợp trong tệp `Jenkinsfile` của dự án, Jenkins Runner cần các công cụ sau để thực thi:
1. **Node.js & npm**: Để cài đặt dependencies, chạy linter (`npm run lint`), chạy Unit Tests (`npm run test`) và E2E Tests (`npm run test:e2e`) cho Backend (NestJS).
2. **Docker CLI**: Để thực thi lệnh build và push Docker images (`docker build`, `docker push`).
3. **Quyền truy cập Docker Daemon trên Host**: Jenkins container cần giao tiếp với Docker Daemon của máy host thông qua việc ánh xạ Docker socket (`/var/run/docker.sock`).

Do hình ảnh Jenkins mặc định (`jenkins/jenkins:lts`) không chứa sẵn **Node.js** và **Docker CLI**, dự án này sử dụng giải pháp **Tự xây dựng (Custom Dockerfile)** kết hợp với **Docker Compose** để khởi tạo Jenkins hoàn chỉnh, hoạt động ngay mà không cần cấu hình phức tạp.

### 1.1. Tại sao sử dụng tệp Compose riêng biệt (`docker-compose.jenkins.yml`)?

Dự án sử dụng tệp `docker-compose.jenkins.yml` riêng biệt cho Jenkins thay vì gộp chung vào `docker-compose.yml` chính của ứng dụng vì các lý do sau:

* **Tránh lỗi vòng lặp gián đoạn Pipeline (Quan trọng nhất)**: Trong giai đoạn triển khai (CD) của [Jenkinsfile](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/Jenkinsfile#L141-L161), Jenkins kết nối và chạy lệnh `docker compose up -d` để cập nhật các microservices. Nếu Jenkins nằm chung trong tệp compose đó, Docker Compose sẽ cố gắng cập nhật và khởi động lại chính container Jenkins đang chạy. Điều này sẽ kill tiến trình pipeline đang thực thi giữa chừng, gây lỗi deploy.
* **Tách biệt vai trò (Separation of Concerns)**: Tệp `docker-compose.yml` chính tập trung quản lý môi trường chạy ứng dụng (Database, Broker, các Microservices, Gateways...). Trong khi Jenkins thuộc về hạ tầng CI/CD (Developer Tooling) nên cần có vòng đời hoạt động riêng.
* **Tối ưu tài nguyên máy host (Resource Optimization)**: Jenkins hoạt động tương đối nặng (thường chiếm dụng 1GB - 2GB RAM để chạy ổn định). Việc tách riêng giúp nhà phát triển (developer) có thể tắt/bật Jenkins một cách độc lập khi code local để tránh làm chậm máy.

---

## 2. Cấu trúc Thư mục Thiết lập

Các tệp cấu hình đã được tạo sẵn ở thư mục gốc của dự án:

```text
VDT_miniproject_TranscriptHub/
├── jenkins/
│   └── Dockerfile               # Định nghĩa Dockerfile tùy chỉnh cài Node.js & Docker CLI
├── docker-compose.jenkins.yml   # Docker Compose dùng để khởi chạy Jenkins
├── Jenkinsfile                  # Quy trình CI/CD mẫu cho dự án
└── documents/ci_cd/triển khai/
    └── huong_dan_setup_jenkins.md # Tài liệu hướng dẫn này
```

### 2.1. Chi tiết tệp `jenkins/Dockerfile`
Tệp này tải hình ảnh cơ sở Jenkins LTS chính thức, cài đặt các công cụ biên dịch và thư viện cần thiết, sau đó cài đặt **Docker CLI** và **Node.js 20**:

```dockerfile
FROM jenkins/jenkins:lts-jdk17

USER root

# Cài đặt các thư viện bổ trợ và công cụ build
RUN apt-get update && apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Thêm GPG key và repository chính thức của Docker
RUN mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
    $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Cài đặt Docker CLI
RUN apt-get update && apt-get install -y \
    docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Cài đặt Node.js (v20.x) và npm
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Quay trở lại user mặc định của Jenkins
USER jenkins
```

### 2.2. Chi tiết tệp `docker-compose.jenkins.yml`
Tệp compose ánh xạ thư mục dữ liệu Jenkins ra ngoài máy host để không bị mất cấu hình khi container restart, đồng thời mount file socket `/var/run/docker.sock` từ máy host để Jenkins điều khiển được Docker daemon của host (Docker-out-of-Docker):

```yaml
services:
  jenkins:
    build:
      context: ./jenkins
      dockerfile: Dockerfile
    container_name: transcripthub-jenkins
    restart: always
    user: root # Chạy với quyền root để tránh xung đột quyền ghi đè docker.sock trên host
    ports:
      - "8085:8080"     # Giao diện Web UI của Jenkins
      - "50000:50000"   # Cổng kết nối Agent của Jenkins (nếu cần scale-out)
    environment:
      - TZ=Asia/Ho_Chi_Minh
    volumes:
      - jenkins_data:/var/jenkins_home
      # Ánh xạ Docker socket để Jenkins container điều khiển Docker máy host
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - jenkins_net

volumes:
  jenkins_data:
    driver: local

networks:
  jenkins_net:
    driver: bridge
```

---

## 3. Các bước Khởi chạy Jenkins

### Bước 1: Khởi động Jenkins Container
Mở Terminal tại thư mục gốc của dự án và chạy lệnh sau để build ảnh Docker tùy chỉnh và chạy ở chế độ background:

```bash
docker compose -f docker-compose.jenkins.yml up -d --build
```

### Bước 2: Kiểm tra Trạng thái Container
Đảm bảo container `transcripthub-jenkins` đang hoạt động bình thường:

```bash
docker compose -f docker-compose.jenkins.yml ps
```

### Bước 3: Kiểm tra các Công cụ được Tích hợp
Bạn có thể xác nhận các công cụ đã được cài đặt thành công bên trong container Jenkins:

```bash
docker exec transcripthub-jenkins node -v
docker exec transcripthub-jenkins npm -v
docker exec transcripthub-jenkins docker -v
```
*(Nếu hiển thị phiên bản Node.js v20, npm và Docker CLI tức là việc cài đặt đã hoàn tất thành công)*

### Bước 4: Lấy Mật khẩu thiết lập Ban đầu
Khi Jenkins khởi chạy lần đầu, nó sẽ tự động sinh ra một mật khẩu bảo mật. Lấy mật khẩu này bằng lệnh:

```bash
docker exec transcripthub-jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```
*Hãy copy mã chuỗi ký tự hiển thị trên màn hình để sử dụng cho bước kích hoạt.*

---

## 4. Cấu hình Jenkins Web UI (Lần đầu truy cập)

1. Mở trình duyệt và truy cập: [http://localhost:8085](http://localhost:8085)
2. Dán mã mật khẩu vừa lấy ở **Bước 4** vào ô **Administrator password** và nhấn **Continue**.
3. Chọn **Install suggested plugins** để Jenkins tự động tải và cài đặt các plugin thiết yếu mặc định (như Git, Pipeline, Workspace Cleanup, v.v.). Quá trình này có thể mất vài phút.
4. Sau khi cài đặt xong, Jenkins sẽ yêu cầu bạn tạo tài khoản **Admin** đầu tiên. Nhập đầy đủ thông tin:
   * **Username**: `admin` (hoặc tuỳ chọn)
   * **Password**: `mật khẩu tự chọn`
   * **Full name** & **E-mail address**: Nhập thông tin của bạn.
5. Nhấn **Save and Finish**, sau đó nhấn **Start using Jenkins**.

---

## 5. Cài đặt thêm các Plugin Bổ trợ

Để Jenkins có thể chạy được quy trình deploy lên VPS (hoặc Kubernetes nếu dùng K8s), bạn cần bổ sung một số plugin sau:

1. Từ trang chủ Jenkins, truy cập **Manage Jenkins** (Quản lý Jenkins) -> **Plugins**.
2. Chọn mục **Available plugins** (Plugin có sẵn) ở thanh bên trái.
3. Tìm kiếm và tích chọn các plugin sau:
   * **SSH Agent Plugin** (Bắt buộc cho CD deploy lên VPS bằng SSH như trong `Jenkinsfile`).
   * **Docker Pipeline** (Nếu pipeline cần các tính năng đóng gói nâng cao).
   * **Kubernetes CLI** (Nếu bạn cấu hình deploy lên cụm Kubernetes/Minikube).
4. Nhấn **Install** để bắt đầu cài đặt. Chọn tick vào ô *Restart Jenkins when installation is complete and no jobs are running* để Jenkins tự khởi động lại sau khi cài xong.

---

## 6. Thiết lập Credentials (Thông tin xác thực)

Tệp `Jenkinsfile` ở thư mục gốc của dự án yêu cầu các Credentials bảo mật để kết nối với Docker Hub và VPS. Hãy cấu hình chúng trên Jenkins Web UI:

Truy cập: **Manage Jenkins** -> **Credentials** -> **System** -> **Global credentials (unrestricted)** -> Nhấn **Add Credentials** ở góc phải.

### 6.1. Cấu hình Docker Hub Credentials (`dockerhub-credentials`)
Để đẩy Docker Images lên Docker Hub sau khi build:
* **Kind**: `Username with password`
* **Scope**: `Global`
* **ID**: `dockerhub-credentials` *(Bắt buộc phải khớp chính xác với biến `DOCKER_CREDS_ID` trong `Jenkinsfile`)*
* **Username**: Tên tài khoản Docker Hub của bạn (ví dụ: `yourdockerhubusername`).
* **Password**: **Access Token** của Docker Hub (Khuyến nghị tạo Access Token trong phần Account Settings của Docker Hub thay vì dùng mật khẩu chính để bảo mật).
* **Description**: `Docker Hub account for TranscriptHub`

### 6.2. Cấu hình VPS SSH Key Credentials (`vps-ssh-key`)
Để Jenkins SSH vào VPS chạy lệnh deploy:
* **Kind**: `SSH Username with private key`
* **Scope**: `Global`
* **ID**: `vps-ssh-key` *(Bắt buộc phải khớp chính xác với biến `SSH_CREDS_ID` trong `Jenkinsfile`)*
* **Username**: User SSH của VPS (ví dụ: `ubuntu`, `root`).
* **Private Key**: Chọn **Enter directly** -> nhấn **Add** và dán toàn bộ nội dung của tệp SSH Private Key của bạn (nội dung file `id_rsa` dùng để SSH từ máy của bạn tới VPS).
* **Description**: `SSH Private Key for VPS Deployment`

---

## 7. Hướng dẫn Tạo và Chạy Pipeline Job

1. Tại trang chủ Jenkins, chọn **New Item** (Tạo Job mới).
2. Nhập tên Job (ví dụ: `TranscriptHub-Pipeline`), chọn kiểu **Pipeline**, sau đó nhấn **OK**.
3. Cuộn xuống phần **Pipeline**:
   * **Definition**: Chọn `Pipeline script from SCM`.
   * **SCM**: Chọn `Git`.
   * **Repository URL**: Nhập link repository Git của dự án (ví dụ: `https://github.com/username/VDT_miniproject_TranscriptHub.git`).
   * **Credentials**: Nếu repo của bạn là private, hãy thêm credentials dạng *Username with password* (hoặc Git Personal Access Token) để Jenkins có quyền clone mã nguồn.
   * **Branch Specifier**: Điền nhánh muốn build (ví dụ: `*/main` hoặc `*/master`).
   * **Script Path**: Nhập `Jenkinsfile` (đây là tệp pipeline mặc định nằm ở gốc dự án).
4. Nhấn **Save** (Lưu lại).
5. Để chạy pipeline thủ công lần đầu, nhấn **Build Now** (Xây dựng ngay) ở thanh menu bên trái. Jenkins sẽ kéo code về và thực hiện toàn bộ quy trình:
   * **Prepare & Verify**: Kiểm tra phiên bản Node, npm, Docker CLI.
   * **Lint & Unit Test**: Chạy song song kiểm thử Backend NestJS (bao gồm cả Unit Test và E2E Test) và Frontend Next.js.
   * **Docker Build & Push**: Đóng gói Docker images của tất cả services và push lên Docker Hub.
   * **Deploy to VPS**: Kết nối qua SSH để pull và cập nhật các container trên VPS.

---

## 8. Hướng dẫn Khắc phục Sự cố Thường gặp (Troubleshooting)

### 8.1. Lỗi phân quyền Docker Socket (`Permission Denied` trên `/var/run/docker.sock`)
* **Nguyên nhân**: Khi Jenkins chạy các lệnh `docker build`, nó truy cập file socket `/var/run/docker.sock` trên host. Nếu file socket này giới hạn quyền ghi cho root, user `jenkins` bên trong container sẽ không chạy được Docker commands.
* **Cách xử lý**:
  Trong tệp `docker-compose.jenkins.yml` của dự án, cấu hình `user: root` đã được thêm sẵn để ép container chạy với quyền tối cao. Nếu bạn gỡ bỏ dòng này và gặp lỗi phân quyền, bạn có thể phân quyền lại cho socket trên máy host (nếu chạy Linux/WSL2):
  ```bash
  sudo chmod 666 /var/run/docker.sock
  ```

### 8.2. Lỗi `host.docker.internal` không phân giải được IP trên Linux/WSL2
* **Nguyên nhân**: Khi cần kết nối từ bên trong Jenkins container ngược lại máy host (ví dụ connect Minikube chạy ở host), `host.docker.internal` đôi khi không tự động map IP trên các hệ điều hành không phải Windows/macOS.
* **Cách xử lý**:
  Thêm cấu hình `extra_hosts` vào service `jenkins` trong tệp `docker-compose.jenkins.yml`:
  ```yaml
  extra_hosts:
    - "host.docker.internal:host-gateway"
  ```

### 8.3. Hết dung lượng đĩa (Disk Space Exhausted) do Docker Images cũ
* **Nguyên nhân**: Mỗi lần chạy pipeline, Jenkins sẽ build hàng loạt docker images mới và lưu đệm (cache) trên máy chạy Jenkins. Theo thời gian, điều này sẽ làm đầy ổ cứng.
* **Cách xử lý**:
  Trong phần `post -> always` của `Jenkinsfile`, lệnh dọn dẹp các ảnh build thừa đã được tích hợp sẵn:
  ```groovy
  sh "docker rmi \$(docker images | grep '${env.DOCKER_USER}/transcripthub' | awk '{print \$3}') -f || true"
  ```
  Bạn cũng có thể cấu hình cronjob trên máy host chạy Jenkins để dọn dẹp định kỳ:
  ```bash
  docker image prune -af --volumes
  ```
