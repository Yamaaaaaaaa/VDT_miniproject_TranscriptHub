import { Injectable } from '@nestjs/common';
import { MeetingGateway } from './gateways/meeting.gateway';
import { CollabRepository } from './repositories/collab.repository';
import { AppException, ErrorCodes } from '../../../libs/common/src/exceptions/error-code';

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
    userId: number,
  ) {
    const audioFileId = await this.meetingGateway.getAudioFileId(meetingId);

    const updatedTranscript = await this.collabRepository.updateTranscript(audioFileId, {
      rawText,
      structuredContent,
    });

    const timestampStr = new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + ' ' + new Date().toLocaleDateString('vi-VN');
    const versionName = `Bản lưu - ${timestampStr}`;

    await this.collabRepository.createTranscriptVersion({
      transcriptId: updatedTranscript.id,
      versionName,
      rawText: updatedTranscript.rawText,
      structuredContent: updatedTranscript.structuredContent,
      createdById: userId,
    });

    return updatedTranscript;
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

  async getVersionDetail(versionId: number) {
    const version =
      await this.collabRepository.findTranscriptVersionById(versionId);

    if (!version) {
      throw new Error('Version not found');
    }

    return version;
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

  async deleteVersion(versionId: number) {
    const version = await this.collabRepository.findTranscriptVersionById(versionId);
    if (!version) {
      throw new AppException(ErrorCodes.TRANSCRIPT_NOT_FOUND, 'Version not found');
    }

    // Không cho phép xóa phiên bản mới nhất (phiên bản hiện tại)
    const latestVersion = await this.collabRepository.findLatestTranscriptVersion(version.transcriptId);
    if (latestVersion && latestVersion.id === versionId) {
      throw new AppException(ErrorCodes.INVALID_ACTION, 'Cannot delete the latest version');
    }

    await this.collabRepository.deleteTranscriptVersion(versionId);
    return { success: true, message: 'Version deleted successfully' };
  }
}
