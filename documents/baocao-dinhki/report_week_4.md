# BÁO CÁO TUẦN 4

## MỤC LỤC

- [NỘI DUNG TỔNG HỢP](#nội-dung-tổng-hợp)
- [PHẦN 1: LỘ TRÌNH HỌC TẬP](#phần-1-lộ-trình-học-tập)
- [PHẦN 2: TIẾN ĐỘ DỰ ÁN TRANSCRIPTHUB](#phần-2-tiến-độ-dự-án-transcripthub)
  - [2.1 Transcript Service — AI Transcription Pipeline](#21-transcript-service--ai-transcription-pipeline)
  - [2.2 Collab Server — Cộng tác thời gian thực (Yjs/CRDT)](#22-collab-server--cộng-tác-thời-gian-thực-yjscrdt)

---

## NỘI DUNG TỔNG HỢP

Tuần 4 tập trung vào:

**Phần học tập (3 buổi):**
- **Web Front-end:** Lịch sử phát triển từ HTML tĩnh đến SPA, các framework phổ biến (React, Vue, Angular, Next.js) và best practice (code-splitting, accessibility, SEO).
- **Web Back-end:** Kiến trúc server-side, framework (NestJS, Express, FastAPI, Spring Boot), REST API design, middleware, authentication pattern.
- **Database in Web Development:** Data modeling, chuẩn normalize, ORM (Prisma, TypeORM, Sequelize), migration và trường hợp phá chuẩn có chủ đích (JSONB, denormalization).

**Phần dự án:** Triển khai **Transcript Service** (pipeline AI hoàn chỉnh: Kafka consumer → Gemini API → lưu JSONB) và **Collab Server** (Yjs CRDT WebSocket, awareness đa người dùng, phiên bản lịch sử).

---

## PHẦN 1: LỘ TRÌNH HỌC TẬP

| Buổi học | Môn học / Chủ đề | Nội dung chi tiết |
|----------|-----------------|-------------------|
| **Buổi 1** | Web Front-end | - Tổng quan lịch sử: HTML tĩnh → AJAX → SPA → SSR/SSG (Next.js). <br>- Giới thiệu các front-end framework: React, Vue 3, Angular, Svelte. <br>- State management: Context API, Zustand, Redux Toolkit. <br>- Build tools: Vite, Webpack, Turbopack. <br>- Best practice: Code-splitting, lazy loading, Web Accessibility (a11y), Core Web Vitals. <br>- Thực hành: Dựng giao diện trang đăng nhập TranscriptHub bằng Next.js App Router. |
| **Buổi 2** | Web Back-end | - Tổng quan server-side: Request lifecycle, middleware pipeline. <br>- Framework phổ biến: NestJS (Node.js), Express, FastAPI (Python), Spring Boot (Java). <br>- REST API Design: Resource naming, HTTP verbs, status codes, versioning, HATEOAS. <br>- Authentication & Authorization: Session, JWT, OAuth2, API Key. <br>- Error handling và Response format chuẩn hóa. <br>- Logging, Rate Limiting, CORS. <br>- Thực hành: Viết controller và service cho Meeting API trong NestJS. |
| **Buổi 3** | Database in Web Development | - Data modeling: Conceptual → Logical → Physical model. <br>- Chuẩn normalize: 1NF, 2NF, 3NF và các trường hợp phá chuẩn. <br>- Constraint: PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK, NOT NULL. <br>- ORM: Prisma (TypeScript), TypeORM, Sequelize — ưu nhược điểm. <br>- Migration workflow: schema migration, data migration, rollback. <br>- Trường hợp dùng JSONB (PostgreSQL) thay cho bảng normalize. <br>- Thực hành: Viết Prisma schema cho toàn bộ CSDL TranscriptHub. |

---

## PHẦN 2: TIẾN ĐỘ DỰ ÁN TRANSCRIPTHUB

### 2.1 Transcript Service — AI Transcription Pipeline

Transcript Service là microservice phức tạp nhất trong hệ thống, thực hiện pipeline chuyển đổi giọng nói thành văn bản có cấu trúc thông qua Google Gemini API.

#### Pipeline hoàn chỉnh

```
File Service           Kafka (transcript.process)     Transcript Service
     |                           |                           |
     |-- publish event --------->|                           |
     |                           |-- consume --------------->|
     |                           |                    1. Acquire Semaphore (max 3)
     |                           |                    2. Lấy file từ MinIO (via FileGateway)
     |                           |                    3. Upload file lên Gemini API
     |                           |                    4. Gọi Gemini generateContent()
     |                           |                    5. Parse JSON response
     |                           |                    6. Lưu structuredContent vào DB
     |                           |                    7. Release Semaphore
     |                           |            Meeting Service
     |                           |-- publish transcript.completed -->
     |                           |                    update status = COMPLETED
```

#### Kiểm soát đồng thời bằng Semaphore

Để tránh quá tải Gemini API và tài nguyên server, Transcript Service tự implement một **Semaphore** không cần thư viện ngoài:

```typescript
class Semaphore {
  private permits: number;
  private queue: (() => void)[] = [];

  constructor(permits: number) { this.permits = permits; }

  async acquire(): Promise<void> {
    if (this.permits > 0) { this.permits--; return; }
    return new Promise<void>((resolve) => { this.queue.push(resolve); });
  }

  release(): void {
    if (this.queue.length > 0) { this.queue.shift()!(); }
    else { this.permits++; }
  }
}

// Tối đa 3 transcription chạy song song
private readonly semaphore = new Semaphore(3);
```

#### Định dạng JSON trả về từ Gemini AI

Gemini API được yêu cầu trả về transcript theo cấu trúc JSON với đầy đủ nhãn người nói và mốc thời gian:

```json
{
  "segments": [
    {
      "speaker": "Speaker A",
      "startTime": 0.0,
      "endTime": 5.2,
      "text": "Chào mọi người, hôm nay chúng ta sẽ thảo luận về..."
    },
    {
      "speaker": "Speaker B",
      "startTime": 5.5,
      "endTime": 12.1,
      "text": "Vâng, tôi đồng ý. Trước tiên chúng ta cần..."
    }
  ],
  "totalDuration": 3600.0,
  "speakerCount": 3
}
```

#### Recovery khi khởi động lại (Stuck Job Recovery)

Khi service restart bất ngờ, các transcript đang ở trạng thái `PROCESSING` sẽ bị treo. Transcript Service tự động phục hồi khi khởi động:

```typescript
async onModuleInit() {
  await this.kafkaProducer.connect();

  // Recovery: Tái xử lý các job bị treo
  const stuckTranscripts = await this.transcriptRepo.findByStatus('PROCESSING');
  if (stuckTranscripts.length > 0) {
    console.log(`[Recovery] Found ${stuckTranscripts.length} stuck jobs, re-queuing...`);
    for (const t of stuckTranscripts) {
      await this.kafkaProducer.emit('transcript.process', { audioFileId: t.audioFileId });
    }
  }
}
```

#### Cấu trúc bảng CSDL

```prisma
model Transcript {
  id                Int      @id @default(autoincrement())
  audioFileId       String   @unique @db.Uuid
  rawText           String   @db.Text              // Toàn văn bản thô
  structuredContent Json     @db.JsonB             // JSON segments có speaker + timestamp
  status            String   @db.VarChar(50)       // PROCESSING | COMPLETED | FAILED
  versions          TranscriptVersion[]
  @@schema("transcripts")
}

model TranscriptVersion {
  id                Int      @id @default(autoincrement())
  transcriptId      Int
  versionName       String   @db.VarChar(255)      // Ví dụ: "Auto-save 14:30"
  rawText           String   @db.Text
  structuredContent Json     @db.JsonB
  createdById       Int?
  createdAt         DateTime @default(now())
  @@index([transcriptId])
  @@index([createdAt])
  @@schema("transcripts")
}
```

**Lý do dùng JSONB thay vì bảng normalize:** Cấu trúc segment thay đổi linh hoạt (số lượng segment, thuộc tính metadata mở rộng), JSONB cho phép query GIN index nhanh trên nội dung, đồng thời lưu trữ snapshot lịch sử đầy đủ mà không cần JOIN phức tạp.

---

### 2.2 Collab Server — Cộng tác thời gian thực (Yjs/CRDT)

Collab Server là một **Node.js WebSocket server độc lập**, không dùng NestJS framework để tối ưu throughput cho kết nối WebSocket lưu lượng cao.

#### Kiến trúc Collab

```
Browser A                  Collab Gateway (WS :8080)         Collab Service (TCP)
    |                               |                               |
    |-- WS connect + JWT auth ----->|                               |
    |                               |-- Xác thực JWT -------------->|
    |                               |<-- OK + meeting info ---------|
    |                               |                               |
    |-- Yjs Update (binary) ------->|                               |
    |                               |-- Broadcast to Room peers --->|
    |<-- Yjs Update (Browser B) ----|                               |
    |                               |-- Persist snapshot to DB ---->|
```

#### Thuật toán CRDT (Conflict-free Replicated Data Types)

Yjs sử dụng **CRDT** để đảm bảo nhiều người dùng chỉnh sửa đồng thời không bao giờ xung đột:

| Đặc điểm | Mô tả |
|---------|-------|
| **Commutative** | Thứ tự nhận update không ảnh hưởng kết quả cuối |
| **Idempotent** | Áp dụng cùng update nhiều lần cho kết quả như nhau |
| **Convergent** | Mọi client đều hội tụ về cùng một state cuối |
| **Latency** | Cảm nhận < 100ms nhờ optimistic local apply |

#### Awareness (Con trỏ thời gian thực)

Ngoài nội dung văn bản, Collab Server đồng bộ **awareness state** — thông tin về vị trí con trỏ, màu sắc và tên người dùng đang chỉnh sửa:

```typescript
// Mỗi client broadcast awareness state của mình
const awareness = provider.awareness;
awareness.setLocalStateField('user', {
  name: currentUser.name,
  color: '#4a9eff',
  cursor: { index: 42, length: 0 },
});
```

#### Lịch sử phiên bản & Rollback

Mỗi khi người dùng nhấn "Lưu phiên bản", Collab Service:
1. Đọc nội dung hiện tại từ Yjs document
2. Gọi Transcript Service (RPC TCP) để tạo `TranscriptVersion` mới
3. Lưu `structuredContent` snapshot + `rawText` vào DB

Khi rollback:
1. Lấy snapshot theo `versionId`
2. Reset Y.Doc về state của snapshot
3. Broadcast delta update cho tất cả client trong room
