# Tổng quan về GitHub Actions - Công cụ Tự động hóa Workflow

Tài liệu này giới thiệu chi tiết về **GitHub Actions**, giải pháp CI/CD được tích hợp sẵn trên nền tảng GitHub. Hiểu rõ GitHub Actions sẽ giúp bạn làm chủ quy trình tự động hóa tích hợp và triển khai liên tục cho dự án **TranscriptHub** trên môi trường máy chủ VPS.

---

## 1. GitHub Actions là gì?

**GitHub Actions** là một nền tảng tích hợp liên tục (CI) và phân phối liên tục (CD) cho phép bạn tự động hóa quy trình xây dựng, kiểm thử và triển khai mã nguồn trực tiếp từ GitHub. Bạn có thể viết các quy trình công việc (Workflows) để thực thi bất cứ khi nào có sự kiện xảy ra trong kho chứa (Repository) của bạn (ví dụ: tạo Pull Request, push code lên nhánh `dev_js`, tạo Release, hoặc theo lịch định sẵn).

```mermaid
graph TD
    Code[Git Push / PR to dev_js] --> GHA{GitHub Actions}
    GHA --> Job1[Job 1: Lint & Test <br> Node.js Env]
    GHA --> Job2[Job 2: Docker Build & Push <br> Docker Env]
    Job1 -->|needs| Job2
    Job2 --> Job3[Job 3: Deploy to VPS via SSH]
    Job2 -->|needs| Job3
```

---

## 2. Tại sao chọn GitHub Actions cho dự án chạy trên VPS?

So với các công cụ CI/CD truyền thống như Jenkins, GitHub Actions sở hữu nhiều ưu điểm vượt trội giúp đơn giản hóa quy trình DevOps, đặc biệt là đối với các dự án lưu trữ mã nguồn trên GitHub và triển khai trên VPS như **TranscriptHub**:

### 2.1. Tích hợp sâu với Hệ sinh thái GitHub
* **Kích hoạt tự động dựa trên sự kiện (Event-driven)**: Bạn có thể kích hoạt pipeline bằng hầu hết mọi hành động diễn ra trên GitHub (Push, Pull Request, gắn Label, tạo Issue, Star, Release,...).
* **Quản lý quyền tối ưu**: Liên kết trực tiếp với GitHub Accounts và GitHub Teams. Bạn không cần cấu hình phân quyền người dùng phức tạp như trên Jenkins.
* **Giao diện trực quan**: Kết quả build, logs kiểm thử, các bước chạy được tích hợp hiển thị trực tiếp trong trang Pull Request (PR Checks).

### 2.2. Mô hình Serverless (Cloud-hosted Runners) & Không tốn tài nguyên VPS để Build
* **Không cần tự cài đặt và bảo trì máy chủ build**: GitHub cung cấp sẵn các máy ảo (GitHub-hosted runners) chạy hệ điều hành Ubuntu để thực thi các job CI/CD. Bạn không cần lo lắng về việc nâng cấp hệ điều hành, cài Java, cấu hình RAM/CPU hay xử lý lỗi đĩa đầy như Jenkins.
* **Giải phóng tài nguyên cho VPS**: Toàn bộ quá trình chạy thử nghiệm, cài đặt node_modules và build 9 Docker Images (rất nặng và tốn CPU/RAM) đều diễn ra trên máy ảo Cloud miễn phí của GitHub. Máy chủ VPS của bạn chỉ làm nhiệm vụ chạy ứng dụng thực tế (Runtime) và chỉ cần thực thi lệnh pull ảnh mới rồi restart nhẹ nhàng qua SSH, hoàn toàn không bị ảnh hưởng hiệu năng trong quá trình build.
* **Chính sách chi phí**:
  * **Miễn phí** và không giới hạn số phút build đối với tất cả **Kho chứa Công khai (Public Repositories)**.
  * Đối với **Kho chứa Riêng tư (Private Repositories)**, GitHub tặng sẵn 2,000 phút build miễn phí mỗi tháng (cho tài khoản Free) trước khi tính phí.

### 2.3. Chợ ứng dụng GitHub Marketplace khổng lồ
Thay vì cài đặt các Plugins phức tạp và dễ xung đột phiên bản như Jenkins, GitHub Actions sử dụng các **Actions** được chia sẻ và phiên bản hóa trên **GitHub Marketplace**.
* **Dễ sử dụng**: Bạn chỉ cần gọi Action thông qua cú pháp `uses: tác_giả/tên_action@phiên_bản`.
* **Cộng đồng lớn mạnh**: Hàng ngàn Action có sẵn từ các nhà phát triển lớn như Docker (để build/push image), Appleboy (để chạy lệnh SSH trên VPS), Slack, v.v.

---

## 3. Kiến trúc của GitHub Actions

Một quy trình GitHub Actions được cấu thành từ các thành phần cốt lõi sau:

