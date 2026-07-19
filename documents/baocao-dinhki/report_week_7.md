# BÁO CÁO TUẦN 7 — TỔNG KẾT DỰ ÁN

## MỤC LỤC

- [NỘI DUNG TỔNG HỢP](#nội-dung-tổng-hợp)
- [PHẦN 1: BẢO VỆ MINIPROJECT](#phần-1-bảo-vệ-miniproject)
- [PHẦN 2: TỔNG KẾT DỰ ÁN TRANSCRIPTHUB](#phần-2-tổng-kết-dự-án-transcripthub)
  - [2.1 Kiến trúc hệ thống hoàn chỉnh](#21-kiến-trúc-hệ-thống-hoàn-chỉnh)
  - [2.2 Kết quả đạt được theo từng module](#22-kết-quả-đạt-được-theo-từng-module)
  - [2.3 Các thách thức kỹ thuật và giải pháp](#23-các-thách-thức-kỹ-thuật-và-giải-pháp)
  - [2.4 Kết quả demo hệ thống](#24-kết-quả-demo-hệ-thống)
  - [2.5 Hạn chế và hướng phát triển](#25-hạn-chế-và-hướng-phát-triển)
  - [2.6 Bài học kinh nghiệm](#26-bài-học-kinh-nghiệm)

---

## NỘI DUNG TỔNG HỢP

Tuần 7 là tuần cuối cùng của chương trình thực tập tại Viettel, tập trung toàn bộ vào việc hoàn thiện và trình bày dự án TranscriptHub:

**Phần học tập — Bảo vệ Miniproject (2 buổi):**
- **Buổi 1:** Trình bày kiến trúc hệ thống, thiết kế CSDL, các giải pháp kỹ thuật đã áp dụng và demo chức năng upload + AI Transcription.
- **Buổi 2:** Demo chức năng cộng tác thời gian thực (Yjs CRDT), lịch sử phiên bản, pipeline CI/CD và hệ thống đang chạy trên Kubernetes GCP. Q&A và nhận phản hồi từ mentor.

**Phần dự án:** Tổng kết toàn bộ hành trình 7 tuần — từ bài toán ban đầu đến hệ thống hoàn chỉnh với 8 microservice, frontend Next.js, pipeline CI/CD và deployment K8s trên GCP.

---

## PHẦN 1: BẢO VỆ MINIPROJECT

### Buổi bảo vệ 1 — Kiến trúc & Backend

| Nội dung trình bày | Chi tiết |
|-------------------|---------|
| **Đặt vấn đề** | Bài toán ghi chép biên bản họp truyền thống: tốn thời gian, thiếu cộng tác thời gian thực |
| **Mục tiêu hệ thống** | TranscriptHub: Upload audio → AI dịch → Cộng tác biên tập → Lịch sử phiên bản |
| **Kiến trúc Microservices** | 8 service giao tiếp TCP nội bộ + Kafka event-driven |
| **Thiết kế CSDL** | PostgreSQL 5-schema (identity, users, files, meetings, transcripts) |
| **Demo** | Upload file audio → Kafka trigger → Gemini AI dịch → Xem kết quả JSON structured |

### Buổi bảo vệ 2 — Frontend & DevOps

| Nội dung trình bày | Chi tiết |
|-------------------|---------|
| **Collab Editor** | Demo 2 browser cùng chỉnh sửa transcript, thấy cursor của nhau realtime |
| **Audio-Text Mapping** | Click vào đoạn chữ → audio tua đến đúng vị trí; audio phát → chữ highlight theo |
| **Version History** | Rollback về phiên bản cũ, so sánh diff inline |
| **Kubernetes** | Hệ thống đang chạy trên GCP GKE, hiển thị `kubectl get pods` tất cả Running |
| **CI/CD Pipeline** | Mở GitHub Actions, show pipeline CI test pass + CD deploy thành công |
| **Q&A** | Trả lời câu hỏi của mentor về trade-off kiến trúc, lý do chọn CRDT vs Operational Transform |

---

## PHẦN 2: TỔNG KẾT DỰ ÁN TRANSCRIPTHUB

### 2.1 Kiến trúc hệ thống hoàn chỉnh

```
Internet
    |
    | HTTPS
    v
+---------------------------+
|   Nginx Ingress (K8s)     |
+---------------------------+
    |              |              |
    | /api          | /collab       | /
    v              v              v
+----------+  +-----------+  +----------+
| API      |  | Collab    |  | Next.js  |
| Gateway  |  | Gateway   |  | Frontend |
| :3000    |  | WS :8080  |  | :3000    |
+----------+  +-----------+  +----------+
    | RPC TCP (Internal)
    |
    +-------+-------+-------+--------+
    |       |       |       |        |
    v       v       v       v        v
+--------+ +------+ +------+ +----------+ +--------+
|Identity| |Users | | File | | Meeting  | |Transcript|
| :4000  | | :4001| | :4002| |  :4003   | |  :4004  |
+--------+ +------+ +------+ +----------+ +--------+
    |           |       |         |              |
    |           |       |         |      Kafka   |
    |           |       +-- file.uploaded ------>|
    |           |                 +-- transcript.process -->|
    |           |                                      |
    v           v                                      v
+--------------------------------------------------+
|          PostgreSQL (5 schemas)                  |
|  identity | users | files | meetings | transcripts|
+--------------------------------------------------+
    |
+-------+  +---------+  +--------+
| Redis |  |  MinIO  |  | Kafka  |
|(Cache)|  |  (S3)   |  |(Queue) |
+-------+  +---------+  +--------+
```

---

### 2.2 Kết quả đạt được theo từng module

| Module | Chức năng | Trạng thái |
|--------|----------|-----------|
| **Identity Service** | JWT Auth, Bcrypt, RBAC (roles + permissions) | ✅ Hoàn thành |
| **Users Service** | User profiles, Notifications | ✅ Hoàn thành |
| **File Service** | MinIO upload, SigV4 Presigned URL, HTTP 206 streaming | ✅ Hoàn thành |
| **Meeting Service** | Room lifecycle, Member roles (HOST/EDITOR/VIEWER), Kafka trigger | ✅ Hoàn thành |
| **Transcript Service** | Kafka consumer, Semaphore concurrency, Gemini AI, JSONB storage, Recovery | ✅ Hoàn thành |
| **Collab Server** | Yjs CRDT, WebSocket awareness, Version snapshot | ✅ Hoàn thành |
| **API Gateway** | HTTP REST, Swagger docs, ValidationPipe, GlobalFilter | ✅ Hoàn thành |
| **Frontend** | NextAuth, Dashboard, Quill+Yjs editor, Audio player, Audio-Text mapping | ✅ Hoàn thành |
| **Docker** | Multi-stage build cho 8 services, docker-compose local | ✅ Hoàn thành |
| **Kubernetes** | Deployment/Service/Ingress/ConfigMap/Job manifests, GCP GKE | ✅ Hoàn thành |
| **CI/CD** | GitHub Actions CI (lint+test+build) + CD (push GCR + deploy GKE) | ✅ Hoàn thành |

---

### 2.3 Các thách thức kỹ thuật và giải pháp

#### Thách thức 1: MinIO Presigned URL trong Docker

**Vấn đề:** MinIO JS SDK gọi `getBucketRegion()` qua network trước khi ký URL. Trong môi trường Docker container, `localhost:9000` không resolve được, gây lỗi `ECONNREFUSED`.

**Giải pháp:** Tự implement AWS SigV4 signature bằng `crypto` built-in của Node.js, không cần gọi network để ký URL. Browser PUT file trực tiếp lên MinIO public endpoint.

---

#### Thách thức 2: Quản lý đồng thời Gemini AI calls

**Vấn đề:** Nếu nhiều file được upload cùng lúc và tất cả đều trigger Gemini API, server dễ bị quá tải và vượt rate limit.

**Giải pháp:** Implement `Semaphore` (không dùng thư viện ngoài) giới hạn tối đa 3 transcription chạy song song. Kết hợp với Startup Recovery để tái xử lý job bị treo khi service restart.

---

#### Thách thức 3: Xung đột chỉnh sửa realtime

**Vấn đề:** Khi 2+ người dùng cùng chỉnh sửa văn bản, các thao tác có thể xung đột (Operational Transform cần server làm trọng tài, phức tạp).

**Giải pháp:** Dùng **Yjs CRDT** — mỗi operation được gắn ID độc nhất (Lamport timestamp + client ID). Các client tự giải quyết xung đột theo thuật toán CRDT, không cần server trọng tài. Đảm bảo convergence với latency < 100ms.

---

#### Thách thức 4: Audio-Text Mapping chính xác

**Vấn đề:** Khi audio đang phát, cần highlight đúng đoạn chữ đang được nói; và ngược lại khi click chữ cần tua đến đúng vị trí âm thanh.

**Giải pháp:** Gemini AI trả về JSON với `startTime`/`endTime` cho từng segment. Frontend so sánh `audio.currentTime` với khoảng thời gian của segment trong `onTimeUpdate` event (60fps) để highlight realtime.

---

### 2.4 Kết quả demo hệ thống

#### Luồng sử dụng đầy đủ

```
1. Đăng ký tài khoản → Đăng nhập (JWT)
         ↓
2. Tạo phòng họp mới → Mời thành viên (HOST/EDITOR/VIEWER)
         ↓
3. Upload file ghi âm → Nhận Presigned URL → Browser PUT thẳng lên MinIO
         ↓
4. Kafka trigger → Gemini AI dịch bất đồng bộ (~30s cho 1h audio)
         ↓
5. Xem transcript dạng JSON segment có speaker + timestamp
         ↓
6. Nhiều người cùng chỉnh sửa transcript realtime (Yjs CRDT)
   → Thấy cursor và highlight của nhau
         ↓
7. Click vào đoạn chữ → Audio tua đến đúng vị trí
   Nghe audio đang phát → Chữ highlight theo
         ↓
8. Lưu phiên bản → Xem lịch sử → Rollback nếu cần
         ↓
9. Toàn bộ chạy trên GCP GKE với rolling deploy từ GitHub Actions
```

#### Thống kê kỹ thuật

| Chỉ số | Giá trị |
|--------|---------|
| Số microservice | 8 service |
| Số bảng CSDL | 12 bảng trong 5 schema |
| Latency cộng tác | < 100ms (local network) |
| Thời gian AI dịch | ~30 giây cho file 1 giờ |
| Image size production | ~180MB/service (multi-stage) |
| CI pipeline time | ~4 phút |
| CD pipeline time | ~8 phút |
| Uptime GKE | 99.9% (self-healing) |

---

### 2.5 Hạn chế và hướng phát triển

#### Hạn chế hiện tại

| Hạn chế | Mô tả |
|---------|-------|
| **Speaker Diarization** | Gemini AI chưa phân biệt chính xác người nói trong mọi trường hợp |
| **Offline Collab** | Chưa hỗ trợ chỉnh sửa offline và sync lại khi có mạng |
| **File Format** | Chỉ hỗ trợ audio (MP3, WAV, M4A), chưa hỗ trợ video |
| **Search** | Chưa có tính năng tìm kiếm toàn văn trong transcript |
| **Mobile** | UI chưa được tối ưu hoàn toàn cho màn hình nhỏ |

#### Hướng phát triển

1. **Cải thiện AI:** Fine-tune prompt Gemini với speaker diarization, thêm ngôn ngữ (Anh, Trung, Nhật).
2. **Offline-first:** Tích hợp `y-indexeddb` để lưu Yjs document offline, sync khi kết nối lại.
3. **Real-time Search:** Elasticsearch cho full-text search trong transcript nội dung lớn.
4. **Export:** Xuất transcript ra DOCX, PDF, SRT (subtitle) format.
5. **Analytics:** Dashboard thống kê số cuộc họp, thời lượng, top speaker.
6. **Mobile App:** React Native với shared business logic.

---

### 2.6 Bài học kinh nghiệm

| Lĩnh vực | Bài học |
|---------|---------|
| **Kiến trúc** | Microservices giúp mở rộng độc lập nhưng tăng độ phức tạp vận hành. Cần cân nhắc kỹ khi dự án nhỏ (Monolith-first). |
| **CRDT vs OT** | CRDT (Yjs) đơn giản hơn nhiều so với Operational Transform vì không cần server trọng tài; phù hợp với P2P và offline-first. |
| **Event-Driven** | Kafka tách biệt producer/consumer, giúp AI processing không block API response. Nhưng cần implement dead-letter queue và startup recovery để xử lý edge case. |
| **Docker/K8s** | Multi-stage Dockerfile giảm 80% kích thước image. ReadinessProbe K8s đảm bảo zero-downtime deploy tự động. |
| **AI Integration** | Cần thiết kế prompt cẩn thận và validate output JSON từ LLM. Luôn có fallback khi API fail. |
| **Security** | Presigned URL bypass backend nhưng vẫn an toàn nhờ signature hết hạn (TTL). JWT ngắn hạn + refresh token Redis cho phép thu hồi token khi cần. |
