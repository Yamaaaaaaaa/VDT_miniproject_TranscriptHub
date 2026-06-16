import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TcpClient } from '../common/tcp-client';

@Injectable()
export class CollabClientService extends TcpClient {
  private readonly logger = new Logger(CollabClientService.name);
  private readonly host: string;
  private readonly port: number;

  constructor(private configService: ConfigService) {
    super();
    this.host = this.configService.get<string>('collabGateway.collabServiceHost') ?? 'localhost';
    this.port = this.configService.get<number>('collabGateway.collabServicePort') ?? 3007;
  }

  async getTranscript(meetingId: string): Promise<any> {
    return TcpClient.send(this.host, this.port, 'get-transcript', { meetingId });
  }

  async saveTranscript(
    meetingId: string,
    rawText: string,
    structuredContent: any,
  ): Promise<any> {
    return TcpClient.send(this.host, this.port, 'save-transcript', {
      meetingId,
      rawText,
      structuredContent,
    });
  }

  async createSnapshot(
    meetingId: string,
    userId: number,
    versionName: string,
  ): Promise<any> {
    return TcpClient.send(this.host, this.port, 'create-snapshot', {
      meetingId,
      userId,
      versionName,
    });
  }
}
