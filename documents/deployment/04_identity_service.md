# Hướng dẫn Xây dựng Identity Service từ số 0

Tài liệu này hướng dẫn chi tiết từng bước xây dựng **Identity Microservice** (TCP port 3002) dùng để quản lý phiên đăng nhập và bảo mật cổng API.

---

## 1. Khởi chạy TCP Microservice: [main.ts](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/apps/identity/src/main.ts)

Sửa đổi file khởi chạy của ứng dụng `identity` để lắng nghe kết nối TCP port 3002:

```typescript
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { IdentityModule } from './identity.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    IdentityModule,
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0',
        port: parseInt(process.env.IDENTITY_SERVICE_PORT ?? '3002', 10),
      },
    },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen();
  console.log(`🚀 Identity Microservice is listening on TCP port ${process.env.IDENTITY_SERVICE_PORT ?? '3002'}`);
}
bootstrap();
```

---

## 2. Bước 2: Thiết lập Prisma và Module đăng ký: [identity.module.ts](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/apps/identity/src/identity.module.ts)

1. **Tạo Prisma Service cho Identity App:**
   Tương tự như Users Service, hãy tạo thư mục `apps/identity/src/prisma/` và viết file `prisma.service.ts` và `prisma.module.ts` giống như đã viết cho Users Service (xem lại tài liệu 02). Điều này giúp Identity Service có thể lưu trữ và kiểm tra Refresh Token trực tiếp trong cơ sở dữ liệu PostgreSQL.

    > [!NOTE]
    > Cần nhớ rằng, mặc dù `identity-service` có kết nối trực tiếp đến PostgreSQL qua Prisma, nó **không được phép** tự ý truy vấn hay thay đổi dữ liệu bảng `users` trực tiếp từ database. Mọi hoạt động liên quan đến dữ liệu người dùng phải được chuyển tiếp qua giao tiếp RPC TCP (`USERS_CLIENT`) sang `users-service`.

2. **Cấu hình Module Identity:**
   Sửa đổi file `apps/identity/src/identity.module.ts` để cấu hình `JwtModule` và `USERS_CLIENT`:

```typescript
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { JwtModule } from '@nestjs/jwt';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    JwtModule.register({}), // Sử dụng Dynamic sign để đổi secret giữa Access/Refresh Token
    ClientsModule.register([
      {
        name: 'USERS_CLIENT', // Kết nối sang Users Service để truy vấn/tạo user
        transport: Transport.TCP,
        options: {
          host: process.env.USERS_SERVICE_HOST ?? 'localhost',
          port: parseInt(process.env.USERS_SERVICE_PORT ?? '3001', 10),
        },
      },
    ]),
  ],
  controllers: [IdentityController],
  providers: [IdentityService],
})
export class IdentityModule {}
```

---

## 2.5. Tạo các Data Transfer Objects (DTO)

Tạo thư mục `apps/identity/src/dto/` và thêm hai file DTO sau để thực hiện validation dữ liệu đầu vào khi người dùng đăng ký hoặc đăng nhập qua microservice:

1. **DTO đăng ký tài khoản: [register.dto.ts](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/apps/identity/src/dto/register.dto.ts)**
   ```typescript
   import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

   export class RegisterDto {
     @IsEmail({}, { message: 'Invalid email format' })
     @IsNotEmpty({ message: 'Email is required' })
     email: string;

     @IsString()
     @IsNotEmpty({ message: 'Password is required' })
     @MinLength(6, { message: 'Password must be at least 6 characters long' })
     password: string;

     @IsString()
     @IsNotEmpty({ message: 'Name is required' })
     name: string;
   }
   ```

2. **DTO đăng nhập: [login.dto.ts](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/apps/identity/src/dto/login.dto.ts)**
   ```typescript
   import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

   export class LoginDto {
     @IsEmail({}, { message: 'Invalid email format' })
     @IsNotEmpty({ message: 'Email is required' })
     email: string;

     @IsString()
     @IsNotEmpty({ message: 'Password is required' })
     password: string;
   }
   ```

---

