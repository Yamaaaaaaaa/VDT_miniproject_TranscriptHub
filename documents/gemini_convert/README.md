# Tài Liệu: Chuyển Đổi Sang Gemini File API

> **Mục tiêu**: Khắc phục vấn đề OOM (Out Of Memory) và lỗi HTTP 413 khi dịch các tệp âm thanh lớn (>20MB) bằng cách chuyển từ cơ chế gửi Base64 inline sang **Gemini File API** với cơ chế Resumable Upload.

## Cấu trúc thư mục

```
documents/gemini_convert/
├── README.md                          ← Tổng quan & hướng dẫn (file này)
├── 1_van_de_hien_tai.md              ← Phân tích vấn đề cũ (Base64 inline)
├── 2_gemini_file_api_theory.md       ← Lý thuyết Gemini File API
├── 3_implementation_guide.md         ← Hướng dẫn triển khai code thực tế
└── 4_testing_and_verification.md     ← Hướng dẫn kiểm tra & xác minh
```

## Tóm tắt thay đổi

| Khía cạnh          | Cũ (Base64 Inline)                      | Mới (File API)                           |
|--------------------|-----------------------------------------|------------------------------------------|
| Giới hạn file      | ~20MB (HTTP body limit)                 | 2 GB                                     |
| Tiêu thụ RAM       | 3× kích thước file (buffer + base64)   | Streaming, không giữ toàn bộ trong RAM  |
| Thời gian xử lý    | Tải xuống + encode + gửi tuần tự       | Upload song song, Gemini xử lý async    |
| Lỗi có thể gặp     | ECONNRESET, 413, OOM crash              | Retry tự động, 48h file TTL             |
| File được lưu lại  | Không                                   | Có (48h), dùng được cho nhiều request)  |

## Các file đã thay đổi trong source code

- **`services_ms/apps/transcript/src/transcript.service.ts`** — Logic chính được viết lại hoàn toàn
