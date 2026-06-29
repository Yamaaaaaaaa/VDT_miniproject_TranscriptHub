# Hướng dẫn Phát triển và Triển khai File Service từ A đến Z

Tài liệu này cung cấp hướng dẫn chi tiết về cấu trúc kiến trúc, cách thức thiết lập hạ tầng, giải thích cặn kẽ từng dòng code và các bước tích hợp hệ thống lưu trữ tệp tin âm thanh (**File Service**) sử dụng NestJS, MinIO (Object Storage) và Prisma trong hệ sinh thái TranscriptHub.

---

## 1. Tổng quan Kiến trúc File Service

File Service được thiết kế theo mô hình **Hybrid Application** (Ứng dụng Lai) trong NestJS nhằm phục vụ hai mục đích giao tiếp khác nhau:

```
                      ┌──────────────────────────────────────┐
                      │            Next.js Client            │
                      └──────────────────┬───────────────────┘
                                         │
                             HTTP REST   │ (Upload / Stream / CRUD)
                                         ▼
                      ┌──────────────────────────────────────┐
                      │             API Gateway              │
                      └──────────┬─────────────────┬─────────┘
                                 │                 │
             HTTP Proxy (3003)   │                 │ TCP RPC (3004)
          (Upload / Stream API)  ▼                 ▼ (Metadata CRUD)
                      ┌──────────────────────────────────────┐
                      │             File Service             │
                      └──────────┬─────────────────┬─────────┘
                                 │                 │
           SigV4 PUT (9100)      │                 │ SQL Query
      (Browser ──► MinIO)        ▼                 ▼
     ┌───────────────┐     ┌───────────┐     ┌───────────┐
     │ MinIO Storage │◄────┤  Postgres │     │ Prisma DB │
     └───────────────┘     └───────────┘     └───────────┘
```

1. **HTTP REST API (Port 3003)**:
   - **Xử lý Stream Âm thanh (`GET /stream/:fileId`)**: Cho phép tải và phát dữ liệu âm thanh trực tiếp trên trình duyệt, hỗ trợ cơ chế tua nhạc (Seeking) bằng giao thức Range Requests (HTTP 206 Partial Content). Giao tiếp này bắt buộc sử dụng HTTP vì không thể truyền luồng nhị phân lớn qua giao thức RPC TCP thô.
   - **Tiếp nhận Upload đơn lẻ (`POST /upload`)**: Dành cho các tệp tin nhỏ tải trực tiếp thông qua API Gateway.
   - **Khởi tạo và hoàn tất Upload (`POST /upload/init`, `POST /upload/complete/:fileId`)**: Cung cấp điểm điều phối cho tiến trình Upload 3 bước.
2. **TCP Microservice (Port 3004)**:
   - Sử dụng giao thức TCP của NestJS Microservices phục vụ các truy vấn siêu dữ liệu (Metadata) giữa các service nội bộ (như API Gateway hoặc Transcript Service kiểm tra sự tồn tại của tệp tin, lấy thông tin người dùng tải lên, cập nhật tên hoặc xóa tệp). Việc này giúp giảm tải HTTP overhead và tăng hiệu năng truy vấn.

---

## 1.5. Phân tích Sâu: Tại sao cần API Gateway Proxy & Phân biệt Endpoint Nội bộ vs Bên ngoài

### 1.5.1. Tại sao phải sử dụng Proxy tại API Gateway?

Việc sử dụng Proxy tại API Gateway đối với File Service (đặc biệt là hai luồng **Upload** và **Streaming**) là bắt buộc vì các lý do cốt lõi sau:

1. **Bảo mật và Điểm đầu vào duy nhất (Single Entry Point)**:
   - Client (Trình duyệt) chỉ giao tiếp duy nhất với API Gateway trên một cổng (`localhost:3000`). Các cổng nội bộ của File Service (`3003` HTTP, `3004` TCP) hoàn toàn bị đóng ở tầng tường lửa hoặc không được public ra ngoài internet.
   - Điều này ngăn chặn việc quét cổng (port scanning) và giảm thiểu bề mặt tấn công. Hơn nữa, nó giải quyết triệt để vấn đề CORS (Cross-Origin Resource Sharing) vì Client chỉ gửi request đến cùng một origin của Gateway.

2. **Xác thực và Phân quyền tập trung (Centralized Authentication)**:
   - API Gateway chịu trách nhiệm giải mã JWT Token thông qua `JwtIdentityGuard` để lấy thông tin định danh người dùng.
   - Sau khi xác thực thành công, Gateway chèn ID người dùng vào header `x-user-id` trước khi chuyển tiếp yêu cầu đi.
   - Nhờ vậy, File Service không cần kết nối tới Identity Service để kiểm tra Token hay giữ secret key để giải mã JWT. Nó hoàn toàn tin tưởng vào header `x-user-id` do Gateway gửi tới.

