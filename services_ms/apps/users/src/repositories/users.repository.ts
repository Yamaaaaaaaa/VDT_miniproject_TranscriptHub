import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserProfileDto } from '../dto/create-user-profile.dto';
import { UpdateUserProfileDto } from '../dto/update-user-profile.dto';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllWithAccount() {
    return this.prisma.userProfile.findMany({
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
}
