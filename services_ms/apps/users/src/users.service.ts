import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) { }

  async findAll() {
    const profiles = await this.prisma.userProfile.findMany({
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

    return profiles.map((p) => {
      const roleName = p.account?.roles?.[0]?.role?.name ?? 'USER';
      const { account, ...rest } = p;
      return {
        ...rest,
        role: roleName,
      };
    });
  }

  async findOne(id: number) {
    const profile = await this.prisma.userProfile.findUnique({
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
    if (!profile) throw new NotFoundException(`User profile with id ${id} not found`);

    const roleName = profile.account?.roles?.[0]?.role?.name ?? 'USER';
    const { account, ...rest } = profile;
    return {
      ...rest,
      role: roleName,
    };
  }


  async findByEmail(email: string) {
    return this.prisma.userProfile.findUnique({ where: { email } });
  }

  async create(createUserProfileDto: CreateUserProfileDto) {
    const existing = await this.prisma.userProfile.findUnique({ where: { email: createUserProfileDto.email } });
    if (existing) throw new ConflictException(`Profile with email ${createUserProfileDto.email} already exists`);

    return this.prisma.userProfile.create({
      data: createUserProfileDto,
    });
  }

  async update(id: number, updateUserProfileDto: UpdateUserProfileDto) {
    await this.findOne(id);
    return this.prisma.userProfile.update({
      where: { id },
      data: updateUserProfileDto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.userProfile.delete({ where: { id } });
    return { message: `User profile ${id} deleted successfully` };
  }
}