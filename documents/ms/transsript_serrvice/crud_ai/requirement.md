# Tài Liệu Yêu Cầu Thiết Kế - Transcript Service (AI Transcription)

Tài liệu này mô tả chi tiết các yêu cầu kỹ thuật, kiến trúc, cấu trúc cơ sở dữ liệu, đặc tả API và cơ chế tích hợp AI để xây dựng **Transcript Service** trong hệ thống TranscriptHub sử dụng NestJS, Google Gemini AI, Prisma và Apache Kafka.

Dịch vụ này chịu trách nhiệm tự động hoặc thủ công nhận diện giọng nói và chuyển đổi dữ liệu âm thanh (audio files) thành văn bản dịch (transcripts) dạng thô cũng như phân đoạn có cấu trúc (structured segments with timeline & speaker labels).

---

## 1. Yêu Cầu Công Nghệ & Thành Phần Hệ Thống

### 1.1 Tech Stack đề xuất
* **Framework**: NestJS (Monorepo/Microservice).
* **AI Engine**: **Google Gemini AI API** (`gemini-2.5-flash` là model mặc định) – Dùng để nhận diện giọng nói từ dữ liệu âm thanh dạng Base64 và sinh dữ liệu bản dịch có cấu trúc JSON.
* **Message Broker**: **Apache Kafka** – Nhận sự kiện từ hệ thống để tự động kích hoạt tiến trình tạo bản dịch ngay sau khi tệp tin âm thanh được tải lên thành công.
* **Database**: PostgreSQL (Schema `transcripts`) – Lưu trữ siêu dữ liệu và nội dung bản dịch.
* **ORM**: Prisma (sử dụng Prisma Client để thao tác với Postgres).
* **Giao tiếp liên dịch vụ (Inter-service Communication)**:
  * **TCP Microservice**: Lắng nghe yêu cầu truy vấn/thao tác dữ liệu bản dịch từ API Gateway qua cổng TCP Port `3005`.
  * **TCP Client (Files)**: Kết nối với File Service qua cổng TCP Port `3004` để kiểm tra sự tồn tại của tệp tin âm thanh và lấy thông tin metadata (như `mimeType`).
  * **HTTP Client (Fetch/Stream)**: Tải trực tiếp luồng dữ liệu nhị phân (audio streaming) của tệp tin từ File Service qua cổng HTTP Port `3003`.

### 1.2 Luồng Xử Lý Dịch Thuật Bất Đồng Bộ (Asynchronous AI Transcription Flow)
Hệ thống hỗ trợ 2 cơ chế kích hoạt dịch thuật âm thanh:

#### A. Kích hoạt tự động qua sự kiện (Event-driven Auto Transcription)
1. Người dùng tải tệp tin lên thông qua Client và File Service hoàn tất tiến trình upload.
2. `File Service` gửi sự kiện `AUDIO_FILE_UPLOADED` vào Kafka topic `audio-file-events`.
3. `Transcript Service` tiêu thụ (consume) sự kiện từ topic này, trích xuất thông tin `fileId`.
4. Khởi tạo bản ghi bản dịch trong PostgreSQL với trạng thái ban đầu là `PROCESSING`.
5. Kích hoạt tiến trình dịch ngầm qua bộ lập lịch phi chặn `setImmediate()`.
6. Gọi API của File Service để lấy metadata và tải file nhị phân, chuyển đổi sang định dạng Base64.
7. Gửi dữ liệu Base64 kèm System Prompt cấu trúc đến Gemini AI.
8. Nhận kết quả dịch từ Gemini, parse dữ liệu JSON và lưu vào DB với trạng thái `COMPLETED` (hoặc `FAILED` nếu có lỗi xảy ra).

#### B. Kích hoạt thủ công qua API (Manual API Trigger)
1. Người dùng bấm nút "Dịch lại" hoặc "Tạo bản dịch" trên giao diện Client.
2. Client gửi request HTTP POST `/api/v1/transcripts/generate` tới API Gateway.
3. API Gateway gửi yêu cầu TCP RPC `generate_transcript_manual` tới Transcript Service.
4. `Transcript Service` gọi TCP RPC sang File Service để kiểm tra sự tồn tại của tệp tin âm thanh.
5. Nếu tệp hợp lệ, khởi tạo/cập nhật trạng thái bản ghi thành `PROCESSING` và chạy tiến trình dịch ngầm tương tự luồng tự động.

---

## 2. Thiết Kế Cơ Sở Dữ Liệu (Database Schema)

Cấu trúc bảng `transcripts` lưu trữ kết quả nhận diện giọng nói trong cơ sở dữ liệu PostgreSQL (được định nghĩa qua Prisma model):

```prisma
// Cấu hình trong schema.prisma

model Transcript {
  id                Int      @id @default(autoincrement())
  audioFileId       String   @unique @map("audio_file_id") @db.Uuid
  rawText           String   @map("raw_text") @db.Text
  structuredContent Json     @map("structured_content") @db.JsonB
  status            String   @db.VarChar(50) // "PROCESSING", "COMPLETED", "FAILED"
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  @@map("transcripts")
  @@schema("transcripts") // Thuộc schema transcripts riêng biệt
}
```

*Lưu ý*: Mảng `schemas` trong cấu hình `datasource db` của file `schema.prisma` phải bao gồm `"transcripts"`.

---

## 3. Đặc Tả API & Microservice Messages (Specifications)

### 3.1 REST API phía API Gateway (Dành cho Client)
Các REST API này yêu cầu Header xác thực người dùng (do Gateway đính kèm và kiểm tra JWT).

