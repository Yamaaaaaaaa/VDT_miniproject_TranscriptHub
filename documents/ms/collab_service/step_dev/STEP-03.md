# STEP-03: Meeting Service TCP RPC Endpoint

## Mục Tiêu

Thêm command `get-audioFileId` vào Meeting Service để Collab Service có thể gọi qua TCP RPC.

## Dependencies

- ✅ STEP-00 (Prerequisites)
- ✅ STEP-02 (Collab Service)

## Checklist

- [x] Thêm command handler `get-audioFileId` vào Meeting Controller
- [x] Thêm method `getAudioFileId` vào Meeting Service

---

## 1. Thay Đổi Trong Code

### meeting.controller.ts

Thêm handler mới:

```typescript
@MessagePattern('get-audioFileId')
async getAudioFileId(@Payload() payload: { meetingId: string }) {
  return this.meetingService.getAudioFileId(payload.meetingId);
}
```

### meeting.service.ts

Thêm method mới:

```typescript
async getAudioFileId(meetingId: string) {
  const meeting = await this.meetingRepo.findById(meetingId);
  if (!meeting) {
    throw new AppException(ErrorCodes.MEETING_NOT_FOUND);
  }

  if (!meeting.audioFileId) {
    throw new Error('Meeting has no audioFileId');
  }

  return { audioFileId: meeting.audioFileId };
}
```

---

## Làm Sao Để Test?

### Test 1: Build Meeting Service

```bash
cd services_ms
npm run build -- --project=meeting
```

### Test 2: Start Meeting Service

```bash
cd services_ms
npm run start:dev -- --project=meeting
```

---

## Output Sau Step Này

Sau khi hoàn thành STEP-03:

1. ✅ Meeting Service expose `get-audioFileId` command qua TCP
2. ✅ Collab Service có thể gọi Meeting Service để lấy `audioFileId`

---

## Tiếp Theo

👉 **[STEP-04: y-websocket Server](./STEP-04.md)** - Tạo WebSocket server để sync CRDT giữa các clients
