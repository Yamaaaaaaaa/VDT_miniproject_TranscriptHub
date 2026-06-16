import { Injectable } from '@nestjs/common';
import { MeetingGateway } from './gateways/meeting.gateway';
import { CollabRepository } from './repositories/collab.repository';

@Injectable()
export class CollabService {
  constructor(
    private readonly meetingGateway: MeetingGateway,
    private readonly collabRepository: CollabRepository,
  ) {}

  async getTranscript(meetingId: string) {
    const audioFileId = await this.meetingGateway.getAudioFileId(meetingId);

    const transcript =
      await this.collabRepository.findTranscriptByAudioFileId(audioFileId);

    if (!transcript) {
      return {
        rawText: '',
        structuredContent: { segments: [] },
      };
    }

    return {
      rawText: transcript.rawText || '',
      structuredContent: transcript.structuredContent || { segments: [] },
    };
  }

  async saveTranscript(
    meetingId: string,
    rawText: string,
    structuredContent: any,
  ) {
    const audioFileId = await this.meetingGateway.getAudioFileId(meetingId);

    await this.collabRepository.updateTranscript(audioFileId, {
      rawText,
      structuredContent,
    });
  }

  async createSnapshot(
    meetingId: string,
    userId: number,
    versionName: string,
  ) {
    const audioFileId = await this.meetingGateway.getAudioFileId(meetingId);

    const transcript =
      await this.collabRepository.findTranscriptByAudioFileId(audioFileId);

    if (!transcript) {
      throw new Error('Transcript not found');
    }

    return await this.collabRepository.createTranscriptVersion({
      transcriptId: transcript.id,
      versionName,
      rawText: transcript.rawText,
      structuredContent: transcript.structuredContent,
      createdById: userId,
    });
  }

  async getVersions(meetingId: string) {
    const audioFileId = await this.meetingGateway.getAudioFileId(meetingId);

    const transcript =
      await this.collabRepository.findTranscriptByAudioFileId(audioFileId);

    if (!transcript) {
      return [];
    }

    return await this.collabRepository.findTranscriptVersionsByTranscriptId(
      transcript.id,
    );
  }

  async restoreVersion(meetingId: string, versionId: number) {
    const audioFileId = await this.meetingGateway.getAudioFileId(meetingId);

    const version =
      await this.collabRepository.findTranscriptVersionById(versionId);

    if (!version) {
      throw new Error('Version not found');
    }

    await this.collabRepository.updateTranscript(audioFileId, {
      rawText: version.rawText,
      structuredContent: version.structuredContent,
    });

    return {
      rawText: version.rawText,
      structuredContent: version.structuredContent,
    };
  }
}
