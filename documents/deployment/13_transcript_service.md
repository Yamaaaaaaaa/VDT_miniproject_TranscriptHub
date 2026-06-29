# Hướng dẫn Phát triển và Triển khai Transcript Service từ A đến Z

Tài liệu này cung cấp hướng dẫn chi tiết về cấu trúc kiến trúc, cách thức thiết lập hạ tầng, giải thích cặn kẽ mã nguồn và các bước tích hợp hệ thống dịch thuật âm thanh tự động (**Transcript Service**) sử dụng NestJS, Google Gemini AI (AI API), Prisma, Apache Kafka và PostgreSQL trong hệ sinh thái TranscriptHub.

---

## 1. Tổng quan Kiến trúc Transcript Service

Transcript Service được thiết kế như một Microservice độc lập chạy trong môi trường monorepo của NestJS. Dịch vụ này xử lý các tiến trình dịch thuật âm thanh bằng trí tuệ nhân tạo (AI) qua hai phương thức giao tiếp chính:

```
                                 ┌──────────────────────────────────────┐
                                 │            Next.js Client            │
                                 └──────────────────┬───────────────────┘
                                                    │
                                        HTTP REST   │ (Xem bản dịch / Dịch thủ công)
                                                    ▼
                                 ┌──────────────────────────────────────┐
                                 │             API Gateway              │
                                 └──────────┬─────────────────┬─────────┘
                                            │                 │
                                            │                 │ TCP RPC (3005)
                                            │                 ▼
                                            │    ┌──────────────────────────┐
                                            │    │    Transcript Service    │◄──────────┐
                                            │    └─────┬──────┬─────────┬───┘           │
                                            │          │      │         │               │
                                            │          │      │         │               │ Consume Event
                                            │          │      │         │ SQL Query     │ (audio-file-events)
                                            │          │      │         ▼               │
                                            │          │      │   ┌───────────┐   ┌─────┴──────┐
                      HTTP Stream (3003)    │          │      │   │ Prisma DB │   │ Kafka      │
                  (Tải luồng bytes file)    │          │      │   └───────────┘   │ Broker     │
                                            ▼          │      │                   └─────▲──────┘
                                     ┌──────────────┐  │      │                         │
                                     │ File Service ├──┼──────┼─────────────────────────┘
                                     └──────────────┘  │      │
                                                       │      │ HTTPS
                                                       │      ▼
                                                       │   ┌───────────────┐
                                                       │   │  Gemini API   │
                                                       │   │ (Base64 Audio)│
                                                       │   └───────────────┘
                                                       ▼
                                                 TCP RPC (3004)
                                            (Kiểm tra file tồn tại /
                                             Truy xuất file metadata)
```

1. **TCP Microservice (Port 3005)**:
   - Tiếp nhận các yêu cầu truy vấn thông tin bản dịch từ API Gateway.
   - Tiếp nhận lệnh kích hoạt tiến trình tạo bản dịch thủ công cho một tệp tin xác định.
   - Thao tác xóa bản dịch khỏi cơ sở dữ liệu.
2. **Kafka Event Consumer (Nhóm tiêu thụ: `transcript-group`)**:
   - Lắng nghe các sự kiện xảy ra trên hệ thống thông qua topic `audio-file-events`.
   - Khi nhận được sự kiện `AUDIO_FILE_UPLOADED` từ File Service phát ra, Transcript Service tự động kích hoạt tiến trình dịch thuật nền (background transcription) mà không cần người dùng yêu cầu trực tiếp trên UI.

---

## 2. Thiết lập Hạ tầng (Infrastructure Setup)

### 2.1. Cấu hình Docker Compose cho Kafka & Transcript Service

Hạ tầng của hệ thống bao gồm Zookeeper và Apache Kafka làm Message Broker, cùng với container PostgreSQL đóng vai trò lưu trữ cơ sở dữ liệu. Cấu hình được đặt trong file [docker-compose.yml](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/docker-compose.yml):

