# 4. Hướng Dẫn Kiểm Tra & Xác Minh

## 4.1. Kiểm tra thủ công bằng curl

### Test 1: Upload file nhỏ lên Gemini File API

```bash
# Thay YOUR_API_KEY bằng API key thực
API_KEY="YOUR_API_KEY"

# Bước 1: Initiate
curl -v \
  -X POST \
  -H "X-Goog-Upload-Protocol: resumable" \
  -H "X-Goog-Upload-Command: start" \
  -H "X-Goog-Upload-Header-Content-Length: 1000000" \
  -H "X-Goog-Upload-Header-Content-Type: audio/mp3" \
  -H "Content-Type: application/json" \
  -d '{"file": {"displayName": "test_audio.mp3"}}' \
  "https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=resumable&key=$API_KEY"
# 
# Kết quả mong đợi: Header x-goog-upload-url trong response
```

### Test 2: Kiểm tra trạng thái file

```bash
# fileName là "files/xxxxx" lấy từ kết quả upload
FILE_NAME="files/your-file-name-here"

curl \
  "https://generativelanguage.googleapis.com/v1beta/$FILE_NAME?key=$API_KEY"

# Kết quả mong đợi:
# { "name": "files/xxx", "state": "ACTIVE", "uri": "...", "mimeType": "audio/mp3" }
```

### Test 3: Xóa file

```bash
curl -X DELETE \
  "https://generativelanguage.googleapis.com/v1beta/$FILE_NAME?key=$API_KEY"
# Kết quả mong đợi: 200 OK với body rỗng {}
```

---

## 4.2. Kiểm tra qua API hệ thống

### Test với Swagger UI
Truy cập: `http://localhost:3000/api/docs`

1. Authenticate với JWT token
2. Chọn `POST /api/v1/transcripts/generate/{fileId}`
3. Cung cấp `fileId` hợp lệ (file đã upload thành công, status = READY)
4. Quan sát logs của `transcript-service`

### Logs mong đợi khi thành công

```
[Transcript] Downloading audio for fileId: abc-123
[Transcript] Downloaded 52428800 bytes
[Transcript] Uploading to Gemini File API...
[File API] Initiate session successful
[File API] Upload bytes: 200 OK
[Transcript] Uploaded: files/gemini-generated-name
[File API] File files/gemini-generated-name is still PROCESSING. Waiting 2s...
[File API] File files/gemini-generated-name is ACTIVE and ready.
[Transcript] Calling Gemini API with fileUri: https://generativelanguage.googleapis.com/v1beta/files/xxx
[File API] Deleted file: files/xxx
[Transcript] Done — 45 segments extracted
```

---

## 4.3. Các tình huống lỗi và cách xử lý

### Lỗi 1: API Key không đúng
```
[File API] Initiate failed: 400 - {"error": {"code": 400, "message": "API key not valid"}}
```
**Giải pháp**: Kiểm tra biến môi trường `GEMINI_API_KEY` trong `.env`

### Lỗi 2: MIME type không được hỗ trợ
```
Gemini API error: 400 - {
  "error": {"message": "The File API doesn't support files with the given MIME type: audio/x-custom"}
}
```
**Giải pháp**: Đảm bảo file âm thanh có MIME type hợp lệ. Các format được hỗ trợ:
- `audio/mp3`, `audio/mpeg`
- `audio/wav`, `audio/wave`
- `audio/aac`, `audio/flac`
- `audio/ogg`, `audio/opus`
- `audio/m4a`, `audio/webm`

### Lỗi 3: File đang PROCESSING quá lâu
```
[File API] Timeout waiting for file files/xxx to become ACTIVE after 60000ms
```
**Giải pháp**: File quá lớn hoặc có vấn đề với format. Tăng `maxWaitMs` lên 120_000 hoặc 180_000.

### Lỗi 4: File-service không phản hồi
```
Failed to download file: HTTP 404
```
**Giải pháp**: Kiểm tra `fileId` có tồn tại và status là `READY` trong database chưa.

---

## 4.4. So sánh thời gian xử lý

| File âm thanh | Thời gian (cũ)      | Thời gian (mới)     |
|---------------|---------------------|---------------------|
| 5 MB          | ~30s                | ~35s (thêm upload)  |
| 50 MB         | ❌ Lỗi 413           | ~90s                |
| 200 MB        | ❌ OOM Crash          | ~3-5 phút           |
| 500 MB        | ❌ OOM Crash          | ~8-12 phút          |

> **Lưu ý**: File nhỏ sẽ chậm hơn một chút do thêm bước upload + polling. Đây là đánh đổi hoàn toàn hợp lý để đổi lấy sự ổn định và khả năng xử lý file lớn.

---

## 4.5. Monitoring & Observability

Thêm metrics theo dõi trong production:

```typescript
// Theo dõi thời gian upload
const uploadStart = Date.now();
const uploadedFile = await this.uploadToGeminiFileApi(...);
const uploadMs = Date.now() - uploadStart;
console.log(`[Metrics] gemini_upload_ms=${uploadMs} fileId=${fileId}`);

// Theo dõi thời gian poll
const pollStart = Date.now();
await this.waitForFileActive(uploadedFile.name);
const pollMs = Date.now() - pollStart;
console.log(`[Metrics] gemini_poll_ms=${pollMs} fileId=${fileId}`);

// Theo dõi thời gian generate
const genStart = Date.now();
// ... generateContent call ...
const genMs = Date.now() - genStart;
console.log(`[Metrics] gemini_generate_ms=${genMs} fileId=${fileId}`);
```
