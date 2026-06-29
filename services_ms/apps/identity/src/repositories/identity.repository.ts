import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAccountByEmail(email: string) {
    return this.prisma.account.findUnique({
      where: { email },
    });
  }

  async findAccountById(id: number) {
    return this.prisma.account.findUnique({
      where: { id },
    });
  }

  async createAccount(data: any) {
    return this.prisma.account.create({ data });
  }

  async findRoleByName(name: string) {
    return this.prisma.role.findUnique({
      where: { name },
    });
  }

  async findRoleById(id: number) {
    return this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }

  async createRole(name: string) {
    return this.prisma.role.create({
      data: { name },
    });
  }

  async createAccountRole(accountId: number, roleId: number) {
    return this.prisma.accountRole.create({
      data: {
        accountId,
        roleId,
      },
    });
  }

  async findAccountRolesAndPermissions(accountId: number) {
    return this.prisma.accountRole.findMany({
      where: { accountId },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });
  }

  async findAllRoles() {
    return this.prisma.role.findMany({
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }

  async findRoleByOtherName(name: string, excludeId: number) {
    return this.prisma.role.findFirst({
      where: {
        name,
        id: { not: excludeId },
      },
    });
  }

  async updateRole(id: number, name: string) {
    return this.prisma.role.update({
      where: { id },
      data: { name },
    });
  }

  async deleteRole(id: number) {
    return this.prisma.role.delete({
      where: { id },
    });
  }

  async deleteAccount(id: number) {
    return this.prisma.account.delete({
      where: { id },
    });
  }

  async findRolesByNames(roleNames: string[]) {
    return this.prisma.role.findMany({
      where: {
        name: { in: roleNames },
      },
    });
  }

  async deleteAccountRoles(accountId: number) {
    return this.prisma.accountRole.deleteMany({
      where: { accountId },
    });
  }

  async createManyAccountRoles(
    data: Array<{ accountId: number; roleId: number }>,
  ) {
    return this.prisma.accountRole.createMany({
      data,
    });
  }

  async findPermissionsByNames(permissions: string[]) {
    return this.prisma.permission.findMany({
      where: {
        name: { in: permissions },
      },
    });
  }

  async deleteRolePermissions(roleId: number) {
    return this.prisma.rolePermission.deleteMany({
      where: { roleId },
    });
  }

  async createManyRolePermissions(
    data: Array<{ roleId: number; permissionId: number }>,
  ) {
    return this.prisma.rolePermission.createMany({
      data,
    });
  }

  async findAllPermissions() {
    return this.prisma.permission.findMany();
  }

  async findPermissionById(id: number) {
    return this.prisma.permission.findUnique({
      where: { id },
    });
  }

  async findMeetingMember(meetingId: string, userId: number) {
    return this.prisma.meetingMember.findFirst({
      where: {
        meetingId,
        userId,
      },
    });
  }
}

