# Nghiên cứu Triển khai Video Call — TranscriptHub

> **Công nghệ chọn:** LiveKit (SDK/CPaaS — Hướng 1)  
> **Thời gian ra mắt (TTM):** Rất nhanh (1–2 tuần)  
> **Chi phí ban đầu (MVP):** $0 (Free-tier / Self-hosted)

---

## 1. Tổng quan Yêu cầu

| Chức năng | Mô tả |
|---|---|
| **Tạo phòng họp** | HOST bấm "Bắt đầu Video Call" → tạo phòng LiveKit mới cho meeting |
| **Tham gia phòng** | Bất kỳ member nào có quyền đều tham gia qua URL `/room/{meetingId}` trong khi phòng đang active |
| **Record trong cuộc họp** | Có thể bắt đầu/dừng nhiều lần → nhiều `VideoRecording` được lưu trữ |
| **Kết thúc phòng** | HOST bấm "Kết thúc cuộc họp" → xóa phòng LiveKit → `isRoomActive = false` → **không thể vào lại** |
| **Select Record chính** | Sau khi họp xong, HOST chọn 1 trong số các `VideoRecording` (`isSelected = true`) → hệ thống trích âm thanh → tạo AudioFile → trigger transcript |
| **Không có Video Record** | Meeting vẫn có thể hoạt động bình thường — luồng cũ (upload audio file thủ công) không cần VideoRecording |
| **Không ảnh hưởng transcript cũ** | Mỗi lần select sẽ tạo bản ghi mới, **không overwrite** AudioFile cũ |

---

## 2. Công nghệ sử dụng

### 2.1 LiveKit (SFU — Selective Forwarding Unit)

| Thành phần | Vai trò |
|---|---|
| `livekit-server` | WebRTC SFU — điều phối media streams giữa participants |
| `livekit-egress` | Service ghi lại cuộc họp, export ra file (MP4) lưu vào MinIO |
| `livekit-server-sdk` (Node.js) | Backend SDK — tạo token, quản lý room, điều khiển Egress |
| `@livekit/components-react` | Frontend — UI components sẵn có cho Next.js |
| `livekit-client` | Frontend — SDK kết nối WebRTC trực tiếp |

### 2.2 Stack tích hợp

```
Next.js (FE)
    │── @livekit/components-react  → Video UI (camera, mic, layout)
    │── livekit-client             → Kết nối room WebRTC
    │
    ▼ API calls
NestJS API Gateway
    │── /meetings/:id/videocall/join    → Lấy LiveKit token tham gia
    │── /meetings/:id/recordings        → Start/Stop/List recordings
    │── /meetings/:id/recordings/:id/select → Chọn record chính
    │
    ▼ TCP (Microservice)
Video-Call Service (NestJS) [MỚI]
    │── livekit-server-sdk         → Tương tác LiveKit Server
    │── Prisma (meetings schema)   → Lưu VideoRecording (gắn vào Meeting)
    │── Kafka Producer             → Gửi event sang Transcript Service
    │
LiveKit Server ←→ LiveKit Egress → MinIO (video/*.mp4)
                                        │
                                    (select action)
                                        ▼
                               ffmpeg: extract audio
                                        ▼
                               File Service → AudioFile
                                        ▼
                               Transcript Service → Transcript
```

---

## 3. Kiến trúc Database (Prisma Schema)

Tích hợp vào schema `meetings` hiện có:
- **`Meeting`** (modify): thêm các field LiveKit để enable video call
- **`VideoRecording`** (model mới): nhiều bản ghi trong 1 meeting, có `isSelected`

> **Nguyên tắc:**
> - `VideoRoom` **không tồn tại** — Meeting chính là phòng video.
> - Phòng LiveKit là **session-based**: HOST tạo → mọi người vào → HOST kết thúc → phòng xóa hẳn, **không vào lại được**.
> - Một Meeting có thể có 0 recordings (luồng cũ: upload audio thủ công) hoặc nhiều recordings.

```prisma
// Modify existing Meeting model — thêm LiveKit fields
model Meeting {
  // ... existing fields ...

  // Video Call fields (nullable — không phải meeting nào cũng dùng video call)
  livekitRoomName   String?  @map("livekit_room_name")          // tên phòng LiveKit (null = chưa/đã kết thúc)
  isRoomActive      Boolean  @default(false) @map("is_room_active") // phòng đang mở hay không
  roomStartedAt     DateTime? @map("room_started_at")           // thời điểm HOST bắt đầu phòng
  roomEndedAt       DateTime? @map("room_ended_at")             // thời điểm phòng kết thúc

  // ... existing relations ...
  recordings        VideoRecording[]

  @@map("meetings")
  @@schema("meetings")
}

// Video Recording — nhiều bản ghi trong 1 meeting
model VideoRecording {
  id            String          @id @default(uuid()) @db.Uuid
  meetingId     String          @map("meeting_id") @db.Uuid     // gắn thẳng vào Meeting
  egressId      String          @unique @map("egress_id")       // LiveKit Egress ID
  objectKey     String          @map("object_key")              // MinIO path: recordings/{meetingId}/{id}.mp4
  bucketName    String          @map("bucket_name")
  durationSec   Int?            @map("duration_sec")
  status        RecordingStatus @default(RECORDING)
  isSelected    Boolean         @default(false) @map("is_selected") // bản chính của meeting này
  audioFileId   String?         @unique @map("audio_file_id") @db.Uuid
  recordedAt    DateTime        @default(now()) @map("recorded_at")
  endedAt       DateTime?       @map("ended_at")

  meeting       Meeting         @relation(fields: [meetingId], references: [id], onDelete: Cascade)

  @@map("video_recordings")
  @@schema("meetings")
  @@index([meetingId])
}

enum RecordingStatus {
  RECORDING    // đang ghi
  PROCESSING   // egress đang xử lý / upload
  READY        // file đã sẵn sàng trên MinIO
  EXTRACTING   // đang extract audio
  COMPLETED    // đã có AudioFile + Transcript triggered
  FAILED

  @@schema("meetings")
}
```

> **Quan trọng:**
> - `livekitRoomName` là `null` khi chưa bắt đầu hoặc đã kết thúc phòng (không dùng `@unique` — phòng cũ đã xóa, tên đó có thể dùng lại).
> - `isRoomActive = false` sau khi HOST end meeting → FE hiển thị "Phòng đã kết thúc".
> - `isSelected = true` chỉ có **1 bản** trong mỗi `meetingId`.
> - Khi chọn bản mới, unset bản cũ nhưng **không xóa AudioFile cũ**.
> - `audioFileId` link tới `AudioFile` (schema `files`) — mỗi select tạo AudioFile mới.
> - Meeting không có VideoRecording nào → vẫn hoạt động bình thường (luồng cũ).

---

## 4. Backend — Video-Call Service (NestJS)

### 4.1 Package cần cài

```bash
# Trong services_ms
npm install livekit-server-sdk
npm install fluent-ffmpeg @types/fluent-ffmpeg
npm install minio   # nếu chưa có
```

### 4.2 Biến môi trường bổ sung (`.env`)

```env
# -------------------- LiveKit --------------------
LIVEKIT_URL=ws://livekit-server:7880        # internal docker
LIVEKIT_PUBLIC_URL=ws://localhost:7880       # FE kết nối (hoặc wss://domain.com)
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret                   # PHẢI giữ bí mật, không expose FE

# -------------------- Video-Call Service --------------------
VIDEOCALL_SERVICE_TCP_PORT=3010
VIDEOCALL_SERVICE_HOST=videocall-service
```

### 4.3 Room Service (VideoRoomService)

