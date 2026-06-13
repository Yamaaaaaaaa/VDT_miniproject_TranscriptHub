# Tài Liệu Yêu Cầu Thiết Kế - File Service (Audio Management)

Tài liệu này mô tả chi tiết các yêu cầu kỹ thuật, kiến trúc, cấu trúc cơ sở dữ liệu và đặc tả API để xây dựng **File Service** trong hệ thống TranscriptHub sử dụng NestJS và MinIO. 

Dịch vụ này chịu trách nhiệm quản lý việc tải lên (upload), lưu trữ (storage), cập nhật siêu dữ liệu (metadata) và truyền tải phát âm thanh (streaming) các tệp âm thanh (audio files).

---

## 1. Yêu Cầu Công Nghệ & Thành Phần Hệ Thống

### 1.1 Tech Stack đề xuất
* **Framework**: NestJS (Monorepo/Microservice).
* **Object Storage**: **MinIO** (Hệ thống lưu trữ đối tượng tương thích với S3 API) – Dùng để lưu trữ tệp âm thanh thực tế.
* **Database**: PostgreSQL (Schema `files`) – Lưu trữ siêu dữ liệu của các file.
* **ORM**: Prisma (sử dụng Prisma Client để thao tác với Postgres).
* **Thư viện tích hợp**:
  * `minio`: Thư viện Node.js chính thức của MinIO để tương tác với Object Storage.
  * `music-metadata`: Để trích xuất thông tin định dạng và thời lượng (duration) của tệp âm thanh ở phía backend.

### 1.2 Luồng Lưu Trữ Tệp (Storage Strategy)
Hỗ trợ song song 2 cơ chế upload tệp:

1. **Multipart Upload trực tiếp (Single Upload)**:
   * Phù hợp cho tệp có dung lượng nhỏ.
   * Luồng đi: `Frontend` -> `API Gateway` -> `File Service` -> `MinIO`.

2. **Upload thông qua Presigned URL (Khuyên dùng cho tệp lớn)**:
   * Tránh nghẽn băng thông ở API Gateway và File Service.
   * Luồng đi:
     1. `Frontend` gửi yêu cầu khởi tạo upload (`/upload/init`) kèm thông tin tệp.
     2. `File Service` sinh ra một **Presigned PUT URL** từ MinIO (có thời gian hết hạn, ví dụ: 2 giờ) và tạo bản ghi ở Database với trạng thái `UPLOADING`.
     3. `Frontend` thực hiện upload tệp trực tiếp lên MinIO qua Presigned URL này.
     4. Sau khi upload xong, `Frontend` gọi API hoàn tất (`/upload/complete/:fileId`). `File Service` tải tệp tạm thời từ MinIO về để trích xuất thời lượng (duration), cập nhật kích thước thực tế và đổi trạng thái bản ghi thành `READY`.

---

## 2. Thiết Kế Cơ Sở Dữ Liệu (Database Schema)

Cấu trúc bảng `audio_files` lưu trữ siêu dữ liệu tệp trong cơ sở dữ liệu PostgreSQL (được định nghĩa qua Prisma model):

```prisma
// Thêm vào schema.prisma hiện tại

model AudioFile {
  id              String   @id @default(uuid()) @db.Uuid
  fileName        String   @map("file_name")
  bucketName      String   @map("bucket_name") @db.VarChar(100)
  objectKey       String   @map("object_key") @db.VarChar(500)
  fileSize        BigInt   @map("file_size")
  mimeType        String   @map("mime_type") @db.VarChar(100)
  durationSeconds Int      @default(0) @map("duration_seconds")
  status          String   @db.VarChar(50) // "UPLOADING" hoặc "READY"
  uploaderId      Int      @map("uploader_id")
  createdAt       DateTime @default(now()) @map("created_at")

  @@map("audio_files")
  @@schema("files") // Định nghĩa thuộc schema riêng biệt
}
```

*Lưu ý*: Hãy thêm `"files"` vào mảng `schemas` trong cấu hình `datasource db` của file `schema.prisma`.

---

## 3. Danh Sách Các API Yêu Cầu (API Specifications)

Toàn bộ các API đều yêu cầu Header xác thực người dùng (do Gateway đính kèm `X-User-Id` sau khi giải mã JWT).

### 3.1 API Khởi tạo Upload qua Presigned URL
Khởi động quá trình tải lên tệp âm thanh lớn bằng cách lấy một link upload trực tiếp lên MinIO.

* **Endpoint**: `POST /api/v1/files/upload/init`
* **Headers**: `X-User-Id: <userId>`
* **Request Body**:
  ```json
  {
    "fileName": "meeting_recording_130626.mp3",
    "fileSize": 15728640,
    "mimeType": "audio/mpeg"
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "result": {
      "fileId": "8b51d8b9-4781-4252-944a-d68a2d12e698",
      "presignedUrl": "http://localhost:9000/transhubs-bucket/1/8b51d8b9-4781-4252-944a-d68a2d12e698_meeting_recording_130626.mp3?X-Amz-Algorithm=...",
      "chunkSize": 5242880
    }
  }
  ```

