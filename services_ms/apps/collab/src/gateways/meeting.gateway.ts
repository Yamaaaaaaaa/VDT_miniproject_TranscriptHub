import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class MeetingGateway {
  constructor(
    @Inject('MEETING_CLIENT') private readonly meetingClient: ClientProxy,
  ) {}

  async getAudioFileId(meetingId: string): Promise<string> {
    const response = await lastValueFrom(
      this.meetingClient.send('get-audioFileId', { meetingId }),
    );

    if (!response || !response.audioFileId) {
      throw new Error('Failed to get audioFileId from Meeting Service');
    }

    return response.audioFileId;
  }
}
