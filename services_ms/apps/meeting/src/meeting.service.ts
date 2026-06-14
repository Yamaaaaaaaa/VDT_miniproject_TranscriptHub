import { Inject, Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { PrismaService } from './prisma/prisma.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MeetingStatus, MeetingRole } from '@prisma/client';

@Injectable()
export class MeetingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('USERS_CLIENT') private readonly usersClient: ClientProxy,
    @Inject('FILES_CLIENT') private readonly fileClient: ClientProxy,
    @Inject('TRANSCRIPT_CLIENT') private readonly transcriptClient: ClientProxy,
  ) {}

  private async enrichMeeting(meeting: any, includeAudioFile: boolean, includeTranscript: boolean) {
    const response = {
      ...meeting,
      audioFile: null,
      transcript: null,
    };
    if (!meeting.audioFileId) return response;

    if (includeAudioFile) {
      try {
        const fileMetadata = await lastValueFrom(
          this.fileClient.send('get_file_metadata', meeting.audioFileId)
        );
        if (fileMetadata) {
          response.audioFile = fileMetadata;
        }
      } catch (err) {
        console.warn(`Failed to fetch audio file metadata for ID: ${meeting.audioFileId}`, err.message);
      }
    }

    if (includeTranscript) {
      try {
        const transcript = await lastValueFrom(
          this.transcriptClient.send('get_transcript_by_audio_file', meeting.audioFileId)
        );
        if (transcript) {
          response.transcript = transcript;
        }
      } catch (err) {
        console.warn(`Failed to fetch transcript for file ID: ${meeting.audioFileId}`, err.message);
      }
    }

    return response;
  }

  async createMeeting(dto: CreateMeetingDto, creatorId: number) {
    console.log(`Creating meeting with title: ${dto.title}, creatorId: ${creatorId}, audioFileId: ${dto.audioFileId}`);

    // 1. Validate audio file existence using FileClient
    try {
      const fileExists = await lastValueFrom(
        this.fileClient.send('check_file_exists', dto.audioFileId)
      );
      if (!fileExists) {
        throw new NotFoundException('Audio file not found');
      }
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      console.error('Failed to connect to file-service for validation', err);
      throw new NotFoundException('Audio file not found');
    }

    // 2. Check if audio file is already linked to another meeting
    const linked = await this.prisma.meeting.findUnique({
      where: { audioFileId: dto.audioFileId },
    });
    if (linked) {
      throw new BadRequestException('Audio file is already linked to another meeting');
    }

    // 3. Save meeting and add creator as HOST
    return this.prisma.$transaction(async (tx) => {
      const meeting = await tx.meeting.create({
        data: {
          title: dto.title,
          description: dto.description,
          creatorId: creatorId,
          audioFileId: dto.audioFileId,
          status: MeetingStatus.CREATING,
        },
      });

      await tx.meetingMember.create({
        data: {
          meetingId: meeting.id,
          userId: creatorId,
          role: MeetingRole.HOST,
        },
      });

      return meeting;
    });
  }

  async getMeeting(meetingId: string, requesterId: number, includeAudioFile: boolean, includeTranscript: boolean) {
    console.log(`Retrieving meeting: ${meetingId} by requester: ${requesterId}`);
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // Check membership
    const membership = await this.prisma.meetingMember.findUnique({
      where: {
        meetingId_userId: {
          meetingId,
          userId: requesterId,
        },
      },
    });
    if (!membership) {
      throw new ForbiddenException('You do not have permission');
    }

    return this.enrichMeeting(meeting, includeAudioFile, includeTranscript);
  }

  async listMeetings(userId: number, page: number, size: number, includeAudioFile: boolean, includeTranscript: boolean) {
    console.log(`Listing meetings for user: ${userId}`);
    const skip = page * size;
    const take = size;

    const [meetings, total] = await Promise.all([
      this.prisma.meeting.findMany({
        where: {
          members: {
            some: {
              userId,
            },
          },
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.meeting.count({
        where: {
          members: {
            some: {
              userId,
            },
          },
        },
      }),
    ]);

    const enrichedContent = await Promise.all(
      meetings.map((m) => this.enrichMeeting(m, includeAudioFile, includeTranscript))
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

  async updateMeeting(meetingId: string, dto: UpdateMeetingDto, requesterId: number) {
    console.log(`Updating meeting: ${meetingId} by requester: ${requesterId}`);
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // Requester must be HOST or EDITOR to update meeting
    const member = await this.prisma.meetingMember.findUnique({
      where: {
        meetingId_userId: {
          meetingId,
          userId: requesterId,
        },
      },
    });
    if (!member || (member.role !== MeetingRole.HOST && member.role !== MeetingRole.EDITOR)) {
      throw new ForbiddenException('You do not have permission');
    }

    const data: any = {
      title: dto.title,
      description: dto.description,
    };
    if (dto.status) {
      data.status = dto.status;
    }

    return this.prisma.meeting.update({
      where: { id: meetingId },
      data,
    });
  }

  async deleteMeeting(meetingId: string, requesterId: number) {
    console.log(`Deleting meeting: ${meetingId} by requester: ${requesterId}`);
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // Requester must be HOST to delete meeting
    const member = await this.prisma.meetingMember.findUnique({
      where: {
        meetingId_userId: {
          meetingId,
          userId: requesterId,
        },
      },
    });
    if (!member || member.role !== MeetingRole.HOST) {
      throw new ForbiddenException('You do not have permission');
    }

    await this.prisma.meeting.delete({
      where: { id: meetingId },
    });

    return { message: 'Meeting deleted successfully' };
  }

  async getMembers(meetingId: string, requesterId: number) {
    console.log(`Retrieving members of meeting: ${meetingId} by requester: ${requesterId}`);

    // Check membership of requester
    const requesterMembership = await this.prisma.meetingMember.findUnique({
      where: {
        meetingId_userId: {
          meetingId,
          userId: requesterId,
        },
      },
    });
    if (!requesterMembership) {
      throw new ForbiddenException('You do not have permission');
    }

    return this.prisma.meetingMember.findMany({
      where: { meetingId },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async addMember(meetingId: string, dto: AddMemberDto, requesterId: number) {
    console.log(`Adding member (userId: ${dto.userId}, email: ${dto.email}) to meeting: ${meetingId} by requester: ${requesterId}`);

    // Requester must be HOST to add members
    const requester = await this.prisma.meetingMember.findUnique({
      where: {
        meetingId_userId: {
          meetingId,
          userId: requesterId,
        },
      },
    });
    if (!requester || requester.role !== MeetingRole.HOST) {
      throw new ForbiddenException('You do not have permission');
    }

    let targetUserId = dto.userId;
    if (!targetUserId && dto.email) {
      try {
        const user = await lastValueFrom(
          this.usersClient.send('find_profile_by_email', dto.email)
        );
        if (!user || !user.id) {
          throw new NotFoundException('User not found');
        }
        targetUserId = user.id;
      } catch (err) {
        throw new NotFoundException('User not found');
      }
    } else if (targetUserId) {
      try {
        const user = await lastValueFrom(
          this.usersClient.send('find_one_profile', targetUserId)
        );
        if (!user || !user.id) {
          throw new NotFoundException('User not found');
        }
      } catch (err) {
        throw new NotFoundException('User not found');
      }
    }

    if (!targetUserId) {
      throw new BadRequestException('Invalid action or permission');
    }

    // Check if member already exists
    const existing = await this.prisma.meetingMember.findUnique({
      where: {
        meetingId_userId: {
          meetingId,
          userId: targetUserId,
        },
      },
    });
    if (existing) {
      throw new BadRequestException('User is already a member of this meeting');
    }

    return this.prisma.meetingMember.create({
      data: {
        meetingId,
        userId: targetUserId,
        role: dto.role,
      },
    });
  }

  async updateMemberRole(meetingId: string, targetUserId: number, dto: UpdateMemberDto, requesterId: number) {
    console.log(`Updating member: ${targetUserId} role to ${dto.role} in meeting: ${meetingId} by requester: ${requesterId}`);

    // Requester must be HOST to update roles
    const requester = await this.prisma.meetingMember.findUnique({
      where: {
        meetingId_userId: {
          meetingId,
          userId: requesterId,
        },
      },
    });
    if (!requester || requester.role !== MeetingRole.HOST) {
      throw new ForbiddenException('You do not have permission');
    }

    const targetMember = await this.prisma.meetingMember.findUnique({
      where: {
        meetingId_userId: {
          meetingId,
          userId: targetUserId,
        },
      },
    });
    if (!targetMember) {
      throw new NotFoundException('Member not found in meeting');
    }

    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // Prevent changing the creator's role (the creator must always be HOST)
    if (targetUserId === meeting.creatorId && dto.role !== MeetingRole.HOST) {
      throw new BadRequestException('Invalid action or permission');
    }

    // Prevent self-role modification if it degrades the host count
    if (targetUserId === requesterId && dto.role !== MeetingRole.HOST) {
      const members = await this.prisma.meetingMember.findMany({
        where: { meetingId },
      });
      const hostCount = members.filter((m) => m.role === MeetingRole.HOST).length;
      if (hostCount <= 1) {
        throw new BadRequestException('Invalid action or permission');
      }
    }

    return this.prisma.meetingMember.update({
      where: {
        meetingId_userId: {
          meetingId,
          userId: targetUserId,
        },
      },
      data: {
        role: dto.role,
      },
    });
  }

  async removeMember(meetingId: string, targetUserId: number, requesterId: number) {
    console.log(`Removing member: ${targetUserId} from meeting: ${meetingId} by requester: ${requesterId}`);

    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // Prevent removing the creator of the meeting (creator cannot leave or be removed)
    if (targetUserId === meeting.creatorId) {
      throw new BadRequestException('Invalid action or permission');
    }

    const isSelf = targetUserId === requesterId;
    const requester = await this.prisma.meetingMember.findUnique({
      where: {
        meetingId_userId: {
          meetingId,
          userId: requesterId,
        },
      },
    });
    if (!requester) {
      throw new ForbiddenException('You do not have permission');
    }

    if (!isSelf && requester.role !== MeetingRole.HOST) {
      throw new ForbiddenException('You do not have permission');
    }

    const targetMember = await this.prisma.meetingMember.findUnique({
      where: {
        meetingId_userId: {
          meetingId,
          userId: targetUserId,
        },
      },
    });
    if (!targetMember) {
      throw new NotFoundException('Member not found in meeting');
    }

    // If a HOST is leaving, verify they are not the sole HOST
    if (isSelf && targetMember.role === MeetingRole.HOST) {
      const members = await this.prisma.meetingMember.findMany({
        where: { meetingId },
      });
      const hostCount = members.filter((m) => m.role === MeetingRole.HOST).length;
      if (hostCount <= 1) {
        throw new BadRequestException('Invalid action or permission');
      }
    }

    await this.prisma.meetingMember.delete({
      where: {
        meetingId_userId: {
          meetingId,
          userId: targetUserId,
        },
      },
    });

    return { message: 'Member removed from meeting successfully' };
  }
}
