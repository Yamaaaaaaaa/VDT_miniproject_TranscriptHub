import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class TranscriptGateway {
  constructor(
    @Inject('TRANSCRIPT_CLIENT') private readonly transcriptClient: ClientProxy,
  ) {}

  async getTranscriptByAudioFile(audioFileId: string) {
    return lastValueFrom(
      this.transcriptClient.send('get_transcript_by_audio_file', audioFileId),
    );
  }
}