```yaml
  # Zookeeper cho Kafka Coordination
  zookeeper:
    image: confluentinc/cp-zookeeper:7.4.0
    container_name: transcripthub-zookeeper
    ports:
      - "2181:2181"
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    networks:
      - transcripthub_net

  # Apache Kafka Message Broker
  kafka:
    image: confluentinc/cp-kafka:7.4.0
    container_name: transcripthub-kafka
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092,PLAINTEXT_HOST://localhost:29092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    depends_on:
      - zookeeper
    networks:
      - transcripthub_net

  # Transcript Microservice (TCP :3005)
  transcript-service:
    build:
      context: ./services_ms
      dockerfile: apps/transcript/Dockerfile
      target: production
    container_name: transcripthub-transcript-service
    restart: always
    env_file:
      - ./services_ms/.env
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/transcripthub
      TRANSCRIPT_SERVICE_TCP_PORT: 3005
      FILE_SERVICE_HOST: file-service
      FILE_SERVICE_PORT: 3003
      FILE_SERVICE_TCP_PORT: 3004
      KAFKA_BOOTSTRAP_SERVERS: kafka:9092
    ports:
      - "3005:3005"
    depends_on:
      postgres:
        condition: service_healthy
      kafka:
        condition: service_started
      file-service:
        condition: service_started
    networks:
      - transcripthub_net
```

### 2.2. Các biến môi trường liên quan (Environment Variables)

Các biến môi trường phục vụ cấu hình Transcript Service nằm trong file `services_ms/.env`:

* **`DATABASE_URL`**: Chuỗi kết nối đến cơ sở dữ liệu PostgreSQL.
* **`TRANSCRIPT_SERVICE_TCP_PORT`**: Cổng lắng nghe giao thức TCP nội bộ (mặc định: `3005`).
* **`FILE_SERVICE_HOST` / `FILE_SERVICE_PORT` / `FILE_SERVICE_TCP_PORT`**: Địa chỉ và cổng (HTTP: `3003`, TCP: `3004`) của File Service để Transcript Service kết nối lấy dữ liệu âm thanh.
* **`KAFKA_BOOTSTRAP_SERVERS`**: Danh sách máy chủ Kafka Broker (mạng nội bộ Docker: `kafka:9092`).
* **`GEMINI_API_KEY`**: Khóa API Google Gemini AI để thực hiện cuộc gọi nhận diện giọng nói.
* **`GEMINI_MODEL`**: Model trí tuệ nhân tạo được sử dụng (mặc định khuyến nghị: `gemini-2.5-flash` nhờ ưu thế về tốc độ xử lý âm thanh và chi phí tối ưu).

---

## 3. Cấu trúc Database Schema

Bản dịch âm thanh được lưu trữ trong cơ sở dữ liệu PostgreSQL dưới schema `transcripts` nhằm cách ly dữ liệu giữa các phân hệ microservices. Định nghĩa Prisma trong file [schema.prisma](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/prisma/schema.prisma):

```prisma
// Transcript model (do Transcript Service quản lý độc quyền)
model Transcript {
  id                Int      @id @default(autoincrement())
  audioFileId       String   @unique @map("audio_file_id") @db.Uuid
  rawText           String   @map("raw_text") @db.Text
  structuredContent Json     @map("structured_content") @db.JsonB
  status            String   @db.VarChar(50) // "PROCESSING", "COMPLETED", "FAILED"
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  @@map("transcripts")
  @@schema("transcripts")
}
```

* **`audioFileId`**: Trường liên kết 1-1 dạng UUID với tệp tin âm thanh tương ứng bên File Service.
* **`rawText`**: Chứa toàn bộ văn bản thô của bản dịch sau khi nối các phân đoạn lại với nhau.
* **`structuredContent`**: Trường kiểu `JsonB` trong Postgres, lưu trữ mảng đối tượng phân đoạn có cấu trúc (`segments`), mỗi phân đoạn bao gồm: `id`, `startTime` (giây), `endTime` (giây), `speaker` (nhãn người nói) và `text` (nội dung văn bản phân đoạn đó).
* **`status`**: Trạng thái tiến trình gồm: `PROCESSING` (đang xử lý), `COMPLETED` (đã hoàn thành), `FAILED` (thất bại).

---

## 4. Chi tiết Mã nguồn Transcript Service

Cấu trúc thư mục nguồn của Transcript Service đặt tại: `services_ms/apps/transcript/src/`

### 4.1. Khởi chạy Ứng dụng Lai đa giao thức: [main.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/transcript/src/main.ts)

