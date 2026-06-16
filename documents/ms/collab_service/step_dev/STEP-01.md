# STEP-01: Database Schema

## Mục Tiêu

Tạo bảng `transcript_versions` để lưu trữ lịch sử các phiên bản (snapshots) của transcript.

## Dependencies

- ✅ STEP-00 (Prerequisites)

## Checklist

- [ ] Kiểm tra schema hiện tại của bảng `transcripts`
- [ ] Thêm bảng `transcript_versions`
- [ ] Tạo migration
- [ ] Seed data test (optional)

---

## 1. Kiểm Tra Schema Hiện Tại

Xem file `services_ms/prisma/schema.prisma` để hiểu cấu trúc bảng `transcripts`:

```prisma
model Transcript {
  id                Int       @id @default(autoincrement())
  audio_file_id     String    @unique @map("audio_file_id")
  raw_text          String?   @db.Text @map("raw_text")
  structured_content Json?    @map("structured_content")
  status            String    @default("PROCESSING")
  created_at        DateTime  @default(now()) @map("created_at")
  updated_at        DateTime  @updatedAt @map("updated_at")

  // Relationship
  audio_file        AudioFile @relation(fields: [audio_file_id], references: [id])

  @@map("transcripts")
}
```

---

## 2. Thêm Bảng `TranscriptVersions`

Thêm model sau vào `services_ms/prisma/schema.prisma`:

```prisma
model TranscriptVersion {
  id                  Int       @id @default(autoincrement())
  transcript_id       Int       @map("transcript_id")
  version_name        String    @map("version_name") @db.VarChar(255)
  raw_text            String?   @db.Text @map("raw_text")
  structured_content  Json?     @map("structured_content")
  created_by_id       Int?      @map("created_by_id")
  created_at          DateTime  @default(now()) @map("created_at")

  // Relationship
  transcript          Transcript @relation(fields: [transcript_id], references: [id], onDelete: Cascade)

  @@map("transcript_versions")
  @@index([transcript_id])
  @@index([created_at])
}
```

**Thêm relationship vào model Transcript:**

```prisma
model Transcript {
  id                Int       @id @default(autoincrement())
  audio_file_id     String    @unique @map("audio_file_id")
  raw_text          String?   @db.Text @map("raw_text")
  structured_content Json?    @map("structured_content")
  status            String    @default("PROCESSING")
  created_at        DateTime  @default(now()) @map("created_at")
  updated_at        DateTime  @updatedAt @map("updated_at")

  // Relationship
  audio_file        AudioFile @relation(fields: [audio_file_id], references: [id])
  versions          TranscriptVersion[]  // THÊM DÒNG NÀY

  @@map("transcripts")
}
```

---

## 3. Tạo Migration

```bash
cd services_ms
npx prisma migrate dev --name add_transcript_versions
```

**Expected Output:**
```
✓ Prisma migrate created the migration file...
✓ Applied migration add_transcript_versions
```

---

## 4. File Cần Sửa

### `services_ms/prisma/schema.prisma`

```prisma
// ... existing models ...

model Transcript {
  id                Int       @id @default(autoincrement())
  audio_file_id     String    @unique @map("audio_file_id")
  raw_text          String?   @db.Text @map("raw_text")
  structured_content Json?    @map("structured_content")
  status            String    @default("PROCESSING")
  created_at        DateTime  @default(now()) @map("created_at")
  updated_at        DateTime  @updatedAt @map("updated_at")

  // Relationship
  audio_file        AudioFile @relation(fields: [audio_file_id], references: [id])
  versions          TranscriptVersion[]  // THÊM

  @@map("transcripts")
}

model TranscriptVersion {  // THÊM MODEL MỚI
  id                  Int       @id @default(autoincrement())
  transcript_id       Int       @map("transcript_id")
  version_name        String    @map("version_name") @db.VarChar(255)
  raw_text            String?   @db.Text @map("raw_text")
  structured_content  Json?     @map("structured_content")
  created_by_id       Int?      @map("created_by_id")
  created_at          DateTime  @default(now()) @map("created_at")

  // Relationship
  transcript          Transcript @relation(fields: [transcript_id], references: [id], onDelete: Cascade)

  @@map("transcript_versions")
  @@index([transcript_id])
  @@index([created_at])
}
```

---

## Làm Sao Để Test?

### Test 1: Kiểm tra migration đã chạy

```bash
cd services_ms
npx prisma migrate status
```

**Expected Output:**
```
Database migrations:
  ✓ 20240601_add_transcript_versions偏
```

### Test 2: Kiểm tra bảng đã được tạo

```bash
# Sử dụng psql hoặc database tool
psql $DATABASE_URL -c "\d transcript_versions"
```

**Expected Output:**
```
Table "public.transcript_versions"
     Column          |         Type         | Nullable
---------------------+----------------------+----------
 id                  | integer              | not null
 transcript_id       | integer              | not null
 version_name        | character varying    | not null
 raw_text            | text                 |
 structured_content  | jsonb                |
 created_by_id       | integer              |
 created_at          | timestamp(3)         | not null
Indexes:
  "transcript_versions_pkey" PRIMARY KEY
  "transcript_versions_transcript_id_idx"
  "transcript_versions_created_at_idx"
```

### Test 3: Kiểm tra relationship trong Prisma Client

```bash
cd services_ms
npx ts-node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
console.log('Transcript model:', prisma.transcript.fields.map(f => f.name));
console.log('Has versions:', prisma.transcript.fields.some(f => f.name === 'versions'));
"
```

---

## Output Sau Step Này

Sau khi hoàn thành STEP-01:

1. ✅ Bảng `transcript_versions` đã được tạo trong database
2. ✅ Relationship giữa `transcripts` và `transcript_versions` đã được thiết lập
3. ✅ Prisma Client đã được regenerate với model mới

---

## Tiếp Theo

👉 **[STEP-02: Collab Service (TCP RPC Server)](./STEP-02.md)** - Tạo TCP RPC server xử lý snapshot commands
