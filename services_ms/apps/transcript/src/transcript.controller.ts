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

  @MessagePattern('get_transcript_by_audio_file')
  async getTranscriptByAudioFile(@Payload() audioFileId: string) {
    return this.transcriptService.getTranscriptByAudioFileId(
      audioFileId,
    );
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

  @MessagePattern('delete_transcript')
  async deleteTranscript(@Payload() id: number) {
    return this.transcriptService.deleteTranscript(id);
  }

  @EventPattern('audio-file-events')
  async handleAudioFileEvents(@Payload() data: any) {
    console.log(
      `Received Kafka event on audio-file-events topic:`,
      JSON.stringify(data),
    );

    let eventPayload = data;
    if (typeof data === 'string') {
      try {
        eventPayload = JSON.parse(data);
      } catch (e) {
        console.error('Failed to parse Kafka event payload string:', e);
      }
    }

    // Handle case where NestJS passes a wrapper object with 'value' property
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
      console.log(
        `Triggering automatic async transcript generation for fileId: ${fileId}`,
      );
      await this.transcriptService.generateTranscriptAsync(fileId);
    } else {
      console.warn(
        `Could not extract fileId from Kafka event. Event:`,
        JSON.stringify(data),
      );
    }
  }
}
