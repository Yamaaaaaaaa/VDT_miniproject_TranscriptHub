# 3. Hướng Dẫn Triển Khai — Implementation Guide

## 3.1. Code mới trong `transcript.service.ts`

File đã được cập nhật hoàn chỉnh. Phần này giải thích chi tiết từng phương thức mới.

---

### 3.1.1. Phương thức `uploadToGeminiFileApi()` — Bước 1+2: Upload file lên Google

```typescript
/**
 * Upload một file âm thanh lên Gemini File API sử dụng Resumable Upload.
 *
 * Tại sao dùng Resumable?
 *   - Multipart chỉ phù hợp file < 10MB (gửi toàn bộ 1 request)
 *   - Resumable chia thành 2 bước: Initiate + Upload bytes
 *   - Resumable có thể resume nếu kết nối bị gián đoạn
 *   - Streaming: không cần giữ toàn bộ file trong RAM
 *
 * @param audioBuffer - Buffer chứa dữ liệu âm thanh
 * @param mimeType   - MIME type (ví dụ: audio/mp3, audio/wav)
 * @param displayName - Tên file hiển thị trên Google File API
 * @returns Thông tin file đã upload { name, uri, mimeType }
 */
private async uploadToGeminiFileApi(
  audioBuffer: Buffer,
  mimeType: string,
  displayName: string,
): Promise<{ name: string; uri: string; mimeType: string }> {
  const apiKey = this.configService.get<string>('GEMINI_API_KEY');
  const numBytes = audioBuffer.length;

  // ───── BƯỚC 1: Khởi tạo phiên Resumable Upload ─────
  // Gửi metadata (kích thước, MIME type) để Google tạo 1 upload session
  const initiateResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=resumable&key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(numBytes),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: { displayName },
      }),
    },
  );

  if (!initiateResponse.ok) {
    const errText = await initiateResponse.text();
    throw new Error(`[File API] Initiate failed: ${initiateResponse.status} - ${errText}`);
  }

  // URL upload thực sự nằm trong response header (không phải body)
  const uploadUrl = initiateResponse.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    throw new Error('[File API] No upload URL returned from initiate step');
  }

  // ───── BƯỚC 2: Upload dữ liệu nhị phân ─────
  // Gửi toàn bộ buffer đến uploadUrl
  // "upload, finalize" = upload bytes và đồng thời hoàn tất upload
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(numBytes),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
      'Content-Type': mimeType,
    },
    body: audioBuffer,
  });

  if (!uploadResponse.ok) {
    const errText = await uploadResponse.text();
    throw new Error(`[File API] Upload failed: ${uploadResponse.status} - ${errText}`);
  }

  const uploadResult: any = await uploadResponse.json();
  const fileInfo = uploadResult.file;

  return {
    name: fileInfo.name,      // ví dụ: "files/abc123xyz"
    uri: fileInfo.uri,        // URL dùng trong generateContent
    mimeType: fileInfo.mimeType,
  };
}
```

---

### 3.1.2. Phương thức `waitForFileActive()` — Bước 3: Chờ file sẵn sàng

