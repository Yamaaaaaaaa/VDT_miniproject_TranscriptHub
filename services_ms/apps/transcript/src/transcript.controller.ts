import { Controller } from '@nestjs/common';
import {
  MessagePattern,
  EventPattern,
  Payload,
} from '@nestjs/microservices';
import { TranscriptService } from './transcript.service';

@Controller()
export class TranscriptController {
  constructor(private readonly transcriptService: TranscriptService) {}

  // ── TCP Message Patterns (gọi từ api-gateway) ──────────────────────────────

  @MessagePattern('get_transcript_by_audio_file')
  async getTranscriptByAudioFile(@Payload() audioFileId: string) {
    return this.transcriptService.getTranscriptByAudioFileId(audioFileId);
  }

  @MessagePattern('get_all_transcripts')
  async getAllTranscripts(@Payload() payload: { page?: number; size?: number }) {
    const page = payload?.page ?? 0;
    const size = payload?.size ?? 10;
    return this.transcriptService.getAllTranscripts(page, size);
  }

  @MessagePattern('generate_transcript_manual')
  async generateTranscriptManual(@Payload() fileId: string) {
    return this.transcriptService.generateTranscriptManually(fileId);
  }

  @MessagePattern('re_transcribe')
  async reTranscribe(@Payload() fileId: string) {
    return this.transcriptService.reTranscribe(fileId);
  }

  @MessagePattern('delete_transcript')
  async deleteTranscript(@Payload() id: number) {
    return this.transcriptService.deleteTranscript(id);
  }

  // ── Kafka Event Patterns ────────────────────────────────────────────────────

  /**
   * Consumer cho topic "audio-file-events".
   *
   * Nhận notification khi file-service hoàn tất upload thành công.
   * Handler này cố ý giữ XỬ LÝ NHANH: chỉ tạo DB record và emit job
   * vào topic "transcription-jobs" để xử lý thực sự.
   *
   * Không thực hiện transcription trực tiếp ở đây — tránh block consumer.
   */
  @EventPattern('audio-file-events')
  async handleAudioFileUploaded(@Payload() data: any) {
    console.log('[Kafka] Received event on audio-file-events:', JSON.stringify(data));

    // Normalize payload — NestJS Kafka có thể wrap trong nhiều lớp
    const fileId = this.extractFileId(data);

    if (fileId) {
      console.log(`[Kafka] Enqueueing transcription job for fileId: ${fileId}`);
      await this.transcriptService.enqueueTranscriptionJob(fileId);
    } else {
      console.warn('[Kafka] Could not extract fileId from audio-file-events. Skipping.', JSON.stringify(data));
    }
  }

  /**
   * Consumer cho topic "transcription-jobs".
   *
   * Đây là worker thực sự — xử lý transcription với:
   *   - Semaphore (tối đa MAX_CONCURRENT_TRANSCRIPTIONS job đồng thời)
   *   - Exponential backoff retry khi Gemini trả về 429
   *   - Dead-letter queue (transcription-dlq) khi vượt quá max retry
   *
   * Handler AWAIT cho đến khi job hoàn tất → Kafka offset chỉ advance
   * sau khi job xong → đảm bảo không mất job khi service restart.
   */
  @EventPattern('transcription-jobs')
  async handleTranscriptionJob(@Payload() data: any) {
    console.log('[Kafka] Received job on transcription-jobs:', JSON.stringify(data));

    // Normalize payload
    let payload = this.normalizeKafkaPayload(data);

    const fileId = payload?.fileId;
    const transcriptId = payload?.transcriptId;
    const attempt = payload?.attempt ?? 1;

    if (!fileId || !transcriptId) {
      console.error('[Kafka] Invalid transcription-jobs payload — missing fileId or transcriptId:', JSON.stringify(data));
      return;
    }

    // processTranscriptionJob là blocking — handler sẽ không return
    // cho đến khi job xử lý xong (thành công hoặc đưa vào DLQ)
    await this.transcriptService.processTranscriptionJob({ fileId, transcriptId, attempt });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private extractFileId(data: any): string | null {
    // Normalize qua các lớp wrapper mà NestJS Kafka có thể tạo
    let eventPayload = data;
    if (typeof eventPayload === 'string') {
      try { eventPayload = JSON.parse(eventPayload); } catch { return null; }
    }

    // Trường hợp NestJS wrap trong {value: ...}
    if (eventPayload?.value) {
      let val = eventPayload.value;
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch { return null; }
      }
      eventPayload = val;
    }

    return eventPayload?.payload?.fileId ?? eventPayload?.fileId ?? null;
  }

  private normalizeKafkaPayload(data: any): any {
    let payload = data;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch { return null; }
    }
    if (payload?.value) {
      let val = payload.value;
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch { return null; }
      }
      payload = val;
    }
    return payload;
  }
}
