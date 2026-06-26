# 2. Lý Thuyết Gemini File API

## 2.1. Tổng Quan

**Gemini File API** là một dịch vụ lưu trữ file tạm thời của Google, cho phép upload các file media (âm thanh, video, hình ảnh, PDF...) lên máy chủ Google trước, sau đó chỉ truyền **URI tham chiếu** (không phải dữ liệu thực) khi gọi API sinh nội dung.

```
BỎ QUA cách cũ:
  Your Server ──── (100MB base64 trong JSON) ────→ Gemini API

DÙNG File API:
  Your Server ──── (100MB binary stream) ────→ Google File Storage
                                                      │
                                                      │ (URI: files/abc123)
                                                      ↓
  Your Server ──── (JSON nhỏ chứa URI) ─────→ Gemini API
```

## 2.2. Thông số kỹ thuật quan trọng

| Thông số              | Giá trị                                              |
|-----------------------|------------------------------------------------------|
| Kích thước file tối đa | **2 GB** per file                                   |
| Thời gian lưu trữ    | **48 giờ** (tự động xóa sau đó)                     |
| MIME types hỗ trợ    | audio/*, video/*, image/*, text/*, application/pdf  |
| Audio formats         | mp3, wav, aac, flac, ogg, opus, m4a, webm           |
| Số file tối đa        | 20 files per request `generateContent`              |
| Upload protocols      | Multipart (< 10MB) hoặc Resumable (> 10MB)          |

## 2.3. Hai Phương Thức Upload

### Phương thức 1: Multipart Upload (dành cho file nhỏ < 10MB)

```
POST https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart
```

Request body dạng `multipart/form-data`:
- Phần 1 (JSON): Metadata của file (tên, mimeType)
- Phần 2 (Binary): Nội dung file thực sự

**Ưu điểm**: Đơn giản, gửi một request duy nhất.  
**Nhược điểm**: Không phù hợp với file lớn (timeout, không resume được nếu lỗi mạng).

### Phương thức 2: Resumable Upload (dành cho file lớn ≥ 10MB) ← **Sử dụng trong dự án**

Upload chia làm 2 bước:

#### Bước 1: Khởi tạo phiên upload (Initiate)
```
POST https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=resumable
Headers:
  X-Goog-Upload-Protocol: resumable
  X-Goog-Upload-Command: start
  X-Goog-Upload-Header-Content-Length: {file_size_in_bytes}
  X-Goog-Upload-Header-Content-Type: {mime_type}
  Content-Type: application/json

Body: {"file": {"displayName": "tên file hiển thị"}}
```

Server trả về header `x-goog-upload-url` — Đây là URL dùng để upload dữ liệu thực sự.

#### Bước 2: Upload dữ liệu (Upload bytes)
```
POST {x-goog-upload-url}
Headers:
  Content-Length: {file_size_in_bytes}
  X-Goog-Upload-Offset: 0
  X-Goog-Upload-Command: upload, finalize
  Content-Type: {mime_type}

Body: [Dữ liệu nhị phân của file]
```

Server trả về:
```json
{
  "file": {
    "name": "files/abc123xyz",
    "uri": "https://generativelanguage.googleapis.com/v1beta/files/abc123xyz",
    "state": "ACTIVE",
    "mimeType": "audio/mp3",
    "sizeBytes": "52428800"
  }
}
```

#### Bước 3: Sử dụng URI trong generateContent
```json
{
  "contents": [{
    "parts": [
      { "text": "Prompt của bạn..." },
      {
        "fileData": {
          "fileUri": "https://generativelanguage.googleapis.com/v1beta/files/abc123xyz",
          "mimeType": "audio/mp3"
        }
      }
    ]
  }]
}
```

## 2.4. Trạng thái File (State Machine)

```
Upload xong
     │
     ▼
 PROCESSING  ──── Google đang xử lý file ───→  ACTIVE  ──── Sẵn sàng dùng
     │                                             │
     └──────── Lỗi xử lý ──────────────────→   FAILED
```

> ⚠️ **Quan trọng**: Sau khi upload xong, cần **kiểm tra trạng thái** của file trước khi gọi `generateContent`. Nếu file đang ở trạng thái `PROCESSING`, cần chờ (poll) cho đến khi chuyển sang `ACTIVE`.

## 2.5. API để kiểm tra trạng thái File

```
GET https://generativelanguage.googleapis.com/v1beta/{name}?key={API_KEY}
```

Ví dụ: `GET https://generativelanguage.googleapis.com/v1beta/files/abc123xyz?key=...`

Response:
```json
{
  "name": "files/abc123xyz",
  "state": "ACTIVE",
  "uri": "https://generativelanguage.googleapis.com/v1beta/files/abc123xyz"
}
```

## 2.6. Xóa File (cleanup)

File tự động xóa sau 48h, nhưng để tiết kiệm quota, nên xóa thủ công sau khi dùng xong:

```
DELETE https://generativelanguage.googleapis.com/v1beta/files/{name}?key={API_KEY}
```

## 2.7. Luồng hoàn chỉnh của giải pháp mới

```
transcript-service
    │
    ├─ 1. Lấy metadata file từ file-service (mimeType, fileSize)
    │
    ├─ 2. Lấy stream binary từ file-service (KHÔNG tải vào RAM)
    │
    ├─ 3. Khởi tạo Resumable Upload session với Gemini File API
    │      └── Nhận x-goog-upload-url
    │
    ├─ 4. Stream binary trực tiếp lên Gemini File API
    │      └── Nhận { name: "files/xxx", uri: "...", state: "PROCESSING" }
    │
    ├─ 5. Poll trạng thái file cho đến khi state = "ACTIVE"
    │      └── Tối đa 60 giây, interval 2 giây
    │
    ├─ 6. Gọi generateContent với fileUri (JSON nhỏ, không chứa dữ liệu)
    │      └── Nhận kết quả transcription
    │
    ├─ 7. Xóa file trên Google File API (cleanup)
    │
    └─ 8. Parse JSON và lưu vào database
```
