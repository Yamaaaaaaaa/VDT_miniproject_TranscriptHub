import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MeetingStatus, MeetingRole } from '@prisma/client';

@Injectable()
export class MeetingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByAudioFileId(audioFileId: string) {
    return this.prisma.meeting.findUnique({
      where: { audioFileId },
    });
  }

  async createMeetingWithCreator(
    title: string,
    description: string | undefined,
    creatorId: number,
    audioFileId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const meeting = await tx.meeting.create({
        data: {
          title,
          description,
          creatorId,
          audioFileId,
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

  async findById(id: string) {
    return this.prisma.meeting.findUnique({
      where: { id },
    });
  }

  async findMember(meetingId: string, userId: number) {
    return this.prisma.meetingMember.findUnique({
      where: {
        meetingId_userId: {
          meetingId,
          userId,
        },
      },
    });
  }

  async findManyByUserId(
    userId: number,
    skip: number,
    take: number,
    search?: string,
    matchedFileIds?: string[],
  ) {
    const where: any = {
      members: {
        some: {
          userId,
        },
      },
    };
    if (search) {
      const searchConditions: any[] = [
        { title: { contains: search, mode: 'insensitive' } },
      ];
      if (matchedFileIds && matchedFileIds.length > 0) {
        searchConditions.push({ audioFileId: { in: matchedFileIds } });
      }
      where.OR = searchConditions;
    }
    return this.prisma.meeting.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async countByUserId(userId: number, search?: string, matchedFileIds?: string[]) {
    const where: any = {
      members: {
        some: {
          userId,
        },
      },
    };
    if (search) {
      const searchConditions: any[] = [
        { title: { contains: search, mode: 'insensitive' } },
      ];
      if (matchedFileIds && matchedFileIds.length > 0) {
        searchConditions.push({ audioFileId: { in: matchedFileIds } });
      }
      where.OR = searchConditions;
    }
    return this.prisma.meeting.count({
      where,
    });
  }

  async update(
    id: string,
    data: { title?: string; description?: string; status?: MeetingStatus; audioFileId?: string },
  ) {
    return this.prisma.meeting.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.prisma.meeting.delete({
      where: { id },
    });
  }

  async findMembersByMeetingId(meetingId: string) {
    return this.prisma.meetingMember.findMany({
      where: { meetingId },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async addMember(meetingId: string, userId: number, role: MeetingRole) {
    return this.prisma.meetingMember.create({
      data: {
        meetingId,
        userId,
        role,
      },
    });
  }

  async updateMemberRole(meetingId: string, userId: number, role: MeetingRole) {
    return this.prisma.meetingMember.update({
      where: {
        meetingId_userId: {
          meetingId,
          userId,
        },
      },
      data: {
        role,
      },
    });
  }

  async removeMember(meetingId: string, userId: number) {
    return this.prisma.meetingMember.delete({
      where: {
        meetingId_userId: {
          meetingId,
          userId,
        },
      },
    });
  }
}