3. **Luồng dữ liệu nhị phân lớn (Large Binary Streams)**:
   - Các Microservice trong hệ thống sử dụng kết nối TCP để giao tiếp RPC. Tuy nhiên, giao thức TCP Microservice của NestJS chỉ thích hợp cho việc truyền tải thông điệp dạng JSON ngắn gọn, không thể truyền tải hiệu quả luồng dữ liệu nhị phân dung lượng lớn (như file MP3 vài chục MB).
   - Do đó, việc proxy trực tiếp luồng HTTP REST là giải pháp tối ưu nhất để truyền dữ liệu.

4. **Tối ưu hóa bộ nhớ đệm bằng Stream Pipe**:
   - Khi API Gateway thực hiện proxy bằng lệnh `req.pipe(proxyReq)` và chuyển tiếp phản hồi qua `proxyRes.pipe(res)`, dữ liệu nhị phân của file được truyền tải dưới dạng các "chunk" nhỏ liên tục từ MinIO qua File Service, Gateway rồi đến trực tiếp Client.
   - Tiến trình này **không lưu trữ toàn bộ file vào bộ nhớ RAM** của bất kỳ service trung gian nào. Nếu không dùng proxy dạng pipe stream mà tải toàn bộ file vào RAM rồi trả về, máy chủ Gateway hoặc File Service sẽ rất dễ bị treo hoặc crash do tràn bộ nhớ (Out of Memory) khi có nhiều user tải file cùng lúc.

---

### 1.5.2. Phân biệt Endpoint Nội bộ (Internal) và Bên ngoài (External/Public)

Trong kiến trúc Container (Docker) kết hợp Microservices, hệ thống vận hành trên 2 phân vùng mạng tách biệt hoàn toàn:

#### 1. Mạng nội bộ Docker (Docker Network - Internal)
- **Đặc điểm**: Chỉ các container nằm chung một mạng Docker (ví dụ: `transcripthub_net`) mới nhìn thấy và giao tiếp được với nhau.
- **Hostname**: Sử dụng trực tiếp tên Service khai báo trong file `docker-compose.yml` làm tên miền DNS nội bộ (ví dụ: `minio`, `file-service`, `postgres`, `redis`).
- **Ứng dụng**:
  - **`MINIO_ENDPOINT=minio` (cổng `9000`)**: File Service giao tiếp trực tiếp với MinIO qua endpoint này để thực hiện các nghiệp vụ Server-to-Server như kiểm tra Bucket, lấy thông tin tệp tin (`statObject`), hoặc xóa tệp tin (`removeObject`). Các kết nối này chạy với băng thông nội bộ của Docker, tốc độ cực nhanh và bảo mật tuyệt đối.
  - *Lưu ý*: Client bên ngoài (Trình duyệt của người dùng) hoàn toàn không biết và không thể truy cập được tên miền `http://minio:9000` này.

#### 2. Mạng bên ngoài Host (Host Network - External/Public)
- **Đặc điểm**: Là mạng vật lý của máy tính chạy Docker (Host OS) hoặc mạng Internet công cộng.
- **Hostname**: Thường là `localhost`, IP của máy chủ, hoặc tên miền public (ví dụ: `transcripthub.com`).
- **Ứng dụng**:
  - **`MINIO_PUBLIC_ENDPOINT=localhost` (cổng `9100`)**: Là địa chỉ mà Trình duyệt ở Host OS sử dụng để giao tiếp với MinIO.
  - Khi File Service sinh ra một **Presigned PUT URL** để trả về cho Client tự upload file, nó bắt buộc phải chèn địa chỉ public này vào URL (thành `http://localhost:9100/...`). Nếu chèn địa chỉ nội bộ `http://minio:9000/...`, trình duyệt của người dùng sẽ báo lỗi ngay lập tức vì không thể phân giải được tên miền `minio`.
  - Hơn nữa, thuật toán chữ ký **AWS Signature Version 4 (SigV4)** yêu cầu thông tin header `Host` truyền đi từ Browser phải trùng khớp 100% với tên miền đã dùng để tính toán mã hash chữ ký ở Backend. Do đó, File Service phải dùng đúng host công khai (`localhost:9100`) để thực hiện ký HMAC Crypto.

---


## 2. Thiết lập Hạ tầng (Infrastructure Setup)

### 2.1. Cấu hình Docker Compose cho MinIO

MinIO đóng vai trò là kho lưu trữ Object Storage tương thích S3. Cấu hình được đặt trong file [docker-compose.yml](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/docker-compose.yml):

```yaml
  # MinIO Object Storage Container
  minio:
    image: minio/minio:latest
    container_name: transcripthub-minio
    restart: always
    ports:
      - "9100:9000"  # API port (Đã đổi từ 9000 sang 9100 để tránh WSL2 conflict)
      - "9101:9001"  # Console UI port (Đã đổi từ 9001 sang 9101)
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
      MINIO_SERVER_URL: "http://localhost:9100"
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - transcripthub_net
```

