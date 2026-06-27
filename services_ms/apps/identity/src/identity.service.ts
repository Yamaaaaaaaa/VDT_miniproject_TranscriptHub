import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { IdentityRepository } from './repositories/identity.repository';
import { UserGateway } from './gateways/user.gateway';
import { RedisService } from './redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AppException, ErrorCodes } from '../../../libs/common/src/exceptions/error-code';

@Injectable()
export class IdentityService {
  constructor(
    private readonly identityRepo: IdentityRepository,
    private readonly userGateway: UserGateway,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    // 1. Kiểm tra tài khoản tồn tại bên Identity Service via Repository
    const existing = await this.identityRepo.findAccountByEmail(
      registerDto.email,
    );
    if (existing)
      throw new AppException(
        ErrorCodes.EMAIL_EXISTED,
        `Account with email ${registerDto.email} already exists`,
      );

    // 2. Băm mật khẩu
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // 3. Tạo Account mới via Repository
    const account = await this.identityRepo.createAccount({
      email: registerDto.email,
      password: hashedPassword,
    });

    // 4. Gán Role mặc định là 'USER' cho Account
    let role = await this.identityRepo.findRoleByName('USER');
    if (!role) {
      role = await this.identityRepo.createRole('USER');
    }
    await this.identityRepo.createAccountRole(account.id, role.id);

    // 5. Đồng bộ gọi Users Service tạo UserProfile via UserGateway
    const profile = await this.userGateway.createUserProfile(
      account.id,
      registerDto.name,
      registerDto.email,
    );

    // 6. Lấy roles và permissions để đưa vào JWT
    const { roles, permissions } = await this.getAccountRolesAndPermissions(
      account.id,
    );

    // 7. Tạo cặp Token (chứa cả list roles & permissions)
    const tokens = await this.generateTokens(
      account.id,
      account.email,
      roles,
      permissions,
    );

    return {
      account: {
        id: account.id,
        email: account.email,
        profile,
      },
      ...tokens,
    };
  }

  async login(loginDto: LoginDto) {
    // 1. Tìm tài khoản trong database của Identity Service via Repository
    const account = await this.identityRepo.findAccountByEmail(
      loginDto.email,
    );
    if (!account) throw new AppException(ErrorCodes.UNAUTHENTICATED, 'Invalid credentials');

    // 2. So sánh mật khẩu đã băm
    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      account.password,
    );
    if (!isPasswordValid)
      throw new AppException(ErrorCodes.UNAUTHENTICATED, 'Invalid credentials');

    // 3. Lấy thông tin profile từ Users Service via UserGateway
    let profile = null;
    try {
      profile = await this.userGateway.findOneProfile(account.id);
    } catch (e) {
      // Có thể profile chưa được tạo, bỏ qua để không làm gián đoạn login
    }

    // 4. Lấy danh sách Roles và Permissions của User
    const { roles, permissions } = await this.getAccountRolesAndPermissions(
      account.id,
    );

    // 5. Tạo cặp Token
    const tokens = await this.generateTokens(
      account.id,
      account.email,
      roles,
      permissions,
    );