```typescript
// videocall.service.ts
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

@Injectable()
export class VideocallService {
  private roomService: RoomServiceClient;

  constructor(private readonly config: ConfigService) {
    this.roomService = new RoomServiceClient(
      config.get('LIVEKIT_URL'),
      config.get('LIVEKIT_API_KEY'),
      config.get('LIVEKIT_API_SECRET'),
    );
  }

  // 1. HOST bắt đầu phòng họp (chỉ HOST mới được gọi)
  async startRoom(meetingId: string, hostId: number) {
    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting) throw new AppException(ErrorCodes.MEETING_NOT_FOUND);

    // Không cho tạo lại nếu phòng đang active
    if (meeting.isRoomActive) {
      throw new AppException(ErrorCodes.ROOM_ALREADY_ACTIVE);
    }

    const roomName = `transcripthub-${meetingId}-${Date.now()}`; // unique per session

    // Tạo phòng trên LiveKit Server
    await this.roomService.createRoom({
      name: roomName,
      emptyTimeout: 300,       // fallback: tự xóa sau 5 phút nếu trống (safety net)
      maxParticipants: 50,
    });

    // Cập nhật Meeting
    await this.meetingRepo.update(meetingId, {
      livekitRoomName: roomName,
      isRoomActive: true,
      roomStartedAt: new Date(),
      roomEndedAt: null,
    });

    return this.meetingRepo.findById(meetingId);
  }

  // 2. HOST kết thúc phòng họp
  async endRoom(meetingId: string, hostId: number) {
    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting?.isRoomActive || !meeting.livekitRoomName) {
      throw new AppException(ErrorCodes.ROOM_NOT_ACTIVE);
    }

    // Xóa phòng khỏi LiveKit → tất cả participant bị kick, egress dừng
    await this.roomService.deleteRoom(meeting.livekitRoomName);

    // Cập nhật Meeting — phòng đã kết thúc
    await this.meetingRepo.update(meetingId, {
      isRoomActive: false,
      livekitRoomName: null,   // clear — phòng không còn tồn tại
      roomEndedAt: new Date(),
    });
  }

  // 3. Tạo Access Token để tham gia phòng (member join)
  async generateToken(meetingId: string, userId: number, userName: string, role: MeetingRole) {
    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting) throw new AppException(ErrorCodes.MEETING_NOT_FOUND);

    // Chỉ join được khi phòng đang active
    if (!meeting.isRoomActive || !meeting.livekitRoomName) {
      throw new AppException(ErrorCodes.ROOM_NOT_ACTIVE); // FE hiện "Phòng chưa bắt đầu hoặc đã kết thúc"
    }

    const at = new AccessToken(
      this.config.get('LIVEKIT_API_KEY'),
      this.config.get('LIVEKIT_API_SECRET'),
      {
        identity: `user-${userId}`,
        name: userName,
        ttl: '4h',             // token sống 4h — đủ cho 1 buổi họp dài
      }
    );

    at.addGrant({
      roomJoin: true,
      room: meeting.livekitRoomName,
      canPublish: role !== MeetingRole.VIEWER,   // VIEWER chỉ xem
      canSubscribe: true,
      canPublishData: true,
      roomRecord: role === MeetingRole.HOST,     // chỉ HOST mới record được
    });

    return {
      token: await at.toJwt(),
      livekitUrl: this.config.get('LIVEKIT_PUBLIC_URL'),
      roomName: meeting.livekitRoomName,
    };
  }

  // 4. Webhook: LiveKit thông báo phòng đã kết thúc (fallback khi emptyTimeout hết)
  async handleRoomFinished(livekitRoomName: string) {
    // Tìm meeting theo roomName (có thể đã null nếu HOST đã end trước)
    const meeting = await this.meetingRepo.findByLivekitRoomName(livekitRoomName);
    if (!meeting || !meeting.isRoomActive) return; // đã xử lý rồi

    await this.meetingRepo.update(meeting.id, {
      isRoomActive: false,
      livekitRoomName: null,
      roomEndedAt: new Date(),
    });
  }
}
```

### 4.4 Recording Service

