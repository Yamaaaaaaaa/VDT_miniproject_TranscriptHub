import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TranscriptRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByAudioFileId(audioFileId: string) {
    return this.prisma.transcript.findUnique({
      where: { audioFileId },
    });
  }

  async findById(id: number) {
    return this.prisma.transcript.findUnique({
      where: { id },
    });
  }

  async findAll() {
    return this.prisma.transcript.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findMany(skip: number, take: number, search?: string, matchedFileIds?: string[]) {
    const where: any = {};
    if (search) {
      const searchConditions: any[] = [];
      if (matchedFileIds && matchedFileIds.length > 0) {
        searchConditions.push({ audioFileId: { in: matchedFileIds } });
      }
      searchConditions.push({ rawText: { contains: search, mode: 'insensitive' } });
      where.OR = searchConditions;
    }
    return this.prisma.transcript.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async count(search?: string, matchedFileIds?: string[]) {
    const where: any = {};
    if (search) {
      const searchConditions: any[] = [];
      if (matchedFileIds && matchedFileIds.length > 0) {
        searchConditions.push({ audioFileId: { in: matchedFileIds } });
      }
      searchConditions.push({ rawText: { contains: search, mode: 'insensitive' } });
      where.OR = searchConditions;
    }
    return this.prisma.transcript.count({
      where,
    });
  }

  async create(audioFileId: string) {
    return this.prisma.transcript.create({
      data: {
        audioFileId,
        status: 'PROCESSING',
        rawText: '',
        structuredContent: { segments: [] },
      },
    });
  }

  async updateStatusAndContent(
    id: number,
    status: string,
    rawText?: string,
    structuredContent?: any,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Cập nhật trạng thái và nội dung của transcript
      const updated = await tx.transcript.update({
        where: { id },
        data: {
          status,
          rawText,
          structuredContent,
        },
      });

      // 2. Nếu trạng thái là COMPLETED, tạo snapshot làm gốc
      if (status === 'COMPLETED') {
        const existOrigin = await tx.transcriptVersion.findFirst({
          where: { transcriptId: id, versionName: 'Bản dịch gốc từ AI' },
        });

        if (!existOrigin) {
          await tx.transcriptVersion.create({
            data: {
              transcriptId: id,
              versionName: 'Bản dịch gốc từ AI',
              rawText: rawText || '',
              structuredContent: structuredContent || { segments: [] },
              createdById: null, // Hệ thống/AI
            },
          });
        }
      }

      return updated;
    });
  }

  async delete(id: number) {
    return this.prisma.transcript.delete({
      where: { id },
    });
  }

  async findByStatus(status: string) {
    return this.prisma.transcript.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
    });
  }
}
