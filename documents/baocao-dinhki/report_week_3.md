# BÁO CÁO TUẦN 3

## MỤC LỤC

- [NỘI DUNG TỔNG HỢP](#nội-dung-tổng-hợp)
- [PHẦN 1: LỘ TRÌNH HỌC TẬP](#phần-1-lộ-trình-học-tập)
- [PHẦN 2: TIẾN ĐỘ DỰ ÁN TRANSCRIPTHUB](#phần-2-tiến-độ-dự-án-transcripthub)
  - [2.1 File Service — Quản lý tệp ghi âm](#21-file-service--quản-lý-tệp-ghi-âm)
  - [2.2 Meeting Service — Quản lý phòng họp](#22-meeting-service--quản-lý-phòng-họp)

---

## NỘI DUNG TỔNG HỢP

Tuần 3 tập trung vào hai mảng chính:

**Phần học tập (3 buổi):**
- **SQL Advance:** Đi sâu vào các kỹ thuật tối ưu truy vấn PostgreSQL: Window Functions, CTE (Common Table Expressions), Index Strategy, Query Planner và các chuẩn normalize (1NF–3NF, BCNF). Áp dụng trực tiếp vào thiết kế schema của TranscriptHub.
- **Overview of Internet, Browser & Website:** Hiểu cơ chế hoạt động của DNS, HTTP/HTTPS, TCP/IP; cách trình duyệt render trang web và vai trò của HTML/CSS/JavaScript.
- **Web Architecture:** Lịch sử phát triển kiến trúc web từ Monolithic đến Client-Server, Microservices; ưu/nhược điểm từng loại và giới thiệu RESTful API.

**Phần dự án:** Triển khai **File Service** (tích hợp MinIO S3, tự ký SigV4 Presigned URL, phát audio HTTP 206 Range Requests) và **Meeting Service** (quản lý vòng đời phòng họp, phân quyền thành viên, kích hoạt Kafka).

---

## PHẦN 1: LỘ TRÌNH HỌC TẬP

| Buổi học | Môn học / Chủ đề | Nội dung chi tiết |
|----------|-----------------|-------------------|
| **Buổi 1** | SQL Advance | - Ôn tập cơ bản SQL: SELECT, JOIN, GROUP BY, HAVING, subquery. <br>- Window Functions: `ROW_NUMBER()`, `RANK()`, `LAG()`, `LEAD()`, `SUM() OVER (PARTITION BY ...)`. <br>- Common Table Expressions (CTE) và Recursive CTE. <br>- Index Strategy: B-Tree, Hash, GIN (cho JSONB), Partial Index. <br>- Query Planner & EXPLAIN ANALYZE. <br>- Database Normalization: 1NF, 2NF, 3NF, BCNF và trường hợp phá chuẩn có chủ đích. <br>- Thực hành: Viết query phân tích trên CSDL TranscriptHub. |
| **Buổi 2** | Overview of Internet, Browser & Website | - Khái niệm mạng máy tính, Internet, World Wide Web. <br>- DNS: Cơ chế phân giải tên miền từ browser đến IP server. <br>- HTTP/HTTPS: Request-Response lifecycle, Status Codes, Headers. <br>- TCP/IP: Bộ giao thức nền tảng, quá trình 3-way handshake. <br>- Cách trình duyệt render trang web: Critical Rendering Path. <br>- Vai trò của HTML (cấu trúc), CSS (trình bày), JavaScript (hành vi). |
| **Buổi 3** | Web Architecture | - Lịch sử kiến trúc web: CGI → MVC Monolith → SOA → Microservices. <br>- Monolithic Architecture: Ưu điểm đơn giản, nhược điểm khó mở rộng. <br>- Client-Server Architecture: Tách biệt presentation và logic. <br>- Microservices Architecture: Bounded context, độc lập triển khai, giao tiếp qua API. <br>- API Gateway Pattern: Điểm vào duy nhất, rate limiting, auth. <br>- Giới thiệu RESTful API: Resource-based URL, HTTP Verbs, Stateless. <br>- So sánh REST vs GraphQL vs gRPC vs Message Queue. |

---

## PHẦN 2: TIẾN ĐỘ DỰ ÁN TRANSCRIPTHUB

### 2.1 File Service — Quản lý tệp ghi âm

File Service chịu trách nhiệm toàn bộ vòng đời của tệp ghi âm: khởi tạo upload, cấp Presigned URL, xác nhận hoàn tất và phát audio trực tuyến.

#### Luồng Upload File (Presigned PUT URL)

```
Client                   API Gateway         File Service           MinIO (S3)
  |                           |                    |                     |
  |-- POST /files/init ------>|                    |                     |
  |                           |-- RPC TCP -------->|                     |
  |                           |                    |-- Tạo AudioFile DB  |
  |                           |                    |   (status=UPLOADING)|
  |                           |                    |-- Ký SigV4 URL ---->|
  |                           |<-- { presignedUrl, fileId } ------------|
  |<-- { presignedUrl, fileId } ----------------------------------------|
  |                                                                      |
  |-- PUT presignedUrl + binary ---------------------------------------->|
  |<-- 200 OK -----------------------------------------------------------|
  |                                                                      |
  |-- POST /files/:id/confirm --> API GW --> File Service               |
  |                                          |-- cập nhật status=READY  |
  |                                          |-- publish Kafka event     |
```

#### Kỹ thuật tự ký SigV4 Presigned URL

MinIO SDK JS cần gọi `getBucketRegion()` qua network trước khi ký, gây lỗi `ECONNREFUSED` trong môi trường Docker. Giải pháp là **tự ký theo chuẩn AWS SigV4** bằng `crypto` built-in của Node.js:

```typescript
// Tạo Presigned PUT URL bằng SigV4 thuần crypto
private generatePresignedPutUrl(objectKey: string, expiresInSeconds: number): string {
  const host = `${MINIO_PUBLIC_HOST}:${MINIO_PUBLIC_PORT}`;
  const datestamp  = now.toISOString().slice(0,10).replace(/-/g,'');  // YYYYMMDD
  const amzdate    = now.toISOString().replace(/[-:]/g,'').slice(0,15) + 'Z';

  // Canonical Request → String to Sign → Signing Key → Signature
  const credentialScope = `${datestamp}/${region}/${service}/aws4_request`;
  const signingKey = getSignatureKey(secretKey, datestamp, region, service);
  const signature  = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return `http://${host}/${bucket}/${objectKey}?X-Amz-Signature=${signature}&...`;
}
```

#### Phát Audio — HTTP 206 Range Requests

Để phát audio mượt mà và hỗ trợ tua vị trí bất kỳ, File Service implement cơ chế **HTTP Partial Content**:

```
GET /api/files/:id/stream
Headers: Range: bytes=0-1048575

Response:
  HTTP/1.1 206 Partial Content
  Content-Range: bytes 0-1048575/10485760
  Content-Type: audio/mpeg
  Accept-Ranges: bytes
  [binary chunk]
```

- Lấy object từ MinIO theo range byte tương ứng
- Trả về `206 Partial Content` với header `Content-Range`
- Trình duyệt tự động ghép các chunk để phát liên tục

#### Cấu trúc bảng `audio_files`

```prisma
model AudioFile {
  id              String   @id @default(uuid()) @db.Uuid
  fileName        String
  bucketName      String   @db.VarChar(100)
  objectKey       String   @db.VarChar(500)
  fileSize        BigInt                        // Dùng BigInt cho file lớn
  mimeType        String   @db.VarChar(100)
  durationSeconds Int      @default(0)
  status          String   @db.VarChar(50)     // "UPLOADING" | "READY"
  uploaderId      Int
  createdAt       DateTime @default(now())

  @@schema("files")
}
```

---

### 2.2 Meeting Service — Quản lý phòng họp

Meeting Service quản lý vòng đời phòng họp và quyền truy cập của từng thành viên.

#### Vòng đời phòng họp (Meeting Lifecycle)

```
CREATING  →  PROCESSING  →  COMPLETED
    ↑              ↑
  Tạo mới    File upload xong
             + Kafka trigger
             → AI bắt đầu dịch
```

#### Phân quyền thành viên

| Role | Quyền |
|------|-------|
| `HOST` | Toàn quyền: sửa, xóa phòng, mời/xóa thành viên, rollback |
| `EDITOR` | Xem và chỉnh sửa transcript |
| `VIEWER` | Chỉ xem, không chỉnh sửa |

#### API chính

| Method | Endpoint | Mô tả |
|--------|---------|-------|
| `POST` | `/api/meetings` | Tạo phòng họp mới (gắn audioFileId) |
| `GET` | `/api/meetings` | Danh sách phòng họp của người dùng |
| `GET` | `/api/meetings/:id` | Chi tiết phòng họp + thành viên |
| `PATCH` | `/api/meetings/:id` | Cập nhật tiêu đề, mô tả |
| `POST` | `/api/meetings/:id/members` | Mời thành viên vào phòng |
| `DELETE` | `/api/meetings/:id/members/:userId` | Xóa thành viên |
| `PATCH` | `/api/meetings/:id/members/:userId/role` | Đổi vai trò thành viên |

#### Kích hoạt transcript qua Kafka

Khi File Service xác nhận upload hoàn tất, Meeting Service lắng nghe sự kiện và cập nhật trạng thái phòng họp, sau đó publish tiếp event để Transcript Service bắt đầu xử lý:

```
File Service                 Kafka Topic                Meeting Service
     |                           |                           |
     |-- file.uploaded --------->|                           |
     |                           |-- consume --------------->|
     |                           |                    update meeting
     |                           |                    status = PROCESSING
     |                           |                    publish transcript.request
     |                           |                           |
     |                    Transcript Service                 |
     |                           |<-- transcript.request ----|
     |                           | (Gemini AI bắt đầu dịch) |
```

#### Cấu trúc bảng CSDL

```prisma
model Meeting {
  id          String        @id @default(uuid()) @db.Uuid
  title       String
  description String?       @db.Text
  creatorId   Int
  audioFileId String        @unique @db.Uuid
  status      MeetingStatus @default(CREATING)  // CREATING|PROCESSING|COMPLETED
  members     MeetingMember[]
  @@schema("meetings")
}

model MeetingMember {
  meetingId String      @db.Uuid
  userId    Int
  role      MeetingRole              // HOST | EDITOR | VIEWER
  joinedAt  DateTime    @default(now())
  @@unique([meetingId, userId])
  @@schema("meetings")
}
```