## 3. Bước 3: Lập trình Bộ xử lý Xác thực: [identity.service.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/identity/src/identity.service.ts)

Tạo file `apps/identity/src/identity.service.ts` để xử lý logic lưu trữ tài khoản `Account`, phân quyền, sinh JWT chứa danh sách Roles & Permissions, kiểm tra mật khẩu bằng `bcryptjs`, quản lý Refresh Token và đồng bộ sang `users-service`:

```typescript
import { Injectable, Inject, UnauthorizedException, ConflictException } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { JwtService } from '@nestjs/jwt';
import { firstValueFrom } from 'rxjs';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class IdentityService {
  constructor(
    @Inject('USERS_CLIENT') private readonly usersClient: ClientProxy,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async register(registerDto: RegisterDto) {
    try {
      // 1. Kiểm tra tài khoản tồn tại bên Identity Service
      const existing = await this.prisma.account.findUnique({ where: { email: registerDto.email } });
      if (existing) throw new ConflictException(`Account with email ${registerDto.email} already exists`);

      // 2. Băm mật khẩu
      const hashedPassword = await bcrypt.hash(registerDto.password, 10);

      // 3. Tạo Account mới
      const account = await this.prisma.account.create({
        data: {
          email: registerDto.email,
          password: hashedPassword,
        },
      });

      // 4. Gán Role mặc định là 'USER' cho Account
      let role = await this.prisma.role.findUnique({ where: { name: 'USER' } });
      if (!role) {
        role = await this.prisma.role.create({ data: { name: 'USER' } });
      }
      await this.prisma.accountRole.create({
        data: {
          accountId: account.id,
          roleId: role.id,
        },
      });

      // 5. Đồng bộ gọi Users Service tạo UserProfile qua TCP RPC
      const profile = await firstValueFrom(
        this.usersClient.send('create_user_profile', {
          id: account.id,
          name: registerDto.name,
          email: registerDto.email,
        }),
      );

      // 6. Lấy roles và permissions để đưa vào JWT
      const { roles, permissions } = await this.getAccountRolesAndPermissions(account.id);

      // 7. Tạo cặp Token (chứa cả list roles & permissions)
      const tokens = await this.generateTokens(account.id, account.email, roles, permissions);

      return {
        account: {
          id: account.id,
          email: account.email,
          profile,
        },
        ...tokens,
      };
    } catch (error) {
      throw new RpcException(error.message || 'Registration failed');
    }
  }

  async login(loginDto: LoginDto) {
    try {
      // 1. Tìm tài khoản trong database của Identity Service
      const account = await this.prisma.account.findUnique({ where: { email: loginDto.email } });
      if (!account) throw new UnauthorizedException('Invalid credentials');

      // 2. So sánh mật khẩu đã băm
      const isPasswordValid = await bcrypt.compare(loginDto.password, account.password);
      if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

      // 3. Lấy thông tin profile từ Users Service qua TCP RPC
      let profile = null;
      try {
        profile = await firstValueFrom(
          this.usersClient.send('find_one_profile', account.id),
        );
      } catch (e) {
        // Có thể profile chưa được tạo, bỏ qua để không làm gián đoạn login
      }

      // 4. Lấy danh sách Roles và Permissions của User
      const { roles, permissions } = await this.getAccountRolesAndPermissions(account.id);

      // 5. Tạo cặp Token
      const tokens = await this.generateTokens(account.id, account.email, roles, permissions);

      return {
        account: {
          id: account.id,
          email: account.email,
          profile,
        },
        ...tokens,
      };
    } catch (error) {
      throw new RpcException(error.message || 'Authentication failed');
    }
  }

  async refresh(token: string) {
    try {
      // Kiểm tra xem token có trong blacklist của Redis không
      const isBlacklisted = await this.redisService.has(`blacklist:${token}`);
      if (isBlacklisted) throw new UnauthorizedException('Token is blacklisted');

      // Xác thực refresh token
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_REFRESH_SECRET || 'refresh_secret_123',
      });

      const account = await this.prisma.account.findUnique({
        where: { id: payload.sub },
      });
      if (!account) throw new UnauthorizedException('Account not found');

      // Lấy danh sách Roles & Permissions mới nhất
      const { roles, permissions } = await this.getAccountRolesAndPermissions(account.id);

      // Ký và cấp Access Token mới ngắn hạn
      const accessToken = await this.jwtService.signAsync(
        {
          sub: account.id,
          email: account.email,
          roles,
          permissions,
        },
        {
          secret: process.env.JWT_SECRET || 'access_secret_123',
          expiresIn: '1h',
        },
      );

      return { accessToken };
    } catch (error) {
      throw new RpcException(error.message || 'Token refresh failed');
    }
  }

  async logout(token: string) {
    try {
      // Giải mã token để lấy exp và tính toán thời gian hết hạn
      const payload = this.jwtService.decode(token) as any;
      if (payload && payload.exp) {
        const currentTime = Math.floor(Date.now() / 1000);
        const remainingTime = payload.exp - currentTime;
        
        // TTL = remainingTime + 10 phút đệm an toàn (600 giây)
        const ttl = remainingTime > 0 ? remainingTime + 600 : 600;
        
        await this.redisService.set(`blacklist:${token}`, 'true', ttl);
      } else {
        await this.redisService.set(`blacklist:${token}`, 'true', 3600);
      }
      return { success: true, message: 'Logged out successfully' };
    } catch (error) {
      throw new RpcException(error.message || 'Logout failed');
    }
  }

  async validateToken(token: string) {
    try {
      // Kiểm tra xem token truy cập có bị chặn trong Redis không
      const isBlacklisted = await this.redisService.has(`blacklist:${token}`);
      if (isBlacklisted) throw new UnauthorizedException('Token is blacklisted');

      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'access_secret_123',
      });
      return {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles,
        permissions: payload.permissions,
      };
    } catch (error) {
      throw new RpcException('Invalid access token');
    }
  }

  private async getAccountRolesAndPermissions(accountId: number) {
    const accountRoles = await this.prisma.accountRole.findMany({
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
        secret: process.env.JWT_SECRET || 'access_secret_123',
        expiresIn: '1h',
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET || 'refresh_secret_123',
        expiresIn: '7d',
      }),
    ]);
    return { accessToken, refreshToken };
  }
}
```