    return {
      account: {
        id: account.id,
        email: account.email,
        profile,
      },
      ...tokens,
    };
  }

  async refresh(token: string) {
    // Kiểm tra Redis blacklist xem token đã bị vô hiệu hóa chưa
    const isBlacklisted = await this.redisService.has(`blacklist:${token}`);
    if (isBlacklisted) {
      throw new AppException(ErrorCodes.UNAUTHENTICATED, 'Token is blacklisted');
    }

    // Xác thực refresh token
    const payload = await this.jwtService.verifyAsync(token, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'refresh_secret_123'),
    });

    const account = await this.identityRepo.findAccountById(payload.sub);
    if (!account) throw new AppException(ErrorCodes.UNAUTHENTICATED, 'Account not found');

    // Lấy danh sách Roles & Permissions mới nhất
    const { roles, permissions } = await this.getAccountRolesAndPermissions(
      account.id,
    );

    // Ký và cấp Access Token mới ngắn hạn
    const accessToken = await this.jwtService.signAsync(
      {
        sub: account.id,
        email: account.email,
        roles,
        permissions,
      },
      {
        secret: this.configService.get<string>('JWT_SECRET', 'access_secret_123'),
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m') as any,
      },
    );

    return { accessToken };
  }

  async logout(token: string) {
    // Giải mã token để tính toán thời gian sống còn lại
    const payload = this.jwtService.decode(token);
    if (payload && payload.exp) {
      const currentTime = Math.floor(Date.now() / 1000);
      const remainingTime = payload.exp - currentTime;

      // TTL = remainingTime + thời gian đệm an toàn (10 phút = 600 giây)
      const ttl = remainingTime > 0 ? remainingTime + 600 : 600;

      await this.redisService.set(`blacklist:${token}`, 'true', ttl);
    } else {
      // Fallback TTL 1 giờ nếu không decode được exp
      await this.redisService.set(`blacklist:${token}`, 'true', 3600);
    }

    return { success: true, message: 'Logged out successfully' };
  }

  async validateToken(token: string) {
    // Kiểm tra xem token truy cập có nằm trong blacklist của Redis không
    const isBlacklisted = await this.redisService.has(`blacklist:${token}`);
    if (isBlacklisted) {
      throw new AppException(ErrorCodes.UNAUTHENTICATED, 'Token is blacklisted');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET', 'access_secret_123'),
      });
      return {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles,
        permissions: payload.permissions,
      };
    } catch (error) {
      throw new AppException(ErrorCodes.UNAUTHENTICATED, 'Invalid access token');
    }
  }

  private async getAccountRolesAndPermissions(accountId: number) {
    const accountRoles =
      await this.identityRepo.findAccountRolesAndPermissions(accountId);

    const roles = accountRoles.map((ar) => ar.role.name);
    const permissions = accountRoles.flatMap((ar) =>
      ar.role.permissions.map((rp) => rp.permission.name),
    );

    return { roles, permissions };
  }

  private async generateTokens(
    accountId: number,
    email: string,
    roles: string[],
    permissions: string[],
  ) {
    const payload = { sub: accountId, email, roles, permissions };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET', 'access_secret_123'),
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m') as any,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'refresh_secret_123'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d') as any,
      }),
    ]);
    return { accessToken, refreshToken };
  }

  // --- Roles APIs ---
  async findAllRoles() {
    return this.identityRepo.findAllRoles();
  }

  async findOneRole(id: number) {
    const role = await this.identityRepo.findRoleById(id);
    if (!role) {
      throw new AppException(ErrorCodes.ROLE_NOT_FOUND, `Role with ID ${id} not found`);
    }
    return role;
  }

  async createRole(name: string) {
    const existing = await this.identityRepo.findRoleByName(name);
    if (existing) {
      throw new AppException(ErrorCodes.ROLE_NAME_EXISTED, `Role with name ${name} already exists`);
    }
    return this.identityRepo.createRole(name);
  }

  async updateRole(id: number, name: string) {
    await this.findOneRole(id);

    if (name) {
      const existing = await this.identityRepo.findRoleByOtherName(name, id);
      if (existing) {
        throw new AppException(ErrorCodes.ROLE_NAME_EXISTED, `Role with name ${name} already exists`);
      }
    }

    return this.identityRepo.updateRole(id, name);
  }

  async deleteRole(id: number) {
    await this.findOneRole(id);
    return this.identityRepo.deleteRole(id);
  }

  async deleteAccount(id: number, requesterId?: number) {
    if (requesterId && id === requesterId) {
      throw new AppException(ErrorCodes.INVALID_ACTION, 'You cannot delete your own account');
    }
    const account = await this.identityRepo.findAccountById(id);
    if (!account) {
      throw new AppException(ErrorCodes.USER_NOT_EXISTED, `Account with ID ${id} not found`);
    }
    await this.identityRepo.deleteAccount(id);
    return {
      message: `Account and associated data for user ${id} deleted successfully`,
    };
  }

  async updateUserRoles(userId: number, roleNames: string[]) {
    const account = await this.identityRepo.findAccountById(userId);
    if (!account) {
      throw new AppException(ErrorCodes.USER_NOT_EXISTED, `Account with ID ${userId} not found`);
    }

    const roles = await this.identityRepo.findRolesByNames(roleNames);

    await this.identityRepo.deleteAccountRoles(userId);

    if (roles.length > 0) {
      const data = roles.map((r) => ({
        accountId: userId,
        roleId: r.id,
      }));
      await this.identityRepo.createManyAccountRoles(data);
    }

    return this.getAccountRolesAndPermissions(userId);
  }

  async updateRolePermissions(roleId: number, permissions: string[]) {
    await this.findOneRole(roleId);

    const validPermissions =
      await this.identityRepo.findPermissionsByNames(permissions);

    await this.identityRepo.deleteRolePermissions(roleId);

    if (validPermissions.length > 0) {
      const data = validPermissions.map((p) => ({
        roleId,
        permissionId: p.id,
      }));
      await this.identityRepo.createManyRolePermissions(data);
    }

    return this.findOneRole(roleId);
  }

  // --- Permissions APIs ---
  async findAllPermissions() {
    return this.identityRepo.findAllPermissions();
  }

  async findOnePermission(id: number) {
    const permission = await this.identityRepo.findPermissionById(id);
    if (!permission) {
      throw new AppException(ErrorCodes.UNCATEGORIZED_EXCEPTION, `Permission with ID ${id} not found`);
    }
    return permission;
  }

  async getMeetingRole(meetingId: string, userId: number) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(meetingId)) {
      throw new AppException(ErrorCodes.MEMBER_NOT_FOUND, 'Invalid meeting ID format');
    }

    const member = await this.identityRepo.findMeetingMember(meetingId, userId);
    if (!member) {
      throw new AppException(ErrorCodes.MEMBER_NOT_FOUND, `User is not a member of this meeting`);
    }
    return member.role;
  }
}