> [!WARNING]
> **Sự cố xung đột cổng 9000 trên Windows (WSL2)**:
> Trên môi trường Windows chạy Docker Desktop với WSL2, tiến trình dịch chuyển mạng `wslrelay.exe` thường tự động chiếm cổng `9000` trên giao thức IPv6 (`[::1]:9000`). Điều này dẫn đến hiện tượng các yêu cầu HTTP từ Browser truy cập vào `localhost:9000` bị ngắt kết nối đột ngột hoặc bị Timeout, mặc dù Container MinIO vẫn đang lắng nghe tốt ở IPv4 (`0.0.0.0:9000`).
>
> **Giải pháp**: Đổi cổng ánh xạ từ ngoài vào container thành `9100` (dành cho API) và `9101` (dành cho Web Console UI).

### 2.2. Khởi tạo Bucket tự động (`minio-init`)

Để đảm bảo bucket lưu trữ tệp tin tồn tại sẵn khi hệ thống khởi chạy, chúng ta sử dụng image client `mc` của MinIO để tự động hóa việc tạo và cấu hình quyền truy cập:

```yaml
  minio-init:
    image: minio/mc:latest
    container_name: transcripthub-minio-init
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set myminio http://minio:9000 minioadmin minioadmin;
      mc mb myminio/transcripthub-bucket || true;
      mc anonymous set public myminio/transcripthub-bucket || true;
      exit 0;
      "
    networks:
      - transcripthub_net
```

---

## 3. Cấu trúc Database Schema

Bảng thông tin lưu trữ tệp tin được tách riêng biệt trong schema `files` của database PostgreSQL để tăng tính module hóa. Chi tiết trong [schema.prisma](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/prisma/schema.prisma):

```prisma
// File model (do File Service quản lý độc quyền)
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

- **`id`**: Kiểu UUID, khóa chính của file.
- **`objectKey`**: Đường dẫn lưu trữ vật lý trong bucket (Format: `{uploaderId}/{fileId}_{fileName}`).
- **`fileSize`**: Lưu dung lượng file dạng `BigInt` để hỗ trợ các tệp tin cực lớn (vượt quá giới hạn 2GB của kiểu Int thông thường).
- **`status`**: Trạng thái của tệp tin. Khi khởi tạo tiến trình upload, status là `UPLOADING`. Khi dữ liệu đã được đẩy lên MinIO và xác thực xong, status chuyển sang `READY`.

---

## 4. Chi tiết Mã nguồn File Service

Cấu trúc thư mục nguồn của File Service đặt tại: `services_ms/apps/file/src/`

```
src/
├── dto/
│   ├── update-file.dto.ts
│   └── upload-init.dto.ts
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
├── file.controller.ts
├── file.module.ts
├── file.service.ts
└── main.ts
```

### 4.1. Khởi chạy Ứng dụng Lai: [main.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/file/src/main.ts)

File `main.ts` cấu hình đồng thời máy chủ HTTP (port 3003) và cổng lắng nghe TCP Microservice (port 3004):

```typescript
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { FileModule } from './file.module';

async function bootstrap() {
  // 1. Tạo ứng dụng NestJS thông thường phục vụ REST HTTP
  const app = await NestFactory.create(FileModule);

  // Cấu hình Validation toàn cục cho dữ liệu REST API nhận được
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 2. Đăng ký/Kết nối thêm cổng Microservice TCP
  const tcpPort = parseInt(process.env.FILE_SERVICE_TCP_PORT || '3004', 10);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0', // Lắng nghe từ mọi card mạng trong Docker container
      port: tcpPort,
    },
  });

  // Khởi động lắng nghe kết nối TCP
  await app.startAllMicroservices();
  console.log(`🚀 File Microservice TCP listener is active on port: ${tcpPort}`);

  // Khởi động lắng nghe kết nối HTTP
  const port = process.env.FILE_SERVICE_PORT || 3003;
  await app.listen(port);
  console.log(`🚀 File Service is running on HTTP port: http://localhost:${port}`);
}
bootstrap();
```

### 4.2. Khởi tạo Prisma DB Connection: [prisma.service.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/file/src/prisma/prisma.service.ts)

Để tối ưu hóa số lượng kết nối tới Postgres, service khởi tạo một Connection Pool dùng chung qua thư viện `pg` và liên kết với Prisma:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
    extends PrismaClient
    implements OnModuleInit, OnModuleDestroy {
    constructor() {
        // Cấu hình Connection Pool cho PostgreSQL
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
        });
        const adapter = new PrismaPg(pool);

        // Truyền adapter vào constructor của PrismaClient
        super({ adapter });
    }

    async onModuleInit() {
        await this.$connect();
        console.log('📦 Prisma connected to PostgreSQL (File Service)');
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}
```

### 4.3. Data Transfer Objects (DTOs)

Các lớp dữ liệu xác thực đầu vào bằng decorator từ thư viện `class-validator`.

#### 1. [upload-init.dto.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/file/src/dto/upload-init.dto.ts) (Dành cho khởi tạo upload):
```typescript
import { IsString, IsNotEmpty, IsNumber, IsPositive } from 'class-validator';

export class UploadInitDto {
    @IsString()
    @IsNotEmpty()
    fileName: string;

    @IsNumber()
    @IsPositive()
    fileSize: number; // Kích thước tệp tin (bytes)

    @IsString()
    @IsNotEmpty()
    mimeType: string; // Định dạng MIME (vd: audio/mpeg)
}
```

