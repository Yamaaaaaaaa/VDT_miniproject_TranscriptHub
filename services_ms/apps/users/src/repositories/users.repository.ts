import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserProfileDto } from '../dto/create-user-profile.dto';
import { UpdateUserProfileDto } from '../dto/update-user-profile.dto';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllWithAccount(search?: string) {
    const where: any = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.userProfile.findMany({
      where,
      include: {
        account: {
          include: {
            roles: {
              include: {
                role: true,
              },
            },
          },
        },
      },
    });
  }

  async findByIdWithAccount(id: number) {
    return this.prisma.userProfile.findUnique({
      where: { id },
      include: {
        account: {
          include: {
            roles: {
              include: {
                role: true,
              },
            },
          },
        },
      },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.userProfile.findUnique({
      where: { email },
    });
  }

  async create(data: CreateUserProfileDto) {
    return this.prisma.userProfile.create({
      data,
    });
  }

  async update(id: number, data: UpdateUserProfileDto) {
    return this.prisma.userProfile.update({
      where: { id },
      data,
    });
  }

  async delete(id: number) {
    return this.prisma.userProfile.delete({
      where: { id },
    });
  }

  // --- Notification Methods ---
  async getNotifications(userId: number) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findNotificationById(id: number) {
    return this.prisma.notification.findUnique({
      where: { id },
    });
  }

  async createNotification(userId: number, title: string, content: string, url?: string) {
    return this.prisma.notification.create({
      data: {
        userId,
        title,
        content,
        url,
      },
    });
  }

  async readNotification(id: number, userId: number) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async readAllNotifications(userId: number) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async deleteNotification(id: number, userId: number) {
    return this.prisma.notification.deleteMany({
      where: { id, userId },
    });
  }
}