```typescript
// recording.service.ts
import { EgressClient, EncodedFileType } from 'livekit-server-sdk';

@Injectable()
export class RecordingService {
  private egressClient: EgressClient;

  constructor(private readonly config: ConfigService) {
    this.egressClient = new EgressClient(
      config.get('LIVEKIT_URL'),
      config.get('LIVEKIT_API_KEY'),
      config.get('LIVEKIT_API_SECRET'),
    );
  }

  // 3. Bắt đầu ghi — trả về recordingId
  async startRecording(meetingId: string) {
    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting?.livekitRoomName || !meeting.isRoomActive) {
      throw new AppException(ErrorCodes.ROOM_NOT_ACTIVE);
    }

    const recordingId = uuidv4();
    const objectKey = `recordings/${meetingId}/${recordingId}.mp4`;

    const egress = await this.egressClient.startRoomCompositeEgress(
      meeting.livekitRoomName,
      {
        file: {
          filepath: objectKey,
          fileType: EncodedFileType.MP4,
          s3: {
            accessKey:      this.config.get('MINIO_ACCESS_KEY'),
            secret:         this.config.get('MINIO_SECRET_KEY'),
            bucket:         this.config.get('MINIO_BUCKET'),
            endpoint:       `http://${this.config.get('MINIO_ENDPOINT')}:${this.config.get('MINIO_PORT')}`,
            forcePathStyle: true,   // bắt buộc với MinIO
            region:         'us-east-1',
          },
        },
      },
      { layout: 'speaker-dark' },
    );

    // Lưu VideoRecording — gắn thẳng vào meetingId
    await this.videoRecordingRepo.create({
      id: recordingId,
      meetingId,              // <-- gắn trực tiếp vào Meeting
      egressId: egress.egressId,
      objectKey,
      bucketName: this.config.get('MINIO_BUCKET'),
      status: 'RECORDING',
    });

    return { recordingId, egressId: egress.egressId };
  }

  // 4. Dừng ghi
  async stopRecording(recordingId: string) {
    const recording = await this.videoRecordingRepo.findById(recordingId);
    if (!recording || recording.status !== 'RECORDING') {
      throw new AppException(ErrorCodes.RECORDING_NOT_ACTIVE);
    }

    await this.egressClient.stopEgress(recording.egressId);

    await this.videoRecordingRepo.update(recordingId, {
      status: 'PROCESSING',
      endedAt: new Date(),
    });

    return { message: 'Recording stopping, please wait...' };
  }

  // 5. Webhook LiveKit → cập nhật status khi egress hoàn tất
  async handleEgressCompleted(egressId: string) {
    const recording = await this.videoRecordingRepo.findByEgressId(egressId);
    if (!recording) return;

    await this.videoRecordingRepo.update(recording.id, { status: 'READY' });
  }

  // 6. Select recording làm bản chính của meeting
  async selectRecording(recordingId: string, requesterId: number) {
    const recording = await this.videoRecordingRepo.findById(recordingId);
    if (!recording || recording.status !== 'READY') {
      throw new AppException(ErrorCodes.RECORDING_NOT_READY);
    }

    const member = await this.meetingRepo.findMember(recording.meetingId, requesterId);
    if (!member || member.role !== MeetingRole.HOST) {
      throw new AppException(ErrorCodes.UNAUTHORIZED);
    }

    // Unset bản cũ trong cùng meeting (không xóa AudioFile của bản cũ)
    await this.videoRecordingRepo.clearSelectedInMeeting(recording.meetingId);

    // Set bản mới là bản chính
    await this.videoRecordingRepo.update(recordingId, {
      isSelected: true,
      status: 'EXTRACTING',
    });

    // Trigger extract audio job qua Kafka
    this.kafkaProducer.emit('video_recording_selected', {
      recordingId,
      meetingId: recording.meetingId,  // <-- dùng trực tiếp từ recording
      objectKey: recording.objectKey,
      bucketName: recording.bucketName,
    });

    return { message: 'Recording selected, audio extraction started' };
  }
}
```

### 4.5 Audio Extraction Worker (Kafka Consumer)

```typescript
// audio-extraction.consumer.ts
@EventPattern('video_recording_selected')
async handleRecordingSelected(@Payload() payload: VideoRecordingSelectedEvent) {
  const { recordingId, objectKey, bucketName, meetingId } = payload;

  const tmpVideo = `/tmp/${recordingId}.mp4`;
  const tmpAudio = `/tmp/${recordingId}.mp3`;

  try {
    // 1. Download video từ MinIO
    await this.minioClient.fGetObject(bucketName, objectKey, tmpVideo);

    // 2. Extract audio với ffmpeg (chỉ audio, loại video)
    await new Promise((resolve, reject) => {
      ffmpeg(tmpVideo)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .on('end', resolve)
        .on('error', reject)
        .save(tmpAudio);
    });

    // 3. Upload audio lên MinIO
    const audioKey = `audio/${recordingId}.mp3`;
    const stat = fs.statSync(tmpAudio);
    await this.minioClient.fPutObject(bucketName, audioKey, tmpAudio, {
      'Content-Type': 'audio/mpeg',
    });

    // 4. Tạo AudioFile record (gọi File Service)
    const audioFile = await this.fileGateway.createAudioFileRecord({
      fileName: `meeting-audio-${recordingId}.mp3`,
      bucketName,
      objectKey: audioKey,
      fileSize: stat.size,
      mimeType: 'audio/mpeg',
      uploaderId: /* creator ID */,
    });

    // 5. Update VideoRecording với audioFileId
    await this.videoRecordingRepo.update(recordingId, {
      audioFileId: audioFile.id,
      status: 'COMPLETED',
    });

    // 6. Trigger Transcript (Kafka) — Transcript Service sẽ tạo mới, không overwrite
    this.kafkaProducer.emit('audio_uploaded', {
      audioFileId: audioFile.id,
      meetingId,
    });

    // 7. Cleanup tmp
    fs.unlinkSync(tmpVideo);
    fs.unlinkSync(tmpAudio);

  } catch (err) {
    await this.videoRecordingRepo.update(recordingId, { status: 'FAILED' });
    throw err;
  }
}
```

### 4.6 Webhook Handler (LiveKit → NestJS)

```typescript
// webhook.controller.ts
import { WebhookReceiver } from 'livekit-server-sdk';