#### 2. [update-file.dto.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/file/src/dto/update-file.dto.ts) (Dành cho việc đổi tên file):
```typescript
import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateFileDto {
    @IsString()
    @IsNotEmpty()
    fileName: string;
}
```

### 4.4. Logic Core xử lý tệp: [file.service.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/file/src/file.service.ts)

Tệp tin này chứa các logic chính xử lý MinIO client, tự sinh Presigned PUT URL bằng chữ ký AWS SigV4 thuần túy và trích xuất độ dài file nhạc.

#### 4.4.1. Khởi tạo Client kết nối MinIO
```typescript
constructor(private readonly prisma: PrismaService) {
    this.minioClient = new Minio.Client({
        endPoint: process.env.MINIO_ENDPOINT || 'localhost', // Mạng nội bộ trong Docker: 'minio'
        port: parseInt(process.env.MINIO_PORT || '9000', 10), // Port nội bộ: 9000
        useSSL: false,
        accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
        secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    });
}
```

#### 4.4.2. Kỹ thuật ký AWS Signature Version 4 tự xây dựng (SigV4 Crypto)

> [!IMPORTANT]
> **Tại sao không sử dụng `minioClient.presignedPutObject()` có sẵn trong MinIO SDK?**
>
> Khi khởi chạy File Service bên trong container Docker, biến môi trường `MINIO_ENDPOINT` bắt buộc phải là `minio` (hostname của container MinIO trong mạng Docker). Tuy nhiên, Client của Browser ở ngoài Host OS lại chỉ hiểu `localhost:9100`.
>
> Nếu dùng hàm SDK `presignedPutObject()` trong container, SDK sẽ gửi một yêu cầu mạng (`getBucketRegion`) nội bộ để xác thực bucket, rồi sau đó chèn host `minio:9000` vào URL được ký. Khi trả về Browser, Browser không thể thực hiện PUT lên `minio:9000`. Nếu ta cố tình ghi đè Host lúc sinh URL thành `localhost:9100`, chữ ký HMAC sẽ bị lỗi vì Host lúc ký (`minio`) không khớp với Host lúc gửi thực tế từ Browser (`localhost`).
>
> **Giải pháp**: Tự viết mã hóa tạo chữ ký AWS SigV4 bằng thư viện `crypto` tích hợp sẵn của Node.js, sử dụng trực tiếp hostname `localhost:9100` để ký. Khi Browser gửi request đến `localhost:9100`, Header `Host` gửi đi sẽ trùng khớp tuyệt đối với chữ ký đã được tạo.