```mermaid
graph TD
    Workflow[Workflow <br> file .yml] --> Event[Event <br> push, pull_request]
    Workflow --> Runner[Runner <br> Máy ảo thực thi]
    Runner --> Job1[Job 1]
    Runner --> Job2[Job 2]
    Job1 --> Step1[Step 1: uses Action]
    Job1 --> Step2[Step 2: run Command]
```

### 3.1. Workflows (Quy trình công việc)
* Là một quy trình tự động được định nghĩa bằng tệp định dạng **YAML** nằm tại thư mục chuyên biệt: **`.github/workflows/`**.
* Tệp cấu hình chính của dự án là [ci-cd.yml](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/.github/workflows/ci-cd.yml).

### 3.2. Events (Sự kiện kích hoạt)
* Là hành động cụ thể kích hoạt Workflow chạy. Các ví dụ phổ biến:
  * `push`: Kích hoạt khi push code lên nhánh được chỉ định (nhánh `dev_js`).
  * `pull_request`: Kích hoạt khi có PR tạo mới hoặc cập nhật vào nhánh `dev_js`.
  * `workflow_dispatch`: Cho phép bấm nút chạy thủ công từ giao diện web GitHub.

### 3.3. Jobs (Công việc)
* Một Workflow chứa một hoặc nhiều **Jobs**.
* Theo mặc định, các Job sẽ chạy **song song (parallel)** với nhau trên các máy ảo (Runners) độc lập.
* Chúng ta thiết lập sự phụ thuộc bằng từ khóa `needs` để Job Deploy chỉ chạy sau khi Job Build & Push Docker thành công.

### 3.4. Steps (Các bước)
* Mỗi Job bao gồm nhiều **Steps** chạy tuần tự.
* Một Step có thể là:
  * Một câu lệnh shell chạy trực tiếp (sử dụng từ khóa `run`).
  * Một Action được gọi từ bên ngoài hoặc từ Marketplace (sử dụng từ khóa `uses`).

---

## 4. So sánh GitHub Actions và Jenkins

Dưới đây là bảng so sánh trực quan giúp bạn hiểu rõ sự khác biệt giữa hai công cụ CI/CD hàng đầu này:

| Tiêu chí | Jenkins | GitHub Actions |
| :--- | :--- | :--- |
| **Mô hình** | Tự quản lý hoàn toàn (Self-hosted) | Dịch vụ đám mây (SaaS/Managed) |
| **Cấu hình** | Viết bằng mã lệnh Groovy (`Jenkinsfile`) | Định nghĩa bằng YAML (`.github/workflows/*.yml`) |
| **Cài đặt ban đầu** | Khá phức tạp (phải cài Java, cấu hình server, cài Plugins) | Không cần cài đặt (Hoạt động ngay lập tức trên repository GitHub) |
| **Hạ tầng (Runner)** | Cần tự quản lý và cấp phát các Agents | Sử dụng máy ảo sẵn có của GitHub để build |
| **Plugins vs Actions** | Sử dụng Plugins tải về (dễ gặp lỗi tương thích, lỗi bảo mật) | Sử dụng Actions từ GitHub Marketplace (bảo mật tốt hơn, phân bản rõ ràng) |
| **Tài nguyên VPS** | Tốn RAM/CPU của VPS để chạy Jenkins Server và build image | VPS hoàn toàn rảnh rỗi trong lúc build, chỉ nhận lệnh deploy cuối cùng |
| **Độ tin cậy** | Có thể bị treo, đầy ổ cứng, lỗi master nếu cấu hình kém | Rất cao nhờ hạ tầng đám mây phân tán của GitHub |
| **Đăng nhập & Bảo mật** | Quản lý qua Jenkins Credentials Store | Sử dụng GitHub Secrets lưu trữ mã hóa ở mức Repository |

---

## 5. Ví dụ cấu hình một Workflow GitHub Actions đơn giản cho VPS

Tệp `.github/workflows/demo.yml` tiêu chuẩn:
```yaml
name: Node.js CI Demo

# Kích hoạt khi push lên nhánh dev_js
on:
  push:
    branches: [ dev_js ]
  pull_request:
    branches: [ dev_js ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest # Chạy trên máy ảo Ubuntu mới nhất của GitHub

    steps:
    - name: Checkout code
      uses: actions/checkout@v4 # Kéo mã nguồn về máy ảo

    - name: Use Node.js
      uses: actions/setup-node@v4 # Cài đặt Node.js
      with:
        node-version: '20'
        cache: 'npm' # Tự động cache các thư viện node_modules

    - name: Install dependencies
      run: npm ci

    - name: Run Lint
      run: npm run lint

    - name: Run Test
      run: npm test
```
* **`name`**: Tên hiển thị của workflow trên giao diện GitHub.
* **`on`**: Định nghĩa các trigger kích hoạt workflow.
* **`jobs`**: Danh sách các job cần thực thi.
* **`runs-on`**: Khai báo môi trường chạy job.
* **`steps`**: Các bước chạy tuần tự, kết hợp gọi Actions từ Marketplace (`uses`) và chạy shell script trực tiếp (`run`).
