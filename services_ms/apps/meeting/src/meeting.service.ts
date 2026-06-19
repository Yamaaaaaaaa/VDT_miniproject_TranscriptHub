import { Injectable } from '@nestjs/common';
import { AppException, ErrorCodes } from '../../../libs/common/src/exceptions/error-code';
import { MeetingRepository } from './repositories/meeting.repository';
import { UserGateway } from './gateways/user.gateway';
import { FileGateway } from './gateways/file.gateway';
import { TranscriptGateway } from './gateways/transcript.gateway';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MeetingRole } from '@prisma/client';

@Injectable()
export class MeetingService {
  constructor(
    private readonly meetingRepo: MeetingRepository,
    private readonly userGateway: UserGateway,
    private readonly fileGateway: FileGateway,
    private readonly transcriptGateway: TranscriptGateway,
  ) {}

  private async enrichMeeting(
    meeting: any,
    includeAudioFile: boolean,
    includeTranscript: boolean,
  ) {
    const response = {
      ...meeting,
      audioFile: null,
      transcript: null,
    };
    if (!meeting.audioFileId) return response;

    if (includeAudioFile) {
      try {
        const fileMetadata = await this.fileGateway.getFileMetadata(
          meeting.audioFileId,
        );
        if (fileMetadata) {
          response.audioFile = fileMetadata;
        }
      } catch (err) {
        console.warn(
          `Failed to fetch audio file metadata for ID: ${meeting.audioFileId}`,
          err.message,
        );
      }
    }

    if (includeTranscript) {
      try {
        const transcript =
          await this.transcriptGateway.getTranscriptByAudioFile(
            meeting.audioFileId,
          );
        if (transcript) {
          response.transcript = transcript;
        }
      } catch (err) {
        console.warn(
          `Failed to fetch transcript for file ID: ${meeting.audioFileId}`,
          err.message,
        );
      }
    }

    return response;
  }

  async createMeeting(dto: CreateMeetingDto, creatorId: number) {
    console.log(
      `Creating meeting with title: ${dto.title}, creatorId: ${creatorId}, audioFileId: ${dto.audioFileId}`,
    );

    // 1. Validate audio file existence using FileGateway
    try {
      const fileExists = await this.fileGateway.checkFileExists(
        dto.audioFileId,
      );
      if (!fileExists) {
        throw new AppException(ErrorCodes.AUDIO_FILE_NOT_FOUND);
      }
    } catch (err) {
      if (err instanceof AppException) throw err;
      console.error('Failed to connect to file-service for validation', err);
      throw new AppException(ErrorCodes.AUDIO_FILE_NOT_FOUND);
    }

    // 2. Check if audio file is already linked to another meeting
    const linked = await this.meetingRepo.findByAudioFileId(dto.audioFileId);
    if (linked) {
      throw new AppException(ErrorCodes.AUDIO_FILE_ALREADY_LINKED);
    }

    // 3. Save meeting and add creator as HOST
    return this.meetingRepo.createMeetingWithCreator(
      dto.title,
      dto.description,
      creatorId,
      dto.audioFileId,
    );
  }

  async getMeeting(
    meetingId: string,
    requesterId: number,
    includeAudioFile: boolean,
    includeTranscript: boolean,
  ) {
    console.log(
      `Retrieving meeting: ${meetingId} by requester: ${requesterId}`,
    );
    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting) {
      throw new AppException(ErrorCodes.MEETING_NOT_FOUND);
    }

    // Check membership
    const membership = await this.meetingRepo.findMember(
      meetingId,
      requesterId,
    );
    if (!membership) {
      throw new AppException(ErrorCodes.UNAUTHORIZED);
    }