File `main.ts` cấu hình đồng thời lắng nghe TCP RPC (để nhận yêu cầu đồng bộ từ API Gateway) và đăng ký tiêu thụ sự kiện từ Kafka Broker:

```typescript
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { TranscriptModule } from './transcript.module';

async function bootstrap() {
    // 1. Tạo ngữ cảnh ứng dụng NestJS
    const app = await NestFactory.create(TranscriptModule);

    // 2. Kết nối Microservice TCP (để Gateway gọi RPC)
    const tcpPort = parseInt(process.env.TRANSCRIPT_SERVICE_TCP_PORT || '3005', 10);
    app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.TCP,
        options: {
            host: '0.0.0.0', // Lắng nghe từ mọi card mạng trong container
            port: tcpPort,
        },
    });

    // 3. Kết nối Microservice Kafka Broker (nhận sự kiện bất đồng bộ)
    const kafkaBrokers = (process.env.KAFKA_BOOTSTRAP_SERVERS || 'kafka:9092').split(',');
    app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.KAFKA,
        options: {
            client: {
                clientId: 'transcript-service',
                brokers: kafkaBrokers,
            },
            consumer: {
                groupId: 'transcript-group', // Group ID để gom cụm xử lý sự kiện
                allowAutoTopicCreation: true,
            },
        },
    });

    // 4. Kích hoạt toàn bộ các Microservices kết nối
    await app.startAllMicroservices();
    console.log(`🚀 Transcript TCP listener is active on port: ${tcpPort}`);
    console.log(`🚀 Transcript Kafka consumer is connected to: ${kafkaBrokers.join(', ')}`);
}
bootstrap();
```

### 4.2. Khai báo dependencies Module: [transcript.module.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/transcript/src/transcript.module.ts)

Module đăng ký kết nối TCP Client với File Service để phục vụ kiểm tra thông tin tệp tin:

```typescript
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TranscriptController } from './transcript.controller';
import { TranscriptService } from './transcript.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
    imports: [
        PrismaModule,
        ClientsModule.register([
            {
                name: 'FILES_CLIENT',
                transport: Transport.TCP,
                options: {
                    host: process.env.FILE_SERVICE_HOST || 'localhost',
                    port: parseInt(process.env.FILE_SERVICE_TCP_PORT || '3004', 10),
                },
            },
        ]),
    ],
    controllers: [TranscriptController],
    providers: [TranscriptService],
})
export class TranscriptModule { }
```

### 4.3. Bộ điều phối Tin nhắn & Sự kiện: [transcript.controller.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/transcript/src/transcript.controller.ts)

Controller xử lý cả yêu cầu đồng bộ TCP RPC gửi đến từ Gateway và lắng nghe sự kiện bất đồng bộ qua Kafka:

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload, RpcException } from '@nestjs/microservices';
import { TranscriptService } from './transcript.service';

@Controller()
export class TranscriptController {
    constructor(private readonly transcriptService: TranscriptService) { }

    @MessagePattern('get_transcript_by_audio_file')
    async getTranscriptByAudioFile(@Payload() audioFileId: string) {
        try {
            return await this.transcriptService.getTranscriptByAudioFileId(audioFileId);
        } catch (error) {
            throw new RpcException(error.message);
        }
    }

    @MessagePattern('get_all_transcripts')
    async getAllTranscripts() {
        try {
            return await this.transcriptService.getAllTranscripts();
        } catch (error) {
            throw new RpcException(error.message);
        }
    }

    @MessagePattern('generate_transcript_manual')
    async generateTranscriptManual(@Payload() fileId: string) {
        try {
            return await this.transcriptService.generateTranscriptManually(fileId);
        } catch (error) {
            throw new RpcException(error.message);
        }
    }

    @MessagePattern('delete_transcript')
    async deleteTranscript(@Payload() id: number) {
        try {
            return await this.transcriptService.deleteTranscript(id);
        } catch (error) {
            throw new RpcException(error.message);
        }
    }