### 3.2 API Xác nhận Hoàn tất Upload
Thông báo cho backend biết tệp đã tải thành công lên MinIO để backend tải tệp về phân tích thời lượng và kích hoạt trạng thái sử dụng.

* **Endpoint**: `POST /api/v1/files/upload/complete/{fileId}`
* **Headers**: `X-User-Id: <userId>`
* **Response (200 OK)**:
  ```json
  {
    "result": {
      "id": "8b51d8b9-4781-4252-944a-d68a2d12e698",
      "fileName": "meeting_recording_130626.mp3",
      "bucketName": "transhubs-bucket",
      "objectKey": "1/8b51d8b9-4781-4252-944a-d68a2d12e698_meeting_recording_130626.mp3",
      "fileSize": 15728640,
      "mimeType": "audio/mpeg",
      "durationSeconds": 345,
      "status": "READY",
      "uploaderId": 1,
      "createdAt": "2026-06-13T12:45:00.000Z"
    }
  }
  ```

### 3.3 API Upload trực tiếp (Multipart Form-Data)
Dùng cho luồng tải lên tệp trực tiếp nhanh gọn (Single upload).

* **Endpoint**: `POST /api/v1/files/upload`
* **Headers**: `X-User-Id: <userId>`
* **Content-Type**: `multipart/form-data`
* **Body**:
  * `file`: File binary (Audio file)
* **Response (201 Created)**: Trả về siêu dữ liệu của tệp tương tự cấu trúc phản hồi hoàn tất upload, với trạng thái mặc định là `READY` và đã có sẵn `durationSeconds`.

### 3.4 API Stream Audio hỗ trợ Range Requests (HTTP 206)
API truyền tải dữ liệu âm thanh trực tiếp hỗ trợ thanh tua (seek/scrub) trên trình duyệt bằng cách trả về một phần dữ liệu (Partial Content).

* **Endpoint**: `GET /api/v1/files/stream/{fileId}`
* **Headers**: 
  * `Range: bytes=0-1023` (tùy chọn từ client/trình duyệt)
* **Response**:
  * **Trường hợp không có Range header**: Trả về `200 OK`, toàn bộ file.
  * **Trường hợp có Range header**: Trả về `206 Partial Content`.
  * **Headers phản hồi**:
    * `Accept-Ranges: bytes`
    * `Content-Type: audio/mpeg` (hoặc mimeType của tệp)
    * `Content-Range: bytes 0-1023/15728640`
    * `Content-Length: 1024`

### 3.5 API Lấy Thông Tin Siêu Dữ Liệu (Get Metadata)
* **Endpoint**: `GET /api/v1/files/{fileId}`
* **Response (200 OK)**: Trả về đối tượng metadata của AudioFile.

### 3.6 API Xóa Tệp (Delete File)
Xoá tệp khỏi lưu trữ MinIO đồng thời xoá bản ghi siêu dữ liệu trong cơ sở dữ liệu Postgres.

* **Endpoint**: `DELETE /api/v1/files/{fileId}`
* **Headers**: `X-User-Id: <userId>`
* **Response (200 OK)**:
  ```json
  {
    "result": "File deleted successfully"
  }
  ```

### 3.7 API Cập nhật Thông tin Tệp / Đổi tên (Rename)
* **Endpoint**: `PUT /api/v1/files/{fileId}`
* **Headers**: `X-User-Id: <userId>`
* **Request Body**:
  ```json
  {
    "fileName": "meeting_recording_final.mp3"
  }
  ```
* **Response (200 OK)**: Trả về đối tượng metadata đã được cập nhật tên.

### 3.8 API Lấy Danh Sách Tệp Người Dùng (Phân trang)
* **Endpoint**: `GET /api/v1/files?page=0&size=10`
* **Headers**: `X-User-Id: <userId>`
* **Response (200 OK)**: Trả về danh sách phân trang các tệp thuộc sở hữu của `uploaderId`.

---

## 4. Các Lưu Ý Về Việc Triển Khai Trong NestJS

1. **MinioClient SDK**:
   * Thiết lập một `MinioModule` toàn cục (Global Module) sử dụng `minio` npm package.
   * Cấu hình thông tin kết nối bằng các biến môi trường (`MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`).

2. **Xử lý Range Requests (HTTP 206)**:
   * Ở NestJS Controller, cần cấu trúc headers thủ công hoặc sử dụng một Service trung gian để chuyển tiếp dữ liệu dạng stream từ MinIO `getObject` (với tuỳ chọn `offset` và `length` tương ứng với dải bytes được yêu cầu) sang cho luồng response của Express (`res`).

3. **Trích xuất thời lượng âm thanh (Audio Duration)**:
   * Sau khi file hoàn tất tải lên hoặc trong luồng upload trực tiếp, backend cần tải hoặc sử dụng stream để đọc dữ liệu qua thư viện `music-metadata` để lấy `duration` mà không cần gọi đến bên thứ ba.