    return this.enrichMeeting(meeting, includeAudioFile, includeTranscript);
  }

  async listMeetings(
    userId: number,
    page: number,
    size: number,
    includeAudioFile: boolean,
    includeTranscript: boolean,
  ) {
    console.log(`Listing meetings for user: ${userId}`);
    const skip = page * size;
    const take = size;

    const [meetings, total] = await Promise.all([
      this.meetingRepo.findManyByUserId(userId, skip, take),
      this.meetingRepo.countByUserId(userId),
    ]);

    const enrichedContent = await Promise.all(
      meetings.map((m) =>
        this.enrichMeeting(m, includeAudioFile, includeTranscript),
      ),
    );

    const totalPages = Math.ceil(total / size);

    return {
      content: enrichedContent,
      totalElements: total,
      pageNumber: page,
      pageSize: size,
      totalPages: totalPages,
    };
  }

  async updateMeeting(
    meetingId: string,
    dto: UpdateMeetingDto,
    requesterId: number,
  ) {
    console.log(`Updating meeting: ${meetingId} by requester: ${requesterId}`);
    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting) {
      throw new AppException(ErrorCodes.MEETING_NOT_FOUND);
    }

    // Requester must be HOST or EDITOR to update meeting
    const member = await this.meetingRepo.findMember(meetingId, requesterId);
    if (
      !member ||
      (member.role !== MeetingRole.HOST && member.role !== MeetingRole.EDITOR)
    ) {
      throw new AppException(ErrorCodes.UNAUTHORIZED);
    }

    const data: any = {
      title: dto.title,
      description: dto.description,
    };
    if (dto.status) {
      data.status = dto.status;
    }
    if (dto.audioFileId) {
      try {
        const fileExists = await this.fileGateway.checkFileExists(
          dto.audioFileId,
        );
        if (!fileExists) {
          throw new AppException(ErrorCodes.AUDIO_FILE_NOT_FOUND);
        }
      } catch (err) {
        if (err instanceof AppException) throw err;
        console.error('Failed to connect to file-service for validation', err);
        throw new AppException(ErrorCodes.AUDIO_FILE_NOT_FOUND);
      }

      const linked = await this.meetingRepo.findByAudioFileId(dto.audioFileId);
      if (linked && linked.id !== meetingId) {
        throw new AppException(ErrorCodes.AUDIO_FILE_ALREADY_LINKED);
      }

      data.audioFileId = dto.audioFileId;
    }

    return this.meetingRepo.update(meetingId, data);
  }

  async deleteMeeting(meetingId: string, requesterId: number) {
    console.log(`Deleting meeting: ${meetingId} by requester: ${requesterId}`);
    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting) {
      throw new AppException(ErrorCodes.MEETING_NOT_FOUND);
    }

    // Requester must be HOST to delete meeting
    const member = await this.meetingRepo.findMember(meetingId, requesterId);
    if (!member || member.role !== MeetingRole.HOST) {
      throw new AppException(ErrorCodes.UNAUTHORIZED);
    }

    await this.meetingRepo.delete(meetingId);

    return { message: 'Meeting deleted successfully' };
  }

  async getMembers(meetingId: string, requesterId: number) {
    console.log(
      `Retrieving members of meeting: ${meetingId} by requester: ${requesterId}`,
    );

    // Check membership of requester
    const requesterMembership = await this.meetingRepo.findMember(
      meetingId,
      requesterId,
    );
    if (!requesterMembership) {
      throw new AppException(ErrorCodes.UNAUTHORIZED);
    }

    return this.meetingRepo.findMembersByMeetingId(meetingId);
  }

  async addMember(meetingId: string, dto: AddMemberDto, requesterId: number) {
    console.log(
      `Adding member (userId: ${dto.userId}, email: ${dto.email}) to meeting: ${meetingId} by requester: ${requesterId}`,
    );

    // Requester must be HOST to add members
    const requester = await this.meetingRepo.findMember(meetingId, requesterId);
    if (!requester || requester.role !== MeetingRole.HOST) {
      throw new AppException(ErrorCodes.UNAUTHORIZED);
    }

    let targetUserId = dto.userId;
    if (!targetUserId && dto.email) {
      try {
        const user = await this.userGateway.findProfileByEmail(dto.email);
        if (!user || !user.id) {
          throw new AppException(ErrorCodes.USER_NOT_FOUND);
        }
        targetUserId = user.id;
      } catch (err) {
        throw new AppException(ErrorCodes.USER_NOT_FOUND);
      }
    } else if (targetUserId) {
      try {
        const user = await this.userGateway.findOneProfile(targetUserId);
        if (!user || !user.id) {
          throw new AppException(ErrorCodes.USER_NOT_FOUND);
        }
      } catch (err) {
        throw new AppException(ErrorCodes.USER_NOT_FOUND);
      }
    }

    if (!targetUserId) {
      throw new AppException(ErrorCodes.INVALID_ACTION);
    }

    // Check if member already exists
    const existing = await this.meetingRepo.findMember(meetingId, targetUserId);
    if (existing) {
      throw new AppException(ErrorCodes.MEMBER_ALREADY_EXISTS);
    }

    return this.meetingRepo.addMember(meetingId, targetUserId, dto.role);
  }

  async updateMemberRole(
    meetingId: string,
    targetUserId: number,
    dto: UpdateMemberDto,
    requesterId: number,
  ) {
    console.log(
      `Updating member: ${targetUserId} role to ${dto.role} in meeting: ${meetingId} by requester: ${requesterId}`,
    );

    // Requester must be HOST to update roles
    const requester = await this.meetingRepo.findMember(meetingId, requesterId);
    if (!requester || requester.role !== MeetingRole.HOST) {
      throw new AppException(ErrorCodes.UNAUTHORIZED);
    }

    const targetMember = await this.meetingRepo.findMember(
      meetingId,
      targetUserId,
    );
    if (!targetMember) {
      throw new AppException(ErrorCodes.MEMBER_NOT_FOUND);
    }

    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting) {
      throw new AppException(ErrorCodes.MEETING_NOT_FOUND);
    }

    // Prevent changing the creator's role (the creator must always be HOST)
    if (targetUserId === meeting.creatorId && dto.role !== MeetingRole.HOST) {
      throw new AppException(ErrorCodes.INVALID_ACTION);
    }

    // Prevent self-role modification if it degrades the host count
    if (targetUserId === requesterId && dto.role !== MeetingRole.HOST) {
      const members = await this.meetingRepo.findMembersByMeetingId(meetingId);
      const hostCount = members.filter(
        (m) => m.role === MeetingRole.HOST,
      ).length;
      if (hostCount <= 1) {
        throw new AppException(ErrorCodes.INVALID_ACTION);
      }
    }

    return this.meetingRepo.updateMemberRole(meetingId, targetUserId, dto.role);
  }

  async removeMember(
    meetingId: string,
    targetUserId: number,
    requesterId: number,
  ) {
    console.log(
      `Removing member: ${targetUserId} from meeting: ${meetingId} by requester: ${requesterId}`,
    );

    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting) {
      throw new AppException(ErrorCodes.MEETING_NOT_FOUND);
    }

    // Prevent removing the creator of the meeting (creator cannot leave or be removed)
    if (targetUserId === meeting.creatorId) {
      throw new AppException(ErrorCodes.INVALID_ACTION);
    }

    const isSelf = targetUserId === requesterId;
    const requester = await this.meetingRepo.findMember(meetingId, requesterId);
    if (!requester) {
      throw new AppException(ErrorCodes.UNAUTHORIZED);
    }

    if (!isSelf && requester.role !== MeetingRole.HOST) {
      throw new AppException(ErrorCodes.UNAUTHORIZED);
    }

    const targetMember = await this.meetingRepo.findMember(
      meetingId,
      targetUserId,
    );
    if (!targetMember) {
      throw new AppException(ErrorCodes.MEMBER_NOT_FOUND);
    }

    // If a HOST is leaving, verify they are not the sole HOST
    if (isSelf && targetMember.role === MeetingRole.HOST) {
      const members = await this.meetingRepo.findMembersByMeetingId(meetingId);
      const hostCount = members.filter(
        (m) => m.role === MeetingRole.HOST,
      ).length;
      if (hostCount <= 1) {
        throw new AppException(ErrorCodes.INVALID_ACTION);
      }
    }

    await this.meetingRepo.removeMember(meetingId, targetUserId);

    return { message: 'Member removed from meeting successfully' };
  }

  async getAudioFileId(meetingId: string) {
    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting) {
      throw new AppException(ErrorCodes.MEETING_NOT_FOUND);
    }

    if (!meeting.audioFileId) {
      throw new Error('Meeting has no audioFileId');
    }

    return { audioFileId: meeting.audioFileId };
  }

  async getMeetingByAudioFileId(
    audioFileId: string,
    requesterId: number,
    includeAudioFile: boolean,
    includeTranscript: boolean,
  ) {
    console.log(
      `Retrieving meeting by audioFileId: ${audioFileId} by requester: ${requesterId}`,
    );

    // 1. Validate audio file existence using FileGateway
    try {
      const fileExists = await this.fileGateway.checkFileExists(audioFileId);
      if (!fileExists) {
        throw new AppException(ErrorCodes.AUDIO_FILE_NOT_FOUND);
      }
    } catch (err) {
      if (err instanceof AppException) throw err;
      console.error('Failed to connect to file-service for validation', err);
      throw new AppException(ErrorCodes.AUDIO_FILE_NOT_FOUND);
    }

    // 2. Find meeting associated with this audio file
    const meeting = await this.meetingRepo.findByAudioFileId(audioFileId);
    if (!meeting) {
      throw new AppException(ErrorCodes.MEETING_NOT_FOUND);
    }

    // 3. Verify requester is a member of the meeting
    const membership = await this.meetingRepo.findMember(meeting.id, requesterId);
    if (!membership) {
      throw new AppException(ErrorCodes.UNAUTHORIZED);
    }

    // 4. Enrich meeting information
    return this.enrichMeeting(meeting, includeAudioFile, includeTranscript);
  }
}