Tạo file [identity.controller.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/identity/src/identity.controller.ts) để tiếp nhận cuộc gọi TCP:
```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { IdentityService } from './identity.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller()
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @MessagePattern('register')
  async register(@Payload() registerDto: RegisterDto) {
    return this.identityService.register(registerDto);
  }

  @MessagePattern('login')
  async login(@Payload() loginDto: LoginDto) {
    return this.identityService.login(loginDto);
  }

  @MessagePattern('refresh_token')
  async refresh(@Payload() payload: { token: string } | string) {
    const token = typeof payload === 'string' ? payload : payload.token;
    return this.identityService.refresh(token);
  }

  @MessagePattern('logout')
  async logout(@Payload() payload: { token: string } | string) {
    const token = typeof payload === 'string' ? payload : payload.token;
    return this.identityService.logout(token);
  }

  @MessagePattern('validate_token')
  async validateToken(@Payload() payload: { token: string } | string) {
    const token = typeof payload === 'string' ? payload : payload.token;
    return this.identityService.validateToken(token);
  }
}
```

---

## 4. Bước 4: Tạo Guard Bảo vệ tại API Gateway

Để API Gateway bảo vệ các endpoint bằng JWT, chúng ta cấu hình lớp xác thực trung gian.

1. **Tạo cấu trúc thư mục:** `apps/api-gateway/src/identity/` và `apps/api-gateway/src/identity/guards/`.
2. **Viết Module cấu hình kết nối TCP Identity Service: [identity.module.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/api-gateway/src/identity/identity.module.ts)**
   ```typescript
   import { Module } from '@nestjs/common';
   import { ClientsModule, Transport } from '@nestjs/microservices';
   import { IdentityController } from './identity.controller';
   import { IdentityService } from './identity.service';

   @Module({
     imports: [
       ClientsModule.register([
         {
           name: 'IDENTITY_CLIENT',
           transport: Transport.TCP,
           options: {
             host: process.env.IDENTITY_SERVICE_HOST ?? 'localhost',
             port: parseInt(process.env.IDENTITY_SERVICE_PORT ?? '3002', 10),
           },
         },
       ]),
     ],
     controllers: [IdentityController],
     providers: [IdentityService],
     exports: [IdentityService, ClientsModule], // Xuất bản để UsersModule sử dụng JwtIdentityGuard
   })
   export class IdentityModule {}
   ```

