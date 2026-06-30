import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CollabService } from './collab.service';

@Controller()
export class CollabController {
  constructor(private readonly collabService: CollabService) {}

  @MessagePattern('get-transcript')
  async getTranscript(@Payload() payload: { meetingId: string }) {
    return this.collabService.getTranscript(payload.meetingId);
  }

  @MessagePattern('save-transcript')
  async saveTranscript(
    @Payload()
    payload: {
      meetingId: string;
      rawText: string;
      structuredContent: any;
      userId: number;
    },
  ) {
    return this.collabService.saveTranscript(
      payload.meetingId,
      payload.rawText,
      payload.structuredContent,
      payload.userId,
    );
  }

  @MessagePattern('create-snapshot')
  async createSnapshot(
    @Payload()
    payload: {
      meetingId: string;
      userId: number;
      versionName: string;
    },
  ) {
    const result = await this.collabService.createSnapshot(
      payload.meetingId,
      payload.userId,
      payload.versionName,
    );
    return {
      versionId: result.id,
      message: 'Snapshot created successfully',
    };
  }

  @MessagePattern('get-versions')
  async getVersions(@Payload() payload: { meetingId: string }) {
    return this.collabService.getVersions(payload.meetingId);
  }

  @MessagePattern('get-version-detail')
  async getVersionDetail(@Payload() payload: { versionId: number }) {
    return this.collabService.getVersionDetail(payload.versionId);
  }

  @MessagePattern('restore-version')
  async restoreVersion(
    @Payload() payload: { meetingId: string; versionId: number },
  ) {
    return this.collabService.restoreVersion(
      payload.meetingId,
      payload.versionId,
    );
  }

  @MessagePattern('delete-version')
  async deleteVersion(@Payload() payload: { versionId: number }) {
    return this.collabService.deleteVersion(payload.versionId);
  }
}
