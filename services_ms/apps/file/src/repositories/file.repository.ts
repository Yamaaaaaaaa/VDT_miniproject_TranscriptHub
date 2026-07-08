import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    id: string;
    fileName: string;
    bucketName: string;
    objectKey: string;
    fileSize: bigint;
    mimeType: string;
    durationSeconds: number;
    status: string;
    uploaderId: number;
  }) {
    return this.prisma.audioFile.create({ data });
  }

  async findById(id: string) {
    return this.prisma.audioFile.findUnique({
      where: { id },
    });
  }

  async update(
    id: string,
    data: {
      fileSize?: bigint;
      durationSeconds?: number;
      status?: string;
      fileName?: string;
    },
  ) {
    return this.prisma.audioFile.update({
      where: { id },
      data,
    });
  }

  async findManyByUploaderId(uploaderId: number, skip: number, take: number) {
    return this.prisma.audioFile.findMany({
      where: { uploaderId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async countByUploaderId(uploaderId: number) {
    return this.prisma.audioFile.count({
      where: { uploaderId },
    });
  }

  async findMany(uploaderId: number, skip: number, take: number, search?: string) {
    const where: any = { uploaderId };
    if (search) {
      where.fileName = { contains: search, mode: 'insensitive' };
    }
    return this.prisma.audioFile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async count(uploaderId: number, search?: string) {
    const where: any = { uploaderId };
    if (search) {
      where.fileName = { contains: search, mode: 'insensitive' };
    }
    return this.prisma.audioFile.count({
      where,
    });
  }

  async deleteTranscriptsByFileId(audioFileId: string) {
    return this.prisma.transcript.deleteMany({
      where: { audioFileId },
    });
  }

  async delete(id: string) {
    return this.prisma.audioFile.delete({
      where: { id },
    });
  }

  async searchFiles(where: any) {
    return this.prisma.audioFile.findMany({
      where,
    });
  }
}