#### 3.1.1 Lấy bản dịch theo ID tệp tin âm thanh
* **Endpoint**: `GET /api/v1/transcripts/file/{audioFileId}`
* **Response (200 OK)**:
  ```json
  {
    "id": 12,
    "audioFileId": "8b51d8b9-4781-4252-944a-d68a2d12e698",
    "rawText": "Xin chào mọi người. Hôm nay chúng ta sẽ bàn về kế hoạch triển khai microservice...",
    "structuredContent": {
      "segments": [
        {
          "id": "seg-1",
          "startTime": 0.0,
          "endTime": 3.5,
          "speaker": "Speaker 1",
          "text": "Xin chào mọi người."
        },
        {
          "id": "seg-2",
          "startTime": 3.6,
          "endTime": 9.2,
          "speaker": "Speaker 2",
          "text": "Hôm nay chúng ta sẽ bàn về kế hoạch triển khai microservice..."
        }
      ]
    },
    "status": "COMPLETED",
    "createdAt": "2026-06-14T12:00:00.000Z",
    "updatedAt": "2026-06-14T12:01:30.000Z"
  }
  ```

#### 3.1.2 Lấy danh sách tất cả các bản dịch trong hệ thống
* **Endpoint**: `GET /api/v1/transcripts`
* **Response (200 OK)**: Trả về danh sách mảng chứa các đối tượng bản dịch có cấu trúc tương tự ở mục 3.1.1.

#### 3.1.3 Kích hoạt dịch thuật thủ công
* **Endpoint**: `POST /api/v1/transcripts/generate`
* **Request Body**:
  ```json
  {
    "fileId": "8b51d8b9-4781-4252-944a-d68a2d12e698"
  }
  ```
* **Response (201 Created)**: Trả về bản ghi Transcript vừa khởi tạo với trạng thái `PROCESSING`.

#### 3.1.4 Xóa bản dịch
* **Endpoint**: `DELETE /api/v1/transcripts/{id}`
* **Response (200 OK)**:
  ```json
  {
    "message": "Transcript deleted successfully",
    "id": 12
  }
  ```

---

### 3.2 Giao tiếp TCP RPC (Nhận từ API Gateway)
Transcript Service lắng nghe các pattern tin nhắn TCP sau trên Port `3005`:

1. **`get_transcript_by_audio_file`**: Nhận tham số `audioFileId` (string) và trả về thông tin bản dịch từ DB.
2. **`get_all_transcripts`**: Trả về danh sách toàn bộ bản dịch.
3. **`generate_transcript_manual`**: Nhận tham số `fileId` (string) để kiểm tra tính hợp lệ của tệp qua File Service và kích hoạt dịch thuật ngầm.
4. **`delete_transcript`**: Nhận tham số `id` (number) để thực hiện xóa bản dịch tương ứng.

---

### 3.3 Sự kiện Kafka (Nhận từ File Service)
* **Topic**: `audio-file-events`
* **Event Pattern**: `@EventPattern('audio-file-events')`
* **Payload cấu trúc sự kiện**:
  ```json
  {
    "key": "audioFileId",
    "value": {
      "eventId": "uuid-string",
      "eventType": "AUDIO_FILE_UPLOADED",
      "timestamp": "ISO-8601-string",
      "payload": {
        "fileId": "8b51d8b9-4781-4252-944a-d68a2d12e698",
        "fileName": "meeting_recording_130626.mp3",
        "bucketName": "transcripthub-bucket",
        "objectKey": "1/8b51d8b9-4781-4252-944a-d68a2d12e698_meeting_recording_130626.mp3",
        "fileSize": 15728640,
        "mimeType": "audio/mpeg",
        "durationSeconds": 345,
        "uploaderId": 1
      }
    }
  }
  ```

---

## 4. Các Lưu Ý Về Việc Triển Khai Trong NestJS & Tích Hợp AI

1. **Tích hợp Google Gemini AI**:
   * Sử dụng Google Gemini API bằng cách gửi yêu cầu HTTP POST trực tiếp đến Endpoint của API Generative Language.
   * Để gửi file âm thanh chất lượng tốt nhất, file nhị phân sẽ được chuyển thành chuỗi Base64 và nhúng trực tiếp vào cấu trúc payload của Gemini (`inlineData` object).
   * Yêu cầu trả về cấu trúc JSON nghiêm ngặt nhờ tham số cấu hình `generationConfig: { responseMimeType: 'application/json' }`.

2. **System Prompt Hướng Dẫn Gemini AI**:
   * Cần định nghĩa rõ System Prompt yêu cầu AI chia nhỏ tệp âm thanh thành các đoạn (`segments`) logic, gán nhãn người nói (`Speaker 1`, `Speaker 2`), đánh dấu thời điểm bắt đầu/kết thúc (`startTime`, `endTime` bằng giây) và lọc bỏ các dấu nháy kép không hợp lệ trong chuỗi JSON trả về.

3. **Xử lý Bất đồng bộ (Non-blocking Background Processing)**:
   * Do quá trình gửi dữ liệu âm thanh lớn và chờ AI nhận diện có thể mất từ vài chục giây đến vài phút, tuyệt đối không được chặn luồng xử lý tin nhắn TCP của NestJS.
   * Sử dụng hàm `setImmediate()` của Node.js để tách biệt luồng xử lý tải file và gọi Gemini ra khỏi event loop chính. Điều này giúp Microservice phản hồi tin nhắn thành công ngay lập tức cho API Gateway, trong khi công việc nặng được chạy ở chế độ nền.