    // Lắng nghe sự kiện tệp âm thanh tải lên thành công từ Kafka
    @EventPattern('audio-file-events')
    async handleAudioFileEvents(@Payload() data: any) {
        console.log(`Received Kafka event on audio-file-events topic:`, JSON.stringify(data));
        
        let eventPayload = data;
        if (typeof data === 'string') {
            try {
                eventPayload = JSON.parse(data);
            } catch (e) {
                console.error('Failed to parse Kafka event payload string:', e);
            }
        }

        // Tương thích với bọc gói tin từ Kafka của NestJS
        let payload = eventPayload?.payload;
        if (!payload && eventPayload?.value) {
            let val = eventPayload.value;
            if (typeof val === 'string') {
                try {
                    val = JSON.parse(val);
                } catch (e) {}
            }
            payload = val?.payload;
        }

        const fileId = payload?.fileId;
        if (fileId) {
            console.log(`Triggering automatic async transcript generation for fileId: ${fileId}`);
            // Kích hoạt dịch thuật tự động không chặn luồng
            await this.transcriptService.generateTranscriptAsync(fileId);
        } else {
            console.warn(`Could not extract fileId from Kafka event.`);
        }
    }
}
```

### 4.4. Logic nghiệp vụ cốt lõi: [transcript.service.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/transcript/src/transcript.service.ts)

Chứa toàn bộ logic tải file âm thanh, giao tiếp AI API và cập nhật trạng thái bản dịch ngầm.

#### 4.4.1. Khởi tạo & Kích hoạt Luồng ngầm phi chặn (setImmediate)

Khi nhận sự kiện dịch thuật, hệ thống khởi tạo bản ghi trong Postgres với trạng thái `PROCESSING`, trả về phản hồi lập tức và tách tiến trình dịch nặng nề sang chạy nền để tránh nghẽn luồng RPC:

```typescript
async generateTranscriptAsync(fileId: string) {
    let transcript = await this.prisma.transcript.findUnique({
        where: { audioFileId: fileId },
    });

    if (!transcript) {
        transcript = await this.prisma.transcript.create({
            data: {
                audioFileId: fileId,
                status: 'PROCESSING',
                rawText: '',
                structuredContent: { segments: [] },
            },
        });
        // Gọi lập lịch phi chặn setImmediate
        this.triggerBackgroundTranscription(fileId, transcript.id);
    } else if (transcript.status === 'FAILED') {
        transcript = await this.prisma.transcript.update({
            where: { id: transcript.id },
            data: { status: 'PROCESSING' },
        });
        this.triggerBackgroundTranscription(fileId, transcript.id);
    }
}

private triggerBackgroundTranscription(fileId: string, transcriptId: number) {
    setImmediate(async () => {
        console.log(`Background thread started transcription for fileId: ${fileId}`);
        try {
            const result = await this.transcribe(fileId);
            await this.updateTranscriptStatus(transcriptId, 'COMPLETED', result.rawText, { segments: result.segments });
        } catch (err) {
            console.error(`Failed to transcribe fileId: ${fileId}`, err);
            await this.updateTranscriptStatus(transcriptId, 'FAILED', '', { segments: [] });
        }
    });
}
```

#### 4.4.2. Tải luồng file nhị phân & Mã hóa Base64

Do Gemini API hỗ trợ truyền file âm thanh trực tiếp qua payload Base64, Transcript Service tải file nhị phân trực tiếp thông qua API Stream của File Service (Port `3003`) rồi convert sang Base64:

```typescript
// Lấy mimeType từ file metadata thông qua TCP RPC gửi sang File Service
let mimeType = 'audio/mp3';
try {
    const fileMetadata = await lastValueFrom(
        this.fileClient.send('get_file_metadata', fileId)
    );
    if (fileMetadata && fileMetadata.mimeType) {
        mimeType = fileMetadata.mimeType;
    }
} catch (error) {
    console.warn(`Could not retrieve file metadata from file-service. Using fallback.`, error);
}

// Gọi REST API HTTP Stream từ File Service
const fileServiceHost = process.env.FILE_SERVICE_HOST || 'localhost';
const fileServicePort = process.env.FILE_SERVICE_PORT || '3003';
const fileUrl = `http://${fileServiceHost}:${fileServicePort}/api/v1/files/stream/${fileId}`;

const downloadResponse = await fetch(fileUrl);
if (!downloadResponse.ok) {
    throw new Error(`Failed to download file from file-service. Status: ${downloadResponse.status}`);
}

