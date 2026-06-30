import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CollabRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findTranscriptByAudioFileId(audioFileId: string) {
    return this.prisma.transcript.findUnique({
      where: { audioFileId },
    });
  }

  async updateTranscript(
    audioFileId: string,
    data: { rawText: string; structuredContent: any },
  ) {
    return this.prisma.transcript.update({
      where: { audioFileId },
      data,
    });
  }

  async createTranscriptVersion(data: {
    transcriptId: number;
    versionName: string;
    rawText: string;
    structuredContent: any;
    createdById: number;
  }) {
    return this.prisma.transcriptVersion.create({ data });
  }

  async findTranscriptVersionById(versionId: number) {
    return this.prisma.transcriptVersion.findUnique({
      where: { id: versionId },
    });
  }

  async findTranscriptVersionsByTranscriptId(transcriptId: number) {
    const versions = await this.prisma.transcriptVersion.findMany({
      where: { transcriptId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        versionName: true,
        createdById: true,
        createdAt: true,
      },
    });

    // Kiểm tra xem đã có bản dịch gốc AI trong top 10 chưa
    const hasBaseline = versions.some((v) => v.versionName === 'Bản dịch gốc từ AI');
    if (!hasBaseline) {
      const baseline = await this.prisma.transcriptVersion.findFirst({
        where: { transcriptId, versionName: 'Bản dịch gốc từ AI' },
        select: {
          id: true,
          versionName: true,
          createdById: true,
          createdAt: true,
        },
      });
      if (baseline) {
        versions.push(baseline);
      }
    }

    const creatorIds = Array.from(
      new Set(versions.map((v) => v.createdById).filter((id): id is number => id !== null)),
    );

    const profiles = await this.prisma.userProfile.findMany({
      where: { id: { in: creatorIds } },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    return versions.map((v) => ({
      id: v.id,
      versionName: v.versionName,
      createdAt: v.createdAt,
      createdById: v.createdById,
      creator: v.createdById ? profileMap.get(v.createdById) || null : null,
    }));
  }

  async findLatestTranscriptVersion(transcriptId: number) {
    return this.prisma.transcriptVersion.findFirst({
      where: { transcriptId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteTranscriptVersion(versionId: number) {
    return this.prisma.transcriptVersion.delete({
      where: { id: versionId },
    });
  }
}