3. **Viết Client Service gửi token qua TCP: [identity.service.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/api-gateway/src/identity/identity.service.ts)**
   ```typescript
   import { Injectable, Inject } from '@nestjs/common';
   import { ClientProxy } from '@nestjs/microservices';

   @Injectable()
   export class IdentityService {
     constructor(@Inject('IDENTITY_CLIENT') private readonly identityClient: ClientProxy) {}

     register(registerDto: any) { return this.identityClient.send('register', registerDto); }
     login(loginDto: any) { return this.identityClient.send('login', loginDto); }
     refresh(token: string) { return this.identityClient.send('refresh_token', token); }
     logout(token: string) { return this.identityClient.send('logout', token); }
     validateToken(token: string) { return this.identityClient.send('validate_token', token); }
   }
   ```

4. **Viết Controller tiếp nhận HTTP Request từ Client: [identity.controller.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/api-gateway/src/identity/identity.controller.ts)**
   ```typescript
   import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
   import { IdentityService } from './identity.service';
   import { catchError, throwError } from 'rxjs';

   @Controller('identity')
   export class IdentityController {
     constructor(private readonly identityService: IdentityService) {}

     @Post('register')
     register(@Body() registerDto: any) {
       return this.identityService.register(registerDto).pipe(
         catchError((err) =>
           throwError(
             () => new HttpException(err?.message ?? 'Registration failed', HttpStatus.BAD_REQUEST)
           )
         );
       }

     @Post('login')
     login(@Body() loginDto: any) {
       return this.identityService.login(loginDto).pipe(
         catchError((err) =>
           throwError(
             () => new HttpException(err?.message ?? 'Authentication failed', HttpStatus.UNAUTHORIZED)
           )
         );
       }

     @Post('refresh')
     refresh(@Body('token') token: string) {
       return this.identityService.refresh(token).pipe(
         catchError((err) =>
           throwError(
             () => new HttpException(err?.message ?? 'Token refresh failed', HttpStatus.UNAUTHORIZED)
           )
         );
       }

     @Post('logout')
     logout(@Body('token') token: string) {
       return this.identityService.logout(token).pipe(
         catchError((err) =>
           throwError(
             () => new HttpException(err?.message ?? 'Logout failed', HttpStatus.BAD_REQUEST)
           )
         );
       }
   }
   ```

5. **Viết Guard xác thực Bearer Token: [jwt-identity.guard.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/api-gateway/src/identity/guards/jwt-identity.guard.ts)**
   ```typescript
   import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
   import { firstValueFrom } from 'rxjs';
   import { IdentityService } from '../identity.service';

   @Injectable()
   export class JwtIdentityGuard implements CanActivate {
     constructor(private readonly identityService: IdentityService) {}

     async canActivate(context: ExecutionContext): Promise<boolean> {
       const request = context.switchToHttp().getRequest();
       const authHeader = request.headers.authorization;
       if (!authHeader) throw new UnauthorizedException('Authorization header is missing');

       const [type, token] = authHeader.split(' ');
       if (type !== 'Bearer' || !token) throw new UnauthorizedException('Invalid authorization header format');

       try {
         // Gọi microservice Identity giải mã token qua TCP
         const user = await firstValueFrom(this.identityService.validateToken(token));
         request.user = user; // Lưu thông tin đăng nhập vào Request
         return true;
       } catch {
         throw new UnauthorizedException('Invalid or expired token');
       }
     }
   }
   ```

Bây giờ phần Backend đã hoàn chỉnh từ đầu. Ở bước tiếp theo, chúng ta khởi tạo và lập trình Frontend Next.js.
