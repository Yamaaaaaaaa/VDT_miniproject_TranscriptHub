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
    return this.prisma.transcriptVersion.findMany({
      where: { transcriptId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        versionName: true,
        createdById: true,
        createdAt: true,
      },
    });
  }
}