```typescript
private generatePresignedPutUrl(objectKey: string, expiresInSeconds: number): string {
    const publicHost = process.env.MINIO_PUBLIC_ENDPOINT || 'localhost';
    const publicPort = process.env.MINIO_PUBLIC_PORT || process.env.MINIO_PORT || '9000'; // Port công khai: 9100
    const host = `${publicHost}:${publicPort}`;
    const accessKey = process.env.MINIO_ACCESS_KEY || 'minioadmin';
    const secretKey = process.env.MINIO_SECRET_KEY || 'minioadmin';
    const region = 'us-east-1'; // MinIO mặc định sử dụng region này
    const service = 's3';

    const now = new Date();
    const datestamp = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const amzdate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // YYYYMMDDTHHMMSSZ

    const credentialScope = `${datestamp}/${region}/${service}/aws4_request`;
    const credential = `${accessKey}/${credentialScope}`;

    // Encode URI cho object key nhưng giữ nguyên dấu phân tách thư mục "/"
    const encodedKey = objectKey.split('/').map(p => encodeURIComponent(p)).join('/');
    const canonicalUri = `/${this.bucketName}/${encodedKey}`;

    // Các tham số Query bắt buộc của SigV4, phải được sắp xếp theo bảng chữ cái alphabet
    const params: Record<string, string> = {
        'X-Amz-Algorithm':    'AWS4-HMAC-SHA256',
        'X-Amz-Credential':   credential,
        'X-Amz-Date':         amzdate,
        'X-Amz-Expires':      String(expiresInSeconds),
        'X-Amz-SignedHeaders': 'host',
    };
    const sortedKeys = Object.keys(params).sort();
    const canonicalQueryString = sortedKeys
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
        .join('&');

    // 1. Tạo Canonical Request (Yêu cầu chuẩn hóa)
    const canonicalHeaders = `host:${host}\n`;
    const canonicalRequest = [
        'PUT',
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        'host', // signedHeaders
        'UNSIGNED-PAYLOAD',
    ].join('\n');

    // 2. Tạo String to Sign (Chuỗi cần ký)
    const hashedCanonical = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzdate,
        credentialScope,
        hashedCanonical,
    ].join('\n');

    // 3. Tính toán Signing Key (Chuỗi khóa băm HMAC nối tiếp)
    const kDate    = crypto.createHmac('sha256', `AWS4${secretKey}`).update(datestamp).digest();
    const kRegion  = crypto.createHmac('sha256', kDate).update(region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();

    // 4. Sinh chữ ký Signature (Băm chuỗi cần ký bằng khóa vừa tạo)
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const queryString = canonicalQueryString + `&X-Amz-Signature=${signature}`;
    return `http://${host}${canonicalUri}?${queryString}`;
}
```

#### 4.4.3. Đọc thông tin thời lượng âm thanh (`music-metadata`)

Sau khi file được đưa lên bộ nhớ lưu trữ, hệ thống tiến hành tải một luồng dữ liệu nhỏ của file để trích xuất thẻ metadata thời lượng (seconds) mà không cần tải toàn bộ tệp về ổ đĩa cục bộ:

```typescript
private async extractDurationFromStream(stream: any, mimeType: string, fileSize: number): Promise<number> {
    try {
        // Import động (Dynamic import) vì 'music-metadata' là module ESM thuần túy
        const { parseStream } = await (eval('import("music-metadata")') as Promise<typeof import('music-metadata')>);
        const metadata = await parseStream(stream, { mimeType, size: fileSize });
        stream.destroy(); // Đóng stream ngay khi đọc xong
        return metadata.format.duration ? Math.round(metadata.format.duration) : 0;
    } catch (error) {
        console.error('Failed to parse duration from stream:', error);
        if (stream && typeof stream.destroy === 'function') {
            stream.destroy();
        }
        return 0;
    }
}
```

#### 4.4.4. Hiện thực hóa quy trình Upload 3 bước (3-Step Upload Flow)

Mô hình này giúp tải dữ liệu dung lượng lớn trực tiếp từ Browser lên MinIO mà không cần tải qua API Gateway hay File Service, giảm tải băng thông và bộ nhớ đệm (buffer memory) trên máy chủ backend.

```typescript
// BƯỚC 1: Khởi tạo tiến trình Upload
async initializeUpload(dto: UploadInitDto, uploaderId: number) {
    await this.ensureBucketExists();
    const fileId = uuidv4();
    const objectKey = `${uploaderId}/${fileId}_${dto.fileName}`;

    try {
        // Sinh URL PUT có chữ ký tương thích với host của Browser
        const presignedUrl = this.generatePresignedPutUrl(objectKey, 2 * 60 * 60); // Hạn dùng 2 tiếng

        // Lưu bản ghi tạm thời ở Database với trạng thái UPLOADING
        const audioFile = await this.prisma.audioFile.create({
            data: {
                id: fileId,
                fileName: dto.fileName,
                bucketName: this.bucketName,
                objectKey,
                fileSize: BigInt(dto.fileSize),
                mimeType: dto.mimeType,
                durationSeconds: 0,
                status: 'UPLOADING',
                uploaderId,
            },
        });

        return {
            fileId: audioFile.id,
            presignedUrl,
            chunkSize: 5 * 1024 * 1024, // Gợi ý chunk size 5MB
        };
    } catch (error) {
        console.error('Failed to initialize upload:', error);
        throw new BadRequestException('Failed to initialize upload link');
    }
}

// BƯỚC 2: Browser thực hiện PUT dữ liệu nhị phân trực tiếp lên Presigned URL (Thực hiện ở client)

