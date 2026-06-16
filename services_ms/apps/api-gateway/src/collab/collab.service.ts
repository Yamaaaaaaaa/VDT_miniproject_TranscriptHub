import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class CollabService {
  constructor(
    @Inject('COLLAB_CLIENT') private readonly collabClient: ClientProxy,
  ) {}

  async getTranscript(meetingId: string) {
    return lastValueFrom(
      this.collabClient.send('get-transcript', { meetingId }),
    );
  }

  async saveTranscript(
    meetingId: string,
    rawText: string,
    structuredContent: any,
  ) {
    return lastValueFrom(
      this.collabClient.send('save-transcript', {
        meetingId,
        rawText,
        structuredContent,
      }),
    );
  }

  async createSnapshot(meetingId: string, userId: number, versionName: string) {
    return lastValueFrom(
      this.collabClient.send('create-snapshot', {
        meetingId,
        userId,
        versionName,
      }),
    );
  }

  async getVersions(meetingId: string) {
    return lastValueFrom(
      this.collabClient.send('get-versions', { meetingId }),
    );
  }

  async restoreVersion(meetingId: string, versionId: number) {
    return lastValueFrom(
      this.collabClient.send('restore-version', { meetingId, versionId }),
    );
  }
}