@Controller('webhooks')
export class WebhookController {
  private receiver: WebhookReceiver;

  constructor(
    private readonly config: ConfigService,
    private readonly recordingService: RecordingService,
    private readonly videoRoomService: VideoRoomService,
  ) {
    this.receiver = new WebhookReceiver(
      config.get('LIVEKIT_API_KEY'),
      config.get('LIVEKIT_API_SECRET'),
    );
  }

  @Post('livekit')
  @HttpCode(200)
  async handleWebhook(
    @Body() body: string,  // raw body string (dùng RawBodyMiddleware)
    @Headers('Authorization') auth: string,
  ) {
    const event = await this.receiver.receive(body, auth);

    switch (event.event) {
      case 'egress_ended':
        // status 3 = EGRESS_COMPLETE
        if (event.egressInfo?.status === 3) {
          await this.recordingService.handleEgressCompleted(event.egressInfo.egressId);
        }
        break;

      case 'room_finished':
        await this.videoRoomService.markRoomInactive(event.room?.name);
        break;
    }
  }
}
```

---

## 5. API Endpoints (API Gateway)

Thêm vào `api-gateway`, prefix `/api/v1`:

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| `POST` | `/meetings/:meetingId/videocall/start` | HOST | HOST bắt đầu phòng họp → tạo LiveKit room, set `isRoomActive = true` |
| `POST` | `/meetings/:meetingId/videocall/join` | Member | Lấy LiveKit token để join (chỉ được khi `isRoomActive = true`) |
| `POST` | `/meetings/:meetingId/videocall/end` | HOST | HOST kết thúc phòng → xóa LiveKit room, `isRoomActive = false` |
| `GET` | `/meetings/:meetingId/recordings` | Member | Danh sách tất cả VideoRecordings của meeting |
| `POST` | `/meetings/:meetingId/recordings/start` | HOST | Bắt đầu ghi (phòng phải đang active) |
| `POST` | `/meetings/:meetingId/recordings/:id/stop` | HOST | Dừng ghi |
| `POST` | `/meetings/:meetingId/recordings/:id/select` | HOST | Chọn bản ghi chính (`isSelected = true`) → trigger extract audio |
| `POST` | `/webhooks/livekit` | (Public + signature verify) | LiveKit webhook events |

---

## 6. Frontend — Next.js

### 6.1 Install packages

```bash
# Trong fe_next
npm install @livekit/components-react @livekit/components-styles livekit-client
```

### 6.2 Room URL

```
Route: /room/[meetingId]   ← meetingId là ID của Meeting (không phải VideoRoom riêng)
URL dạng: https://app/room/550e8400-e29b-41d4-a716-446655440000
```

### 6.3 Luồng hoạt động FE

```
[HOST bắt đầu họp]
1. HOST navigate đến trang Meeting, bấm "Bắt đầu Video Call"
2. FE gọi POST /api/v1/meetings/{meetingId}/videocall/start
3. Backend tạo LiveKit room → isRoomActive = true
4. FE redirect HOST đến /room/{meetingId}
5. FE gọi POST /api/v1/meetings/{meetingId}/videocall/join → nhận { token, livekitUrl }
6. Render <LiveKitRoom url={livekitUrl} token={token}>

[Members tham gia]
7. Member navigate đến /room/{meetingId}
8. FE kiểm tra isRoomActive:
   - false → hiển thị "Phòng chưa bắt đầu hoặc đã kết thúc"
   - true  → POST /videocall/join → nhận token → join phòng

