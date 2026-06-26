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

  async findMany(skip: number, take: number) {
    return this.prisma.transcript.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async count() {
    return this.prisma.transcript.count();
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
    return this.prisma.transcript.update({
      where: { id },
      data: {
        status,
        rawText,
        structuredContent,
      },
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