```typescript
/**
 * Poll trạng thái của file trên Gemini File API.
 *
 * Tại sao cần poll?
 *   - Sau khi upload, Gemini cần thời gian để xử lý và index file
 *   - Trạng thái: PROCESSING → ACTIVE (thành công) hoặc FAILED
 *   - Nếu gọi generateContent khi file đang PROCESSING → lỗi
 *
 * @param fileName   - Tên file (ví dụ: "files/abc123xyz")
 * @param maxWaitMs  - Timeout tối đa tính bằng ms (mặc định 60 giây)
 * @returns URI của file khi đã ACTIVE
 */
private async waitForFileActive(
  fileName: string,
  maxWaitMs = 60_000,
): Promise<string> {
  const apiKey = this.configService.get<string>('GEMINI_API_KEY');
  const startTime = Date.now();
  const pollInterval = 2000; // 2 giây mỗi lần poll

  while (Date.now() - startTime < maxWaitMs) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
    );

    if (!res.ok) {
      throw new Error(`[File API] Status check failed: ${res.status}`);
    }

    const fileStatus: any = await res.json();

    if (fileStatus.state === 'ACTIVE') {
      console.log(`[File API] File ${fileName} is ACTIVE and ready.`);
      return fileStatus.uri;
    }

    if (fileStatus.state === 'FAILED') {
      throw new Error(`[File API] File ${fileName} processing FAILED`);
    }

    // PROCESSING — chờ tiếp
    console.log(
      `[File API] File ${fileName} is still ${fileStatus.state}. ` +
        `Waiting ${pollInterval / 1000}s...`,
    );
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(
    `[File API] Timeout waiting for file ${fileName} to become ACTIVE after ${maxWaitMs}ms`,
  );
}
```

---

### 3.1.3. Phương thức `deleteGeminiFile()` — Bước 5: Dọn dẹp

```typescript
/**
 * Xóa file khỏi Google File API sau khi transcription hoàn tất.
 *
 * Tại sao cần xóa?
 *   - File tự xóa sau 48h, nhưng xóa sớm giúp tránh vô tình
 *     dùng file cũ trong các request khác
 *   - Tuân thủ data hygiene (dữ liệu nhạy cảm không lưu lâu hơn cần)
 *   - Lỗi khi xóa không phải lỗi nghiêm trọng — chỉ log warning
 */
private async deleteGeminiFile(fileName: string): Promise<void> {
  const apiKey = this.configService.get<string>('GEMINI_API_KEY');
  try {
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
      { method: 'DELETE' },
    );
    console.log(`[File API] Deleted file: ${fileName}`);
  } catch (err) {
    // Không throw — việc xóa thất bại không ảnh hưởng kết quả transcription
    console.warn(`[File API] Could not delete file ${fileName}:`, err);
  }
}
```

---

### 3.1.4. Phương thức `transcribe()` được viết lại

