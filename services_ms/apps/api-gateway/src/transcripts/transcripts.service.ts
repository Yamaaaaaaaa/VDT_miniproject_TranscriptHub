import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Observable, catchError, throwError } from 'rxjs';

@Injectable()
export class TranscriptsService {
  constructor(
    @Inject('TRANSCRIPT_CLIENT') private readonly transcriptClient: ClientProxy,
  ) {}

  getTranscriptByAudioFile(audioFileId: string): Observable<any> {
    return this.transcriptClient
      .send('get_transcript_by_audio_file', audioFileId)
      .pipe(catchError((err) => throwError(() => err)));
  }

  getAllTranscripts(page: number, size: number, search?: string): Observable<any> {
    return this.transcriptClient
      .send('get_all_transcripts', { page, size, search })
      .pipe(catchError((err) => throwError(() => err)));
  }

  generateTranscriptManual(fileId: string): Observable<any> {
    return this.transcriptClient
      .send('generate_transcript_manual', fileId)
      .pipe(catchError((err) => throwError(() => err)));
  }

  reTranscript(fileId: string): Observable<any> {
    return this.transcriptClient
      .send('re_transcribe', fileId)
      .pipe(catchError((err) => throwError(() => err)));
  }

  deleteTranscript(id: number): Observable<any> {
    return this.transcriptClient
      .send('delete_transcript', id)
      .pipe(catchError((err) => throwError(() => err)));
  }
}
