# 1. Phân Tích Vấn Đề Hiện Tại — Base64 Inline

## 1.1. Luồng xử lý hiện tại (Trước khi cải tiến)

```
[transcript-service]
    │
    ├─ 1. Nhận yêu cầu dịch (fileId)
    │
    ├─ 2. Gọi HTTP đến file-service: GET /api/v1/files/stream/{fileId}
    │      └── Tải TOÀN BỘ file âm thanh vào RAM dưới dạng ArrayBuffer
    │
    ├─ 3. Buffer.from(arrayBuffer)       ← Bản sao thứ 1 trong RAM
    │
    ├─ 4. fileBytes.toString('base64')   ← Bản sao thứ 2 (Base64 = +33% size)
    │      └── Ví dụ: file 100MB → base64 string ~133MB trong RAM
    │
    ├─ 5. JSON.stringify({inlineData: {data: base64}})  ← Bản sao thứ 3 trong JSON payload
    │      └── Tổng RAM sử dụng: ~300-400MB cho file 100MB
    │
    └─ 6. fetch(geminiUrl, {body: JSON.stringify(payload)})
           └── Gửi payload JSON khổng lồ qua HTTP
```

## 1.2. Các lỗi cụ thể có thể xảy ra

### Lỗi 1: HTTP 413 — Payload Too Large
```
Gemini API returned non-success code: 413 - {
  "error": {
    "code": 413,
    "message": "Request body too large. Please use the File API for large files."
  }
}
```
**Nguyên nhân**: Google giới hạn kích thước request body khi dùng `inlineData`. 
Giới hạn thực tế: **~20MB** cho audio inline.

### Lỗi 2: Node.js Out of Memory (OOM) Crash
```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
 1: 0xb7c6e0 node::Abort() [node]
 2: ...
```
**Nguyên nhân**: Container Docker của transcript-service thường được cấp ít RAM (256MB - 512MB). 
File âm thanh cuộc họp dài 2 tiếng có thể đạt 200-500MB. 
Khi Node.js cố tạo 3 bản sao trong RAM, process bị OS kill.

### Lỗi 3: ECONNRESET / Timeout khi upload
```
FetchError: request to https://generativelanguage.googleapis.com/ failed, 
reason: socket hang up
```
**Nguyên nhân**: Upload một payload JSON 300MB+ qua một HTTP request duy nhất rất dễ bị timeout (30s mặc định) hoặc bị gateway từ chối kết nối.

## 1.3. Code gốc có vấn đề (transcript.service.ts)

```typescript
// ❌ CŨ — Nguy hiểm với file lớn
private async transcribe(fileId: string) {
  // ...
  
  // BUG 1: Tải toàn bộ file vào RAM
  const downloadResponse = await fetch(fileUrl);
  const arrayBuffer = await downloadResponse.arrayBuffer();
  const fileBytes = Buffer.from(arrayBuffer);          // RAM: 100MB
  const base64Audio = fileBytes.toString('base64');   // RAM: +133MB
  
  // BUG 2: Nhúng base64 trực tiếp vào JSON request
  const payload = {
    contents: [{
      parts: [
        { text: systemPrompt },
        {
          inlineData: {
            mimeType,
            data: base64Audio,    // 133MB trong 1 string!
          },
        },
      ],
    }],
  };
  
  // BUG 3: Gửi toàn bộ một lần — dễ bị 413 hoặc timeout
  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),   // JSON khổng lồ
  });
}
```

## 1.4. Giới hạn thực tế của phương pháp cũ

| File âm thanh | RAM cần dùng | Có thể gặp lỗi?          |
|---------------|--------------|---------------------------|
| < 5 MB        | ~15 MB       | ✅ Không (hoạt động bình thường) |
| 5 - 20 MB     | 15 - 60 MB   | ⚠️ Có thể (tuỳ container RAM) |
| > 20 MB       | > 60 MB      | ❌ Chắc chắn lỗi 413 hoặc OOM  |
| > 100 MB      | > 300 MB     | ❌ OOM crash, không recover được |
