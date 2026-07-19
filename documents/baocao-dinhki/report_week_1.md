# BÁO CÁO TUẦN 1

## MỤC LỤC

- [NỘI DUNG TỔNG HỢP](#nội-dung-tổng-hợp)
- [PHẦN 1: LỘ TRÌNH HỌC TẬP (LEARNING ROADMAP)](#phần-1-lộ-trình-học-tập-learning-roadmap)
- [PHẦN 2: KHỞI ĐỘNG MINI-PROJECT TRANSCRIPTHUB (PROJECT INITIATION)](#phần-2-khởi-động-mini-project-transcripthub-project-initiation)
  - [2.1 Đặt vấn đề và Mục tiêu dự án](#21-đặt-vấn-đề-và-mục-tiêu-dự-án)
  - [2.2 Các chức năng chính của hệ thống](#22-các-chức-năng-chính-của-hệ-thống)
  - [2.3 Ngăn xếp công nghệ sử dụng (Technology Stack)](#23-ngăn-xếp-công-nghệ-sử-dụng-technology-stack)
- [PHẦN 3: THIẾT KẾ HỆ THỐNG VÀ CƠ SỞ DỮ LIỆU (SYSTEM DESIGN & DATABASE)](#phần-3-thiết-kế-hệ-thống-và-cơ-sở-dữ-liệu-system-design--database)
  - [3.1 Kiến trúc hệ thống logic](#31-kiến-trúc-hệ-thống-logic)
  - [3.2 Thiết kế Cơ sở dữ liệu (Database Design)](#32-thiết-kế-cơ-sở-dữ-liệu-database-design)
    - [3.2.1 Sơ đồ mối quan hệ thực thể (ERD Diagram)](#321-sơ-đồ-mối-quan-hệ-thực-thể-erd-diagram)
    - [3.2.2 Mô tả chi tiết các bảng dữ liệu](#322-mô-tả-chi-tiết-các-bảng-dữ-liệu)

---

## NỘI DUNG TỔNG HỢP

Trong suốt quá trình thực tập trong tuần này, các nhiệm vụ chính cần thực hiện bao gồm hai phần cốt lõi:

**Phần 1: Học tập và nghiên cứu kiến thức nền tảng (3 buổi đầu)**

- **Version Control System (VCS):** Nắm vững vai trò của VCS, cách sử dụng Git để quản lý mã nguồn, làm việc nhóm, và vai trò của Git trong quy trình CI/CD.
- **Hệ điều hành Linux:** Sử dụng giao diện dòng lệnh (CLI), làm quen với quản lý file/thư mục, cấu hình lập lịch tác vụ tự động bằng Crontab, cài đặt quản lý gói phần mềm, và viết kịch bản bash script cơ bản.
- **Containerization (Docker):** Tìm hiểu kiến trúc Container so với Virtual Machine, cách viết Dockerfile đóng gói ứng dụng, sử dụng Docker Compose để quản lý đa dịch vụ, thiết lập Network và Storage cục bộ.

**Phần 2: Khởi động và triển khai dự án Miniproject (TranscriptHub)**

- **Phân tích và khởi tạo:** Khảo sát nghiệp vụ biên dịch biên bản họp, xây dựng mục tiêu và danh sách chức năng nghiệp vụ của hệ thống.
- **Thiết kế hệ thống:** Thiết kế kiến trúc Microservices Monorepo sử dụng giao tiếp TCP nội bộ kết hợp Event-Driven với Apache Kafka để đảm bảo khả năng mở rộng và xử lý phi chặn (Non-blocking).
- **Thiết kế Cơ sở dữ liệu:** Thiết kế cơ sở dữ liệu PostgreSQL phân tách logic multi-schema (Identity, Users, Files, Transcripts, Meetings).
- **Triển khai ứng dụng:** Lập trình Frontend (Next.js, Quill Editor, Yjs) và Backend Microservices (NestJS, Redis, MinIO, Google Gemini AI API). Đóng gói và điều phối toàn bộ hệ thống lên cụm Kubernetes.

---

## PHẦN 1: LỘ TRÌNH HỌC TẬP (LEARNING ROADMAP)

Dưới đây là tóm tắt nội dung đào tạo của 3 buổi học đầu tiên của **Công Ty Cổ Phần Viễn Thông Quân Đội Viettel** nhằm trang bị kiến thức nền tảng về quản lý mã nguồn, vận hành hệ thống và đóng gói ứng dụng:

| Buổi học | Môn học / Chủ đề | Nội dung chi tiết |
|----------|-----------------|-------------------|
| **Buổi 1** | Version Control System (VCS) | - Hiểu vai trò của VCS trong quy trình phát triển phần mềm và làm việc nhóm. <br>- Hướng dẫn sử dụng Git cơ bản để quản lý mã nguồn, phân nhánh (branching) và quản lý phiên bản. <br>- Vai trò của DevOps và Git trong việc tự động hóa tích hợp liên tục (CI). <br>- Thực hành tạo kho lưu trữ (repo), commit, push, pull và giải quyết xung đột mã nguồn (conflict code). |
| **Buổi 2** | Operating System & Linux (Hệ điều hành) | - Tổng quan về hệ điều hành Linux và các bản phân phối (Distros) phổ biến như Ubuntu, CentOS, RedHat. <br>- Hướng dẫn sử dụng giao diện dòng lệnh (CLI) cơ bản. <br>- Quản lý tệp tin và cây thư mục trong Linux (`ls`, `cd`, `mkdir`, `chmod`, `chown`). <br>- Lập lịch tự động hóa tác vụ định kỳ sử dụng Crontab. <br>- Cơ chế cài đặt, cập nhật và quản lý gói phần mềm trên môi trường RedHat/CentOS (sử dụng `yum`/`dnf`). <br>- Viết các kịch bản lệnh tự động hóa cơ bản (Bash Script). <br>- Thực hành thao tác trực tiếp trên máy chủ ảo Linux VPS (Operating System 2). |
| **Buổi 3** | Containerization (Docker Basics) | - Khái niệm ảo hóa phần cứng (Virtual Machine) so với ảo hóa cấp độ hệ điều hành (Container). <br>- Các lệnh quản lý Docker cơ bản (`docker run`, `docker ps`, `docker logs`, `docker exec`). <br>- Cơ chế xây dựng Docker Image (Dockerfile), quản lý container và phối hợp nhiều service bằng Docker Compose. <br>- Khái niệm về Network và Storage (Volume) trong việc lưu trữ bền vững dữ liệu của container. <br>- Triển khai thực tế các dịch vụ (như DB, Web App) chạy cô lập trên môi trường Docker cục bộ. |

---

## PHẦN 2: KHỞI ĐỘNG MINI-PROJECT TRANSCRIPTHUB (PROJECT INITIATION)

### 2.1 Đặt vấn đề và Mục tiêu dự án

**Đặt vấn đề:** Việc ghi chép biên bản họp theo cách truyền thống tốn nhiều thời gian, dễ sai sót và dữ liệu (âm thanh và văn bản) bị lưu trữ phân mảnh. Đồng thời, các công cụ biên tập thiếu cơ chế cộng tác thời gian thực, khiến tiến độ công việc bị chậm trễ.

**Mục tiêu:** Xây dựng hệ thống **TranscriptHub** nhằm tải tệp ghi âm cuộc họp, tự động chuyển đổi giọng nói thành văn bản có cấu trúc bằng AI (Gemini API), hỗ trợ ánh xạ âm thanh - chữ hai chiều và cho phép nhiều người dùng biên tập đồng thời không xung đột (sử dụng CRDTs).

---

### 2.2 Các chức năng chính của hệ thống

Hệ thống cung cấp các chức năng nghiệp vụ khép kín sau:

1. **Xác thực & Phân quyền thành viên**
   - Đăng nhập an toàn bằng JWT.
   - Phân quyền vai trò hệ thống (`ADMIN`, `USER`) và quyền truy cập phòng họp (`HOST` - chủ phòng, `EDITOR` - có quyền chỉnh sửa, `VIEWER` - chỉ xem).

2. **Quản lý & Phát Audio**
   - Tải lên tệp ghi âm trực tiếp lên MinIO (S3) thông qua Presigned PUT URL để bypass backend.
   - Hỗ trợ phát và tua mượt mà trên trình duyệt qua cơ chế phát phân đoạn HTTP 206 Range Requests.

3. **Nhận dạng giọng nói tự động (AI-Transcription)**
   - Tự động kích hoạt chuyển đổi giọng nói thành văn bản bất đồng bộ thông qua hàng đợi Apache Kafka.
   - Gọi Google Gemini API để trích xuất văn bản phân đoạn JSON có đầy đủ nhãn người nói và mốc thời gian (timeline).

4. **Không gian cộng tác thời gian thực (Collaborative Workspace)**
   - Nhiều người dùng cùng chỉnh sửa bản dịch cuộc họp không xung đột (nhờ thuật toán CRDT Yjs).
   - Đồng bộ cursor, focus và hỗ trợ highlight từ đang phát/tua nhanh bằng cách nhấp chuột vào chữ (Audio-Text Mapping hai chiều).

5. **Lịch sử phiên bản & Khôi phục (Rollback)**
   - Tự động lưu snapshot lịch sử.
   - Hiển thị so sánh trực quan khác biệt (Inline Diff View) và cho phép khôi phục về phiên bản cũ.

---

### 2.3 Ngăn xếp công nghệ sử dụng (Technology Stack)

| Tầng | Công nghệ |
|------|-----------|
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS v4, Quill Rich Text Editor, Yjs Client (`y-websocket`, `y-quill`, `quill-cursors`) |
| **Backend Microservices** | NestJS Monorepo (RPC TCP), Standalone Node.js WebSocket Collab Server |
| **Hạ tầng & Cơ sở dữ liệu** | PostgreSQL (Prisma Multi-Schema), Redis (Caching & Pub/Sub), Apache Kafka (Message Broker), MinIO (AWS S3-compatible Object Storage) |
| **DevOps & Cloud** | Docker, Kubernetes (K8s) trên GCP, Nginx Ingress Controller, GitHub Actions CI/CD |

---

## PHẦN 3: THIẾT KẾ HỆ THỐNG VÀ CƠ SỞ DỮ LIỆU (SYSTEM DESIGN & DATABASE)

### 3.1 Kiến trúc hệ thống logic

Sơ đồ dưới đây thể hiện luồng giao tiếp giữa Client, Next.js Server đóng vai trò Proxy và các Microservices Backend:

- **Giao tiếp nội bộ tốc độ cao:** API Gateway định tuyến và giao tiếp với các dịch vụ backend thông qua giao thức **RPC TCP** nhằm loại bỏ chi phí đóng gói HTTP Header.
- **Xử lý phi chặn (Non-blocking):** Tiến trình upload file (nhanh) và dịch AI (chậm, tốn tài nguyên) được kết nối phi chặn qua hàng đợi **Kafka** để tránh quá tải hoặc treo service.
- **Đồng bộ CRDT:** Collab WebSocket Gateway quản lý bắt tay đồng bộ Yjs nhị phân, cho phép người dùng biên tập mượt mà dưới 100ms.

```
+---------------+        HTTPS        +-------------------------------+
|    Browser    | <-----------------> |      Next.js (BFF/Proxy)      |
|    Client     |                     |        App Router             |
+---------------+                     +-------------+-----------------+
       |                                            |
       | WebSocket                                  | RPC TCP (NestJS)
       |                                 +----------v----------+
       v                                 |   API Gateway /     |
+--------------+                         | Auth / File / Meet  |
|  Collab WS   |                         | / Transcript Svc    |
|    Server    |                         +----------+----------+
|  (Yjs/CRDT)  |                                    |
+--------------+                         +----------v----------+
                                         |   Apache Kafka      |
                                         |   (Message Queue)   |
                                         +----------+----------+
                                                    |
                                         +----------v----------+
                                         |  AI Transcript Svc  |
                                         |  (Gemini API Call)  |
                                         +---------------------+
```

---

### 3.2 Thiết kế Cơ sở dữ liệu (Database Design)

Cơ sở dữ liệu được triển khai trên hệ quản trị **PostgreSQL**, phân chia logic thành **5 Schema độc lập** thông qua Prisma `multiSchema`.

#### 3.2.1 Sơ đồ mối quan hệ thực thể (ERD Diagram)

```
Schema: identity
+----------------+     +------------------+     +-----------------+
|    accounts    |     |  account_roles   |     |     roles       |
|----------------|     |------------------|     |-----------------|
| id (PK)        |<--->| accountId (FK)   |<--->| id (PK)         |
| email          |     | roleId (FK)      |     | name            |
| password       |     +------------------+     +--------+--------+
| createdAt      |                                       |
+--------+-------+     +------------------+     +--------v--------+
         |             | role_permissions |     |   permissions   |
         |             |------------------|     |-----------------|
         |             | roleId (FK)      |<--->| id (PK)         |
         |             | permissionId(FK) |     | action          |
         |             +------------------+     +-----------------+
         |
         | (logic link via accountId)
         v
Schema: users
+---------------------+         +----------------------+
|    user_profiles    |         |    notifications     |
|---------------------|         |----------------------|
| id (PK)             |         | id (PK)              |
| accountId (FK)      |         | userId (FK)          |
| fullName            |         | content              |
| phone               |         | isRead               |
| avatar              |         | createdAt            |
| bio                 |         +----------------------+
+---------------------+

Schema: files
+--------------------------------------------+
|              audio_files                    |
|--------------------------------------------|
| id (PK)                                    |
| bucket                                     |
| objectKey                                  |
| sizeBytes (BigInt)                         |
| durationSeconds                            |
| status  (UPLOADING / READY)                |
| uploaderId (FK -> accounts.id)             |
| createdAt                                  |
+--------------------------------------------+
         |
         +--------------------+--------------------+
         v                    v                    v
Schema: meetings         Schema: transcripts
+------------------+     +---------------------------------------+
|    meetings      |     |           transcripts                 |
|------------------|     |---------------------------------------|
| id (PK)          |     | id (PK)                              |
| audioFileId (FK) |     | audioFileId (FK -> audio_files.id)   |
| status           |     | structuredContent (JsonB)            |
|  (CREATING /     |     | createdAt                            |
|   PROCESSING /   |     +-------------------+-------------------+
|   COMPLETED)     |                         |
+--------+---------+     +-------------------v-------------------+
         |               |       transcript_versions             |
+--------v-----------+   |---------------------------------------|
| meeting_members    |   | id (PK)                              |
|--------------------|   | transcriptId (FK)                    |
| meetingId (FK)     |   | snapshotContent (JsonB)              |
| userId (FK)        |   | savedAt                              |
| role               |   +---------------------------------------+
| (HOST/EDITOR/      |
|  VIEWER)           |
+--------------------+
```

#### 3.2.2 Mô tả chi tiết các bảng dữ liệu

##### A. Schema `identity` — Hệ thống Xác thực

| Bảng | Mô tả |
|------|-------|
| `accounts` | Lưu ID tài khoản (`id`), email (`email`), mật khẩu đã băm (`password`) và dấu thời gian. |
| `roles` | Vai trò hệ thống như `ADMIN`, `USER`. |
| `permissions` | Danh sách các quyền hạn cụ thể (ví dụ: `edit_profile`, `read_transcripts`). |
| `account_roles` | Bảng trung gian nhiều-nhiều để phân vai trò cho tài khoản. |
| `role_permissions` | Bảng trung gian nhiều-nhiều để phân quyền cho vai trò. |

##### B. Schema `users` — Thông tin người dùng

| Bảng | Mô tả |
|------|-------|
| `user_profiles` | Hồ sơ người dùng bao gồm họ tên, điện thoại, avatar, bio. Liên kết 1-1 logic với `accounts.id`. |
| `notifications` | Các thông báo nội bộ gửi cho người dùng, liên kết qua `userId`. |

##### C. Schema `files` — Quản lý tệp

| Bảng | Mô tả |
|------|-------|
| `audio_files` | Quản lý tệp ghi âm tải lên với thông tin `bucket`, `objectKey`, dung lượng (`sizeBytes` dùng BigInt), thời lượng phát (`durationSeconds`), trạng thái (`UPLOADING` / `READY`) và `uploaderId`. |

##### D. Schema `meetings` — Quản lý phòng họp

| Bảng | Mô tả |
|------|-------|
| `meetings` | Quản lý phòng họp liên kết với file âm thanh (`audioFileId`), trạng thái cuộc họp (`CREATING`, `PROCESSING`, `COMPLETED`). |
| `meeting_members` | Danh sách người dùng trong phòng họp và vai trò tương ứng (`HOST`, `EDITOR`, `VIEWER`). |

##### E. Schema `transcripts` — Quản lý bản dịch

| Bảng | Mô tả |
|------|-------|
| `transcripts` | Lưu bản dịch gốc, liên kết với file âm thanh qua `audioFileId`. Văn bản chi tiết của các segment được lưu trữ trong trường `structuredContent` kiểu dữ liệu `JsonB` để tối ưu hóa truy xuất động. |
| `transcript_versions` | Snapshot bản dịch tại các thời điểm lưu phục vụ cơ chế rollback dữ liệu. |