[Trong cuộc họp]
9. HOST thấy panel bên phải: Recording Controls
10. HOST nhấn "⏺ Ghi" → POST /meetings/{meetingId}/recordings/start
11. Hiển thị 🔴 REC khi đang ghi (qua RoomEvent.RecordingStatusChanged)
12. HOST nhấn "⏹ Dừng" → POST /meetings/{meetingId}/recordings/{id}/stop

[Kết thúc họp]
13. HOST nhấn "Kết thúc cuộc họp" → POST /meetings/{meetingId}/videocall/end
    → Backend: deleteRoom() + isRoomActive = false + livekitRoomName = null
    → Tất cả participant bị kick khỏi phòng (LiveKit disconnect)
    → FE redirect về trang Meeting

[Sau khi họp xong — chọn recording]
14. Recordings xuất hiện trong danh sách (status: READY)
15. HOST chọn 1 recording → POST /meetings/{meetingId}/recordings/{id}/select
16. Hệ thống tự extract audio → tạo transcript → hiển thị status COMPLETED
```

### 6.4 Component cốt lõi

```tsx
// app/room/[meetingId]/page.tsx
'use client';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';

export default function RoomPage({ params }: { params: { meetingId: string } }) {
  const [connectionInfo, setConnectionInfo] = useState<{token: string, livekitUrl: string} | null>(null);

  useEffect(() => {
    fetch(`/api/v1/videocall/rooms/${params.meetingId}/token`, { method: 'POST' })
      .then(r => r.json())
      .then(setConnectionInfo);
  }, [params.meetingId]);

  if (!connectionInfo) return <LoadingScreen />;

  return (
    <LiveKitRoom
      video={true}
      audio={true}
      token={connectionInfo.token}
      serverUrl={connectionInfo.livekitUrl}
      data-lk-theme="default"
      style={{ height: '100dvh' }}
    >
      <div className="room-layout">
        <VideoConference className="main-video" />
        <RecordingPanel meetingId={params.meetingId} />
      </div>
    </LiveKitRoom>
  );
}
```

```tsx
// components/RecordingPanel.tsx
'use client';
import { useRoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';

export function RecordingPanel({ meetingId }: { meetingId: string }) {
  const room = useRoomContext();
  const [isRecording, setIsRecording] = useState(false);
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<VideoRecording[]>([]);

  // LiveKit event: cập nhật trạng thái recording tự động
  useEffect(() => {
    const update = () => setIsRecording(room.isRecording);
    room.on(RoomEvent.RecordingStatusChanged, update);
    return () => room.off(RoomEvent.RecordingStatusChanged, update);
  }, [room]);

  const handleStart = async () => {
    const res = await fetch(
      `/api/v1/videocall/rooms/${meetingId}/recordings/start`,
      { method: 'POST' }
    ).then(r => r.json());
    setCurrentRecordingId(res.recordingId);
  };

  const handleStop = async () => {
    if (!currentRecordingId) return;
    await fetch(
      `/api/v1/videocall/rooms/${meetingId}/recordings/${currentRecordingId}/stop`,
      { method: 'POST' }
    );
    setCurrentRecordingId(null);
    refreshRecordings();
  };

  const handleSelect = async (recordingId: string) => {
    await fetch(
      `/api/v1/videocall/rooms/${meetingId}/recordings/${recordingId}/select`,
      { method: 'POST' }
    );
    refreshRecordings();
  };

  return (
    <aside className="recording-panel">
      <div className="recording-status">
        {isRecording ? '🔴 Đang ghi...' : '⚪ Chưa ghi'}
      </div>

      {!isRecording ? (
        <button onClick={handleStart} className="btn-record">⏺ Bắt đầu ghi</button>
      ) : (
        <button onClick={handleStop} className="btn-stop">⏹ Dừng ghi</button>
      )}

      <div className="recordings-list">
        <h3>Danh sách Recordings</h3>
        {recordings.map(rec => (
          <RecordingItem
            key={rec.id}
            recording={rec}
            onSelect={() => handleSelect(rec.id)}
          />
        ))}
      </div>
    </aside>
  );
}
```

---

## 7. Infrastructure — Docker Compose bổ sung

Thêm vào `docker-compose.yml`:

```yaml
  # LiveKit Server (WebRTC SFU)
  livekit-server:
    image: livekit/livekit-server:latest
    container_name: transcripthub-livekit
    restart: always
    ports:
      - "7880:7880"                       # API + WebSocket
      - "7881:7881"                       # RTC over TCP
      - "50000-50200:50000-50200/udp"     # RTC media UDP
    command: --dev --bind 0.0.0.0
    environment:
      LIVEKIT_KEYS: "devkey: secret"
    networks:
      - transcripthub_net

  # LiveKit Egress (ghi hình + export)
  livekit-egress:
    image: livekit/egress:latest
    container_name: transcripthub-egress
    restart: always
    cap_add:
      - SYS_ADMIN          # Bắt buộc cho Chromium sandbox
    environment:
      EGRESS_CONFIG_FILE: /etc/egress/config.yaml
    volumes:
      - ./infra/egress-config.yaml:/etc/egress/config.yaml
    depends_on:
      - livekit-server
      - redis
      - minio
    networks:
      - transcripthub_net
```

**File `infra/egress-config.yaml`:**

```yaml
api_key: devkey
api_secret: secret
ws_url: ws://livekit-server:7880

# Redis bắt buộc cho Egress load balancing
redis:
  address: redis:6379

# Default storage (MinIO)
s3:
  access_key: minioadmin
  secret: minioadmin
  bucket: transcripthub-bucket
  endpoint: http://minio:9000
  force_path_style: true   # BẮT BUỘC với MinIO (không phải AWS)
  region: us-east-1

log_level: debug
```

> **Lưu ý:** Egress cần `SYS_ADMIN` để Chromium hoạt động trong container (chạy headless browser để render layout video).

---

## 8. Luồng dữ liệu đầy đủ (End-to-End)

```
[HOST bắt đầu phòng họp]
  POST /meetings/{meetingId}/videocall/start  (chỉ HOST)
    → roomServiceClient.createRoom({ name: "transcripthub-{meetingId}-{timestamp}" })
    → Meeting.update({ livekitRoomName, isRoomActive: true, roomStartedAt })
    → FE redirect HOST → /room/{meetingId}

[HOST / Member join]
  POST /meetings/{meetingId}/videocall/join
    → Kiểm tra meeting.isRoomActive == true (nếu false → 403 "Phòng chưa/đã kết thúc")
    → AccessToken generated (role-based permissions, ttl: 4h)
    → Trả về { token, livekitUrl, roomName }
    → FE: LiveKitRoom kết nối ws://livekit:7880 với token

[HOST bắt đầu ghi]
  POST /meetings/{meetingId}/recordings/start
    → egressClient.startRoomCompositeEgress(meeting.livekitRoomName, ...)
    → VideoRecording { meetingId, status: RECORDING, egressId } saved
    → RoomEvent.RecordingStatusChanged → FE hiển thị 🔴 REC

[HOST dừng ghi]
  POST /meetings/{meetingId}/recordings/{recordingId}/stop
    → egressClient.stopEgress(egressId)
    → VideoRecording { status: PROCESSING, endedAt }

[LiveKit Egress hoàn tất upload lên MinIO]
  POST /webhooks/livekit { event: "egress_ended", status: EGRESS_COMPLETE }
    → VideoRecording { status: READY }
    → FE polling / websocket → hiển thị recording trong danh sách ✅

[HOST kết thúc phòng họp]
  POST /meetings/{meetingId}/videocall/end  (chỉ HOST)
    → roomServiceClient.deleteRoom(meeting.livekitRoomName)
        → LiveKit kick tất cả participant
        → LiveKit tự dừng mọi egress đang chạy → webhook egress_ended
    → Meeting.update({ isRoomActive: false, livekitRoomName: null, roomEndedAt })
    → FE: tất cả participant nhận RoomEvent.Disconnected → redirect về trang Meeting

[LiveKit room_finished webhook — fallback]
  POST /webhooks/livekit { event: "room_finished" }
    → handleRoomFinished() → isRoomActive = false (nếu chưa được set bởi endRoom)

[HOST chọn bản chính — sau khi họp xong]
  POST /meetings/{meetingId}/recordings/{recordingId}/select
    → clearSelectedInMeeting(meetingId) — unset bản cũ (không xóa AudioFile cũ)
    → VideoRecording { isSelected: true, status: EXTRACTING }
    → Kafka emit "video_recording_selected" { recordingId, meetingId, objectKey, ... }

[Worker extract audio]
  Kafka consume "video_recording_selected"
    → MinIO download: recordings/{meetingId}/{recordingId}.mp4 → /tmp/{recordingId}.mp4
    → ffmpeg: strip video, export audio/mpeg → /tmp/{recordingId}.mp3
    → MinIO upload: audio/{recordingId}.mp3
    → File Service: createAudioFileRecord → AudioFile { id }
    → VideoRecording { audioFileId, status: COMPLETED }
    → Kafka emit "audio_uploaded" { audioFileId, meetingId }

[Transcript Service]
  Kafka consume "audio_uploaded"
    → Tạo Transcript mới (ID mới, không overwrite bản cũ)
    → Gemini AI processing → Transcript { status: COMPLETED }
    → FE có thể navigate đến /transcripts/{audioFileId}/edit

[Meeting không có video recording — luồng cũ]
  Meeting.livekitRoomName == null → không có VideoRecording
  → AudioFile được gán thủ công (upload file)
  → Transcript tạo bình thường
```

---

## 9. Phân tích Rủi ro & Giải pháp

| Rủi ro | Giải pháp |
|---|---|
| Egress cần nhiều CPU (Chromium) | Scale Egress worker hoặc dùng `TrackComposite` (nhẹ hơn, không cần Chrome) |
| File video lớn, extract audio chậm | Worker chạy async Kafka, không block API response |
| Webhook bị miss nếu server down | Thêm cron fallback: poll LiveKit API kiểm tra EgressInfo định kỳ |
| 2 HOST cùng select cùng lúc | DB transaction: `clearSelected` + `update` trong 1 transaction |
| Token hết hạn giữa họp dài | TTL token = 4h, FE tự refresh trước khi hết hạn |
| MinIO không accessible từ Egress | Cùng docker network; kiểm tra `force_path_style: true` |
| LiveKit UDP port bị firewall | Cần mở range `50000-50200/udp` trên server production |
| Nghe lại audio cũ sau khi chọn bản mới | AudioFile cũ vẫn tồn tại trong MinIO, transcript cũ vẫn còn — chỉ thêm mới |

---

## 10. Kế hoạch triển khai (2 tuần)

### Tuần 1 — Backend & Infrastructure

| Ngày | Task |
|---|---|
| 1 | Thêm LiveKit + Egress vào `docker-compose.yml`, test kết nối |
| 2 | Prisma schema: Meeting thêm LiveKit fields, VideoRecording, RecordingStatus enum; migration |
| 3 | VideocallService: `startRoom`, `generateToken`, `endRoom` |
| 4 | RecordingService: `startRecording`, `stopRecording` |
| 5 | WebhookController: xử lý `egress_ended`, `room_finished` (fallback) |
| 6 | RecordingService: `selectRecording` + Kafka emit |
| 7 | Audio Extraction Worker: Kafka consumer + ffmpeg + File Service integration |

### Tuần 2 — Frontend & Integration

| Ngày | Task |
|---|---|
| 8 | API Gateway: thêm endpoints `/videocall/start`, `/join`, `/end`; auth guard |
| 9 | FE: trang Meeting thêm nút "Bắt đầu Video Call" (HOST) |
| 10 | FE: `/room/[meetingId]/page.tsx` + LiveKitRoom + handle `RoomEvent.Disconnected` |
| 11 | FE: RecordingPanel (start/stop/list/select UI) + nút "Kết thúc cuộc họp" |
| 12 | E2E test: start room → join → record → end room → select → extract → transcript |
| 13 | UI polish: recording indicator, status badges, "Phòng đã kết thúc" screen |
| 14 | Bug fix, load test, documentation |

---

## 11. Tham khảo

- [LiveKit Docs — Self Hosting](https://docs.livekit.io/home/self-hosting/)
- [LiveKit Egress Overview](https://docs.livekit.io/egress/overview/)
- [LiveKit Server SDK (Node.js)](https://docs.livekit.io/reference/server-sdks/nodejs/)
- [LiveKit Components React](https://docs.livekit.io/reference/components/react/)
- [LiveKit Access Tokens](https://docs.livekit.io/home/server/access-tokens/)
- [LiveKit Webhooks](https://docs.livekit.io/home/server/webhooks/)
- [LiveKit Egress + MinIO (S3 compatible)](https://docs.livekit.io/egress/output-options/)