const arrayBuffer = await downloadResponse.arrayBuffer();
const fileBytes = Buffer.from(arrayBuffer);
const base64Audio = fileBytes.toString('base64');
```

#### 4.4.3. Gọi Google Gemini AI API với System Prompt Cấu trúc

Chúng ta định nghĩa một prompt chi tiết yêu cầu mô hình AI phân chia đoạn ghi âm, gán nhãn người nói và định dạng chính xác JSON kết quả. Sử dụng tính năng `responseMimeType: 'application/json'` của Gemini để ép định dạng trả về:

```typescript
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
1. Split the transcription into logical segments based on speaker turns or natural pauses. Each segment must have startTime, endTime (in seconds), a speaker label (e.g. Speaker 1, Speaker 2), and the text.
2. Transcribe in the original language spoken in the audio.
3. Return ONLY valid JSON. Do not include markdown code block formatting (like \`\`\`json).
4. CRITICAL: Make sure all string values (especially the "text" fields and "rawText") are properly escaped for JSON. Do not include unescaped double quotes; use \\\" instead. Do not include literal newlines inside strings; use \\n instead.`;

const payload = {
    contents: [
        {
            parts: [
                { text: systemPrompt },
                {
                    inlineData: {
                        mimeType,
                        data: base64Audio,
                    },
                },
            ],
        },
    ],
    generationConfig: {
        responseMimeType: 'application/json',
    },
};

const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
});

const resJson: any = await response.json();
const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
```

---

## 5. Tích hợp phía API Gateway

API Gateway là cổng bảo mật tiếp nhận yêu cầu REST của client, thực hiện giải mã JWT, đính kèm `x-user-id` và định tuyến qua TCP Client kết nối đến Transcript Service:

### 5.1. File cấu hình Module: [transcripts.module.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/api-gateway/src/transcripts/transcripts.module.ts)
```typescript
@Module({
    imports: [
        IdentityModule,
        ClientsModule.register([
            {
                name: 'TRANSCRIPT_CLIENT',
                transport: Transport.TCP,
                options: {
                    host: process.env.TRANSCRIPT_SERVICE_HOST ?? 'localhost',
                    port: parseInt(process.env.TRANSCRIPT_SERVICE_TCP_PORT ?? '3005', 10),
                },
            },
        ]),
    ],
    controllers: [TranscriptsController],
    providers: [TranscriptsService],
    exports: [TranscriptsService],
})
export class TranscriptsModule { }
```

### 5.2. Chuyển tiếp tin nhắn RPC ở Gateway Service: [transcripts.service.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/api-gateway/src/transcripts/transcripts.service.ts)
```typescript
@Injectable()
export class TranscriptsService {
    constructor(
        @Inject('TRANSCRIPT_CLIENT') private readonly transcriptClient: ClientProxy,
    ) { }

    getTranscriptByAudioFile(audioFileId: string): Observable<any> {
        return this.transcriptClient.send('get_transcript_by_audio_file', audioFileId);
    }

    getAllTranscripts(): Observable<any> {
        return this.transcriptClient.send('get_all_transcripts', {});
    }

    generateTranscriptManual(fileId: string): Observable<any> {
        return this.transcriptClient.send('generate_transcript_manual', fileId);
    }

