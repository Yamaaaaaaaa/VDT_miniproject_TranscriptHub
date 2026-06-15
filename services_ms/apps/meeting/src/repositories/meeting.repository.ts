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

  async findManyByUserId(userId: number, skip: number, take: number) {
    return this.prisma.meeting.findMany({
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
    });
  }

  async countByUserId(userId: number) {
    return this.prisma.meeting.count({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
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