// BƯỚC 3: Xác nhận hoàn tất tiến trình Upload từ Client
async completeUpload(fileId: string, uploaderId: number) {
    const audioFile = await this.prisma.audioFile.findUnique({
        where: { id: fileId },
    });
    if (!audioFile) throw new NotFoundException(`File with ID ${fileId} not found`);
    if (audioFile.uploaderId !== uploaderId) throw new ForbiddenException('No permission');
    if (audioFile.status !== 'UPLOADING') return audioFile; // Đã xử lý xong trước đó

    try {
        // Lấy thông tin tệp tin từ MinIO để kiểm tra xem file đã tồn tại và khớp size chưa
        const stat = await this.minioClient.statObject(audioFile.bucketName, audioFile.objectKey);
        const actualSize = stat.size;

        // Trích xuất metadata độ dài âm thanh từ stream MinIO
        const stream = await this.minioClient.getObject(audioFile.bucketName, audioFile.objectKey);
        const duration = await this.extractDurationFromStream(stream, audioFile.mimeType, actualSize);

        // Cập nhật lại kích thước thực tế, độ dài và chuyển trạng thái READY
        return await this.prisma.audioFile.update({
            where: { id: fileId },
            data: {
                fileSize: BigInt(actualSize),
                durationSeconds: duration,
                status: 'READY',
            },
        });
    } catch (error) {
        console.error(`Failed to complete upload for fileId: ${fileId}`, error);
        throw new BadRequestException('Failed to complete upload');
    }
}
```

#### 4.4.5. Stream Âm thanh hỗ trợ tua nhạc (Range Request Stream)

Browser khi phát nhạc cần tải từng đoạn dữ liệu nhỏ tương ứng với thời điểm người dùng tua trên thanh trượt thời gian. Việc này được hiện thực bằng cách đọc header `Range` và trả về mã trạng thái HTTP 206 (Partial Content):

```typescript
async streamAudio(fileId: string, rangeHeader: string | undefined, res: any) {
    const audioFile = await this.prisma.audioFile.findUnique({
        where: { id: fileId },
    });
    if (!audioFile || audioFile.status !== 'READY') {
        throw new NotFoundException('Audio file not found or not ready');
    }

    const fileSize = Number(audioFile.fileSize);
    const mimeType = audioFile.mimeType;

    // Thiết lập các Header phản hồi bắt buộc cho truyền tệp dạng stream
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mimeType);

    if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
        // Trường hợp 1: Trình duyệt yêu cầu tải toàn bộ tệp (Không gửi header Range)
        res.setHeader('Content-Length', fileSize.toString());
        try {
            const stream = await this.minioClient.getObject(audioFile.bucketName, audioFile.objectKey);
            stream.pipe(res);
        } catch (error) {
            console.error('Failed to stream full file from MinIO:', error);
            if (!res.headersSent) res.status(500).send('Streaming failed');
        }
    } else {
        // Trường hợp 2: Trình duyệt yêu cầu tải một khoảng dữ liệu xác định (Tua nhạc)
        try {
            const rangeValue = rangeHeader.replace(/bytes=/, '').trim();
            const parts = rangeValue.split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

            // Kiểm tra tính hợp lệ của khoảng dữ liệu yêu cầu
            if (isNaN(start) || start < 0 || start >= fileSize || end >= fileSize || start > end) {
                res.setHeader('Content-Range', `bytes */${fileSize}`);
                res.status(416).send('Requested range not satisfiable');
                return;
            }

            const contentLength = end - start + 1;
            res.status(206); // Trả về mã HTTP 206 Partial Content
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            res.setHeader('Content-Length', contentLength.toString());

            // Đọc một phần đối tượng lưu trữ từ MinIO
            const stream = await this.minioClient.getPartialObject(
                audioFile.bucketName,
                audioFile.objectKey,
                start,
                contentLength,
            );
            stream.pipe(res);
        } catch (error) {
            console.error(`Failed to stream partial content for range: ${rangeHeader}`, error);
            if (!res.headersSent) res.status(500).send('Streaming failed');
        }
    }
}
```

#### 4.4.6. Xóa tệp tin khỏi bộ nhớ vật lý
```typescript
async deleteFile(fileId: string, uploaderId: number) {
    const audioFile = await this.prisma.audioFile.findUnique({ where: { id: fileId } });
    if (!audioFile) throw new NotFoundException(`File with ID ${fileId} not found`);
    if (audioFile.uploaderId !== uploaderId) throw new ForbiddenException('No permission');

    try {
        // Xóa vật lý trên storage MinIO trước
        await this.minioClient.removeObject(audioFile.bucketName, audioFile.objectKey);
    } catch (error) {
        console.error(`Failed to delete object from MinIO:`, error);
    }

    // Xóa bản ghi trong Database
    await this.prisma.audioFile.delete({ where: { id: fileId } });
    return { message: 'File deleted successfully' };
}
```

### 4.5. Bộ điều phối REST & TCP Patterns: [file.controller.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/file/src/file.controller.ts)

Controller thực hiện ánh xạ cả các request HTTP REST từ bên ngoài và các gói tin TCP RPC từ Gateway truyền tới:

```typescript
import {
    Controller, Get, Post, Put, Delete, Body, Param, Query, Headers, UploadedFile, UseInterceptors, Res, Req, BadRequestException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MessagePattern } from '@nestjs/microservices';
import { FileService } from './file.service';
import { UploadInitDto } from './dto/upload-init.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import * as express from 'express';

@Controller('api/v1/files')
export class FileController {
    constructor(private readonly fileService: FileService) { }

    // --- REST HTTP Endpoints (Thông qua proxy của API Gateway) ---

    @Post('upload/init')
    async initializeUpload(@Headers('x-user-id') uploaderId: string, @Body() dto: UploadInitDto) {
        if (!uploaderId) throw new BadRequestException('X-User-Id header is missing');
        const initResponse = await this.fileService.initializeUpload(dto, parseInt(uploaderId, 10));
        return { result: initResponse };
    }

    @Post('upload/complete/:fileId')
    async completeUpload(@Headers('x-user-id') uploaderId: string, @Param('fileId') fileId: string) {
        if (!uploaderId) throw new BadRequestException('X-User-Id header is missing');
        const audioFile = await this.fileService.completeUpload(fileId, parseInt(uploaderId, 10));
        return { result: this.mapToResponse(audioFile) };
    }

    @Get('stream/:fileId')
    async streamAudio(@Param('fileId') fileId: string, @Req() req: express.Request, @Res() res: express.Response) {
        const rangeHeader = req.headers.range;
        return this.fileService.streamAudio(fileId, rangeHeader, res);
    }

    @Delete(':fileId')
    async deleteFile(@Headers('x-user-id') uploaderId: string, @Param('fileId') fileId: string) {
        if (!uploaderId) throw new BadRequestException('X-User-Id header is missing');
        const response = await this.fileService.deleteFile(fileId, parseInt(uploaderId, 10));
        return { result: response.message };
    }