    deleteTranscript(id: number): Observable<any> {
        return this.transcriptClient.send('delete_transcript', id);
    }
}
```

---

## 6. Tích hợp phía Frontend (Next.js)

### 6.1. Định nghĩa API client: [lib/api.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/lib/api.ts)

Client Next.js thực hiện các cuộc gọi REST API thông qua instance Axios đã được đính kèm token:

```typescript
export const transcriptsApi = {
    getAll: () => api.get("/transcripts").then((res) => res.data.result ?? res.data),
    getByAudioFile: (audioFileId: string) => api.get(`/transcripts/file/${audioFileId}`).then((res) => res.data.result ?? res.data),
    generate: (fileId: string) => api.post("/transcripts/generate", { fileId }).then((res) => res.data.result ?? res.data),
    delete: (id: number) => api.delete(`/transcripts/${id}`).then((res) => res.data.result ?? res.data),
};
```

### 6.2. Cơ chế Polling theo dõi trạng thái dịch thuật: [page.tsx](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/app/(dashboard)/transcripts/page.tsx)

Bởi vì tiến trình dịch thuật nền chạy bất đồng bộ, tại giao diện danh sách bản dịch, nếu phát hiện có bản ghi nào ở trạng thái `PROCESSING`, Client sẽ tự động kích hoạt cơ chế Polling (gửi request lấy dữ liệu sau mỗi 3 giây) cho đến khi trạng thái chuyển sang `COMPLETED` hoặc `FAILED`:

```typescript
useEffect(() => {
  const hasProcessing = transcripts.some((t) => t.status === "PROCESSING");
  if (!hasProcessing) return;

  const interval = setInterval(async () => {
    try {
      const transcriptsData = await transcriptsApi.getAll();
      setTranscripts(transcriptsData || []);
    } catch (error) {
      console.error("Lỗi cập nhật trạng thái bản dịch:", error);
    }
  }, 3000); // Polling mỗi 3 giây

  return () => clearInterval(interval);
}, [transcripts]);
```

### 6.3. Trình phát Audio đồng bộ Timeline bản dịch: [page.tsx](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/app/(dashboard)/transcripts/[fileId]/page.tsx)

Tại trang chi tiết bản dịch, các đoạn văn bản (`segments`) được hiển thị kèm theo mốc thời gian bắt đầu. Khi người dùng click vào một segment, trình phát âm thanh sẽ tự động tua tới giây tương ứng. Đồng thời, khi âm thanh đang phát, phân đoạn hiện tại sẽ được highlight nhờ việc so khớp thời gian phát thực tế (`currentTime` của thẻ audio) với khoảng `[startTime, endTime]` của segment:

```typescript
// Tua nhạc khi bấm vào dòng chữ
const handleSegmentClick = (startTime: number) => {
  if (audioRef.current) {
    audioRef.current.currentTime = startTime;
    audioRef.current.play();
  }
};

// Highlight phân đoạn đang phát
const activeSegmentId = segments.find(
  (seg) => currentTime >= seg.startTime && currentTime <= seg.endTime
)?.id;
```

---

## 7. Khởi chạy và Kiểm thử

### 7.1. Chạy microservice qua Docker Compose
1. Khởi chạy toàn bộ hệ thống gồm hạ tầng Zookeeper, Kafka, Postgres, Redis, MinIO và tất cả các microservices:
   ```bash
   docker compose up -d
   ```
2. Trong quá trình phát triển, để kiểm tra log chi tiết từ riêng Transcript Service:
   ```bash
   docker compose logs -f transcript-service
   ```
3. Khởi dựng lại nếu có sự thay đổi mã nguồn backend:
   ```bash
   docker compose up --build -d transcript-service
   ```

### 7.2. Kiểm thử API bằng PowerShell

Bạn có thể chạy các lệnh PowerShell bên dưới ở máy vật lý để kiểm nghiệm hoạt động của các API dịch thuật:

1. **Yêu cầu dịch thủ công một file đã upload**:
   ```powershell
   $body = '{"fileId":"8b51d8b9-4781-4252-944a-d68a2d12e698"}'
   $resp = Invoke-RestMethod -Uri "http://localhost:3000/api/transcripts/generate" `
                            -Method POST `
                            -Headers @{"Content-Type"="application/json"; "Authorization"="Bearer <YOUR_JWT_TOKEN>"} `
                            -Body $body
   $resp
   ```
   *Bản ghi trả về sẽ có trạng thái `status: "PROCESSING"` và các trường nội dung rỗng.*

2. **Lấy trạng thái bản dịch của file**:
   ```powershell
   $fileId = "8b51d8b9-4781-4252-944a-d68a2d12e698"
   $resp = Invoke-RestMethod -Uri "http://localhost:3000/api/transcripts/file/$fileId" `
                            -Method GET `
                            -Headers @{"Authorization"="Bearer <YOUR_JWT_TOKEN>"}
   $resp
   ```
   *Sau khoảng vài chục giây chờ AI xử lý, bản ghi trả về sẽ cập nhật trạng thái `COMPLETED` cùng toàn bộ văn bản và mảng các phân đoạn âm thanh.*