```typescript
/**
 * Toàn bộ luồng transcription sử dụng Gemini File API.
 * Thay thế hoàn toàn cơ chế Base64 inline cũ.
 */
private async transcribe(
  fileId: string,
): Promise<{ rawText: string; segments: any[] }> {
  const apiKey = this.configService.get<string>('GEMINI_API_KEY');
  const modelName = this.configService.get<string>('GEMINI_MODEL', 'gemini-2.5-flash');

  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_actual_gemini_api_key_here') {
    throw new Error('Gemini API Key is not configured correctly.');
  }

  // BƯỚC 1: Lấy metadata file
  let mimeType = 'audio/mp3';
  try {
    const fileMetadata = await this.fileGateway.getFileMetadata(fileId);
    if (fileMetadata?.mimeType) mimeType = fileMetadata.mimeType;
  } catch {
    console.warn(`[Transcript] Could not get metadata for ${fileId}, using fallback mimeType`);
  }

  // BƯỚC 2: Tải file âm thanh vào buffer từ file-service
  // Tạm thời vẫn dùng Buffer — nhưng đây là lần tải DUY NHẤT và không encode Base64
  const fileServiceHost = this.configService.get<string>('FILE_SERVICE_HOST', 'localhost');
  const fileServicePort = this.configService.get<number>('FILE_SERVICE_PORT', 3003);
  const fileUrl = `http://${fileServiceHost}:${fileServicePort}/api/v1/files/stream/${fileId}`;

  console.log(`[Transcript] Downloading audio for fileId: ${fileId}`);
  const downloadResponse = await fetch(fileUrl);
  if (!downloadResponse.ok) {
    throw new Error(`Failed to download file: HTTP ${downloadResponse.status}`);
  }
  const arrayBuffer = await downloadResponse.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);
  console.log(`[Transcript] Downloaded ${audioBuffer.length} bytes`);

  // BƯỚC 3: Upload lên Gemini File API
  console.log(`[Transcript] Uploading to Gemini File API...`);
  const uploadedFile = await this.uploadToGeminiFileApi(
    audioBuffer,
    mimeType,
    `transcripthub_${fileId}`,
  );
  console.log(`[Transcript] Uploaded: ${uploadedFile.name}`);

  // BƯỚC 4: Chờ file sẵn sàng (ACTIVE)
  const fileUri = await this.waitForFileActive(uploadedFile.name);

  // BƯỚC 5: Gọi generateContent với fileUri (JSON nhỏ gọn)
  const systemPrompt = `Transcribe the following audio file. Return a JSON object matching this schema exactly:
{
  "rawText": "the full concatenated transcription text",
  "segments": [
    {
      "id": "seg-1",
      "startTime": 0.0,
      "endTime": 5.2,
      "speaker": "Speaker 1",
      "text": "segment text content"
    }
  ]
}
Requirements:
1. Split the transcription into logical segments based on speaker turns or natural pauses.
2. Transcribe in the original language spoken in the audio.
3. Return ONLY valid JSON. Do not include markdown code blocks.
4. Properly escape all string values for JSON.`;

  const payload = {
    contents: [{
      parts: [
        { text: systemPrompt },
        {
          // 🎯 KEY DIFFERENCE: Dùng fileData thay vì inlineData
          fileData: {
            fileUri,          // Chỉ là một URL string — không chứa dữ liệu âm thanh!
            mimeType,
          },
        },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  };

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  console.log(`[Transcript] Calling Gemini API with fileUri: ${fileUri}`);

  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  // BƯỚC 6: Cleanup — xóa file dù thành công hay thất bại
  await this.deleteGeminiFile(uploadedFile.name);

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errBody}`);
  }

  // BƯỚC 7: Parse kết quả
  const resJson: any = await response.json();
  const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No content returned from Gemini API');

  let sanitized = text.trim();
  if (sanitized.startsWith('```json')) sanitized = sanitized.substring(7);
  else if (sanitized.startsWith('```')) sanitized = sanitized.substring(3);
  if (sanitized.endsWith('```')) sanitized = sanitized.slice(0, -3);

  const result = JSON.parse(sanitized.trim());
  console.log(`[Transcript] Done — ${result.segments?.length ?? 0} segments extracted`);
  return result;
}
```

## 3.2. So sánh trực tiếp code cũ vs mới

| Điểm so sánh          | Code cũ                          | Code mới                           |
|-----------------------|----------------------------------|------------------------------------|
| `arrayBuffer`         | Tải vào RAM ✅                    | Tải vào RAM ✅ (cần để upload)      |
| `base64Audio`         | `buffer.toString('base64')` ❌    | **Bỏ hoàn toàn** ✅                 |
| API call số 1         | Không có                         | `POST /upload/v1beta/files` (initiate) |
| API call số 2         | Không có                         | `POST {uploadUrl}` (upload bytes)  |
| API call số 3         | `POST generateContent` (413 ❌)   | `GET /v1beta/files/xxx` (poll)     |
| API call số 4         | —                                | `POST generateContent` (nhỏ ✅)    |
| API call số 5         | —                                | `DELETE /v1beta/files/xxx` (cleanup) |
| Payload generateContent | `{inlineData: {data: 133MB}}` ❌ | `{fileData: {fileUri: "..."}}` ✅  |
| RAM peak usage        | ~3× file size                    | ~1× file size (buffer)             |

## 3.3. Biến môi trường cần thiết

Không có thay đổi biến môi trường — dùng lại cấu hình cũ:

```env
# services_ms/.env
GEMINI_API_KEY=your_actual_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

FILE_SERVICE_HOST=file-service
FILE_SERVICE_PORT=3003
FILE_SERVICE_TCP_PORT=3004
```