    // --- TCP Microservice Patterns (Kết nối RPC nội bộ) ---

    @MessagePattern('get_file_metadata')
    async getMetadataTcp(fileId: string) {
        const audioFile = await this.fileService.getMetadata(fileId);
        return this.mapToResponse(audioFile);
    }

    @MessagePattern('delete_file')
    async deleteFileTcp(data: { fileId: string; uploaderId: number }) {
        const response = await this.fileService.deleteFile(data.fileId, data.uploaderId);
        return { result: response.message };
    }

    @MessagePattern('list_files')
    async listFilesTcp(data: { uploaderId: number; page: number; size: number }) {
        const response = await this.fileService.listFiles(data.uploaderId, data.page, data.size);
        return {
            content: response.items.map(item => this.mapToResponse(item)),
            totalElements: response.total,
            pageNumber: response.page,
            pageSize: response.size,
            totalPages: response.totalPages,
        };
    }

    private mapToResponse(file: any) {
        return {
            id: file.id,
            fileName: file.fileName,
            bucketName: file.bucketName,
            objectKey: file.objectKey,
            fileSize: file.fileSize.toString(), // Chuyển BigInt thành string tránh crash lỗi JSON serialize
            mimeType: file.mimeType,
            durationSeconds: file.durationSeconds,
            status: file.status,
            uploaderId: file.uploaderId,
            createdAt: file.createdAt,
        };
    }
}
```

---

## 5. Tích hợp phía API Gateway

API Gateway đứng làm cổng bảo mật duy nhất cho toàn bộ hệ thống microservice, thực hiện hai nhiệm vụ chính đối với phân hệ tệp tin:

### 5.1. Proxy HTTP trực tiếp (Cho việc Upload và Streaming): [files.controller.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/api-gateway/src/files/files.controller.ts)

Gateway chuyển tiếp gói tin dạng thô (Stream/Buffer) của các request upload và stream tới port HTTP `3003` của File Service, tự động gán ID của người dùng đã xác thực vào Header `x-user-id`:

```typescript
private readonly fileServiceUrl = `http://${process.env.FILE_SERVICE_HOST || 'localhost'}:${process.env.FILE_SERVICE_PORT || '3003'}`;

private doProxy(req: express.Request, res: express.Response, customPath?: string) {
    const rawPath = customPath || req.url;
    // Bỏ tiền tố api-gateway /api/files hoặc /files ra khỏi đường dẫn đích
    const cleanPath = rawPath.replace(/^\/(api\/)?files/, '');
    const targetUrl = `${this.fileServiceUrl}/api/v1/files${cleanPath}`;
    
    const userId = (req as any).user?.id; // Lấy ID người dùng từ JWT Token đã được xác thực trước đó
    const headers = { ...req.headers };
    if (userId) {
        headers['x-user-id'] = String(userId);
    }
    
    delete headers['host']; // Xóa Host cũ tránh xung đột địa chỉ proxy

    const parsedUrl = new URL(targetUrl);
    const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: req.method,
        headers: headers,
    };

    // Tạo luồng chuyển tiếp dữ liệu nhị phân thô (Stream data proxy)
    const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('Proxy request to File Service failed:', err);
        if (!res.headersSent) res.status(502).send('Bad Gateway');
    });

    req.pipe(proxyReq);
}

@Post('upload/init')
@UseGuards(JwtIdentityGuard) // Bảo mật: Phải đăng nhập mới được gọi
@ApiBearerAuth()
initializeUpload(@Req() req: express.Request, @Res() res: express.Response) {
    this.doProxy(req, res);
}

@Get('stream/:fileId') // Endpoint công khai cho phép phát nhạc qua stream
streamAudio(@Param('fileId') fileId: string, @Req() req: express.Request, @Res() res: express.Response) {
    this.doProxy(req, res);
}
```

### 5.2. TCP Client giao tiếp RPC: [files.service.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/api-gateway/src/files/files.service.ts)

Dành cho các endpoint lấy danh sách file, đổi tên hoặc xóa, Gateway dùng client `FILES_CLIENT` để liên hệ qua cổng TCP port 3004 của File Service:

```typescript
@Injectable()
export class FilesService {
    constructor(
        @Inject('FILES_CLIENT') private readonly filesClient: ClientProxy,
    ) { }

    listFiles(uploaderId: number, page: number, size: number): Observable<any> {
        return this.filesClient
            .send('list_files', { uploaderId, page, size })
            .pipe(catchError((err) => throwError(() => err)));
    }

    deleteFile(fileId: string, uploaderId: number): Observable<any> {
        return this.filesClient
            .send('delete_file', { fileId, uploaderId })
            .pipe(catchError((err) => throwError(() => err)));
    }
}
```

---

## 6. Tích hợp phía Frontend (Next.js)

### 6.1. Xử lý logic 3 bước Upload ở Client: [page.tsx](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/app/dashboard/files/page.tsx)

Client sử dụng Axios để thực hiện PUT tệp tin trực tiếp lên máy chủ lưu trữ MinIO thông qua Presigned URL nhận được:

```typescript
const processUpload = async (file: File) => {
  const queueId = Math.random().toString(36).substr(2, 9);
  const newQueueItem = {
    id: queueId,
    name: file.name,
    size: file.size,
    progress: 0,
    status: "initializing"
  };

  // 1. Thêm tệp vào danh sách hiển thị tiến trình tải lên
  setUploadQueue(prev => [newQueueItem, ...prev]);

  try {
    // BƯỚC 1: Gọi API khởi tạo để lấy Presigned URL từ backend
    const initRes = await filesApi.initializeUpload({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "audio/mpeg"
    });
    const { fileId, presignedUrl } = initRes;

    setUploadQueue(prev =>
      prev.map(item => (item.id === queueId ? { ...item, status: "uploading" } : item))
    );

    // BƯỚC 2: Gửi trực tiếp Body Binary thô lên MinIO (Sử dụng port 9100 công khai)
    await axios.put(presignedUrl, file, {
      headers: {
        "Content-Type": file.type || "audio/mpeg"
      },
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total || file.size;
        const percent = Math.round((progressEvent.loaded * 100) / total);
        
        // Cập nhật phần trăm tiến trình tải
        setUploadQueue(prev =>
          prev.map(item => (item.id === queueId ? { ...item, progress: percent } : item))
        );
      }
    });

    setUploadQueue(prev =>
      prev.map(item => (item.id === queueId ? { ...item, status: "completing", progress: 100 } : item))
    );

    // BƯỚC 3: Báo cho backend biết dữ liệu đã lên MinIO thành công để hoàn tất
    await filesApi.completeUpload(fileId);

    // Xóa khỏi hàng chờ upload và tải lại danh sách file
    setUploadQueue(prev => prev.filter(item => item.id !== queueId));
    loadFiles();
  } catch (error) {
    console.error("Lỗi tải tệp lên:", error);
    setUploadQueue(prev =>
      prev.map(item => (item.id === queueId ? { ...item, status: "failed" } : item))
    );
  }
};
```

### 6.2. Phát nhạc với cơ chế Stream: [page.tsx](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/app/dashboard/files/page.tsx)

Sử dụng thẻ `<audio>` ẩn của HTML5 để nhận luồng âm thanh từ Gateway, kết nối với thanh tua thời lượng và nút điều khiển:

```typescript
<audio
  ref={audioRef}
  src={`/api/files/stream/${playingFile.id}`} // Đường dẫn qua proxy của gateway
  onTimeUpdate={handleTimeUpdate}
  onLoadedMetadata={handleLoadedMetadata}
  onEnded={handleAudioEnded}
  style={{ display: "none" }}
/>
```

---

## 7. Khởi chạy và Kiểm thử

### 7.1. Chạy hệ thống qua Docker Compose
1. Chạy tất cả các container hạ tầng và microservice ở chế độ chạy ngầm (detached):
   ```bash
   docker compose up -d
   ```
2. Nếu có sự thay đổi mã nguồn, thực hiện build lại riêng File Service:
   ```bash
   docker compose up --build -d file-service
   ```

### 7.2. Kiểm thử API bằng PowerShell
Bạn có thể sử dụng các lệnh PowerShell dưới đây để kiểm tra nhanh tính hoạt động ổn định của luồng Upload:

1. **Khởi tạo Upload (Bước 1)**:
   ```powershell
   $body = '{"fileName":"test_audio.mp3","fileSize":1000,"mimeType":"audio/mpeg"}'
   $initResp = Invoke-RestMethod -Uri "http://localhost:3000/api/files/upload/init" `
                                -Method POST `
                                -Headers @{"Content-Type"="application/json"; "Authorization"="Bearer <YOUR_JWT_TOKEN>"} `
                                -Body $body
   $initResp.result
   ```
   *Nhận về thông tin `fileId` và `presignedUrl` chứa cổng `9100`.*

2. **PUT dữ liệu lên MinIO (Bước 2)**:
   ```powershell
   $putUrl = $initResp.result.presignedUrl
   $uploadText = "Fake binary audio track content"
   $bytes = [System.Text.Encoding]::UTF8.GetBytes($uploadText)
   
   $webClient = New-Object System.Net.WebClient
   $webClient.Headers.Add("Content-Type", "audio/mpeg")
   $webClient.UploadData($putUrl, "PUT", $bytes)
   ```
   *Phản hồi rỗng với HTTP Status Code `200` thể hiện dữ liệu đã lên MinIO thành công.*

3. **Xác nhận hoàn tất (Bước 3)**:
   ```powershell
   $fileId = $initResp.result.fileId
   $completeResp = Invoke-RestMethod -Uri "http://localhost:3000/api/files/upload/complete/$fileId" `
                                    -Method POST `
                                    -Headers @{"Authorization"="Bearer <YOUR_JWT_TOKEN>"}
   $completeResp.result
   ```
   *Bản ghi trả về sẽ có trạng thái `status: "READY"` và thời lượng tệp tin âm thanh đã được phân tích.*
