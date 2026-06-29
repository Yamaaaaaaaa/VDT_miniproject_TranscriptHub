# Hướng dẫn Xây dựng Users Service từ số 0

Tài liệu này hướng dẫn chi tiết từng bước tích hợp cơ sở dữ liệu **Prisma ORM** và viết mã nguồn cho **Users Microservice** (TCP port 3001) hoạt động độc lập trong cấu trúc monorepo.

---

## 1. Bước 1: Khởi tạo Cơ sở Dữ liệu Prisma

Prisma ORM là công cụ giao tiếp cơ sở dữ liệu (Database Client) mạnh mẽ. Để thiết lập Prisma từ đầu:

1. **Khởi tạo Prisma trong dự án backend `services_ms`:**
   ```bash
   npx prisma init
   ```
   *Lệnh này sẽ tạo ra một thư mục `prisma/` chứa file cấu hình `schema.prisma`.*

2. **Cấu hình dynamic datasource URL (`prisma.config.ts`):**
   Trong các phiên bản Prisma mới, để đọc biến môi trường kết nối động khi build container, chúng ta tạo file [prisma.config.ts](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/prisma.config.ts) tại thư mục gốc của `services_ms`:
   ```typescript
   import "dotenv/config";
   import { defineConfig } from "prisma/config";

   export default defineConfig({
     schema: "prisma/schema.prisma",
     migrations: {
       path: "prisma/migrations",
     },
     datasource: {
       url: process.env["DATABASE_URL"],
     },
   });
   ```

3. **Viết Định nghĩa Schema: [schema.prisma](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/prisma/schema.prisma)**
   Mở file `prisma/schema.prisma` và thiết lập các model cho việc phân tách thông tin xác thực/quyền (`Account`, `Role`, `Permission`) và thông tin hồ sơ người dùng (`UserProfile`):
   ```prisma
   generator client {
     provider        = "prisma-client-js"
     previewFeatures = ["multiSchema"]
   }

   datasource db {
     provider = "postgresql"
     schemas  = ["identity", "users"]
     // URL kết nối động được nạp qua cấu hình prisma.config.ts bên trên
   }

   // Tài khoản đăng nhập (do Identity Service quản lý)
   model Account {
     id            Int            @id @default(autoincrement())
     email         String         @unique
     password      String         // Mật khẩu đã băm bảo mật
     createdAt     DateTime       @default(now())
     updatedAt     DateTime       @updatedAt
     roles         AccountRole[]
     profile       UserProfile?

     @@map("accounts")
     @@schema("identity")
   }

   // Vai trò của người dùng (do Identity Service quản lý)
   model Role {
     id          Int              @id @default(autoincrement())
     name        String           @unique // Ví dụ: ADMIN, USER
     permissions RolePermission[]
     accounts    AccountRole[]

     @@map("roles")
     @@schema("identity")
   }

   // Quyền hạn chi tiết (do Identity Service quản lý)
   model Permission {
     id    Int              @id @default(autoincrement())
     name  String           @unique // Ví dụ: edit_profile, read_transcripts
     roles RolePermission[]

     @@map("permissions")
     @@schema("identity")
   }

   // Bảng trung gian phân vai trò cho tài khoản
   model AccountRole {
     accountId Int
     roleId    Int
     account   Account @relation(fields: [accountId], references: [id], onDelete: Cascade)
     role      Role    @relation(fields: [roleId], references: [id], onDelete: Cascade)

     @@id([accountId, roleId])
     @@map("account_roles")
     @@schema("identity")
   }

   // Bảng trung gian phân quyền cho vai trò
   model RolePermission {
     roleId       Int
     permissionId Int
     role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
     permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

     @@id([roleId, permissionId])
     @@map("role_permissions")
     @@schema("identity")
   }

   // Hồ sơ thông tin người dùng (do Users Service quản lý độc quyền)
   model UserProfile {
     id        Int      @id // Khớp 1-1 với Account.id
     account   Account  @relation(fields: [id], references: [id], onDelete: Cascade)
     name      String
     email     String   @unique
     phone     String?
     avatar    String?
     bio       String?
     createdAt DateTime @default(now())
     updatedAt DateTime @updatedAt

     @@map("user_profiles")
     @@schema("users")
   }
   ```

> [!NOTE]
> **Phân chia trách nhiệm cơ sở dữ liệu:**
> * `users-service` chịu trách nhiệm độc quyền đọc/ghi trên bảng **`user_profiles`** (hồ sơ người dùng).
> * `identity-service` quản lý các bảng liên quan đến xác thực và phân quyền: **`accounts`**, **`roles`**, **`permissions`**, **`account_roles`**, **`role_permissions`**.
> * Hai dịch vụ tuyệt đối không được tự ý viết code truy vấn trực tiếp bảng của nhau mà phải đi qua cổng giao tiếp mạng (RPC TCP).

---

## 2. Bước 2: Tạo Prisma Module & Service trong Users App

Chúng ta cần viết một module riêng để khởi tạo kết nối database PostgreSQL thông qua Connection Pool.

1. **Tạo thư mục:** `apps/users/src/prisma/`.
2. **Viết tệp [prisma.service.ts](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/apps/users/src/prisma/prisma.service.ts):**
   ```typescript
   import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
   import { PrismaClient } from '@prisma/client';
   import { PrismaPg } from '@prisma/adapter-pg';
   import { Pool } from 'pg';

   @Injectable()
   export class PrismaService
     extends PrismaClient
     implements OnModuleInit, OnModuleDestroy
   {
     constructor() {
       // Khởi tạo Connection Pool dùng thư viện 'pg'
       const pool = new Pool({
         connectionString: process.env.DATABASE_URL,
       });
       const adapter = new PrismaPg(pool);

       super({ adapter });
     }

     async onModuleInit() {
       await this.$connect();
       console.log('📦 Prisma connected to PostgreSQL');
     }

     async onModuleDestroy() {
       await this.$disconnect();
     }
   }
   ```
3. **Viết tệp [prisma.module.ts](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/apps/users/src/prisma/prisma.module.ts):**
   ```typescript
   import { Module } from '@nestjs/common';
   import { PrismaService } from './prisma.service';

   @Module({
     providers: [PrismaService],
     exports: [PrismaService], // Export để các service khác có thể gọi DB
   })
   export class PrismaModule {}
   ```

---

## 3. Bước 3: Cấu hình Khởi chạy TCP Microservice: [main.ts](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/apps/users/src/main.ts)

Sửa đổi file khởi chạy của ứng dụng `users` để lắng nghe kết nối TCP port 3001 thay vì HTTP REST API:

```typescript
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { UsersModule } from './users.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    UsersModule,
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0', // Lắng nghe trên tất cả các card mạng
        port: 3001,      // Port giao tiếp TCP
      },
    },
  );

  // Validate tự động DTO nhận qua TCP
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen();
  console.log('🚀 Users Microservice is listening on TCP port 3001');
}
bootstrap();
```

Cập nhật file [users.module.ts](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/apps/users/src/users.module.ts) để import `PrismaModule`:
```typescript
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
```

---

## 4. Bước 4: Tạo DTOs cho các Request

Tạo thư mục `apps/users/src/dto/` và tạo các file sau:

1. **[create-user-profile.dto.ts](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/apps/users/src/dto/create-user-profile.dto.ts):**
   ```typescript
   import { IsEmail, IsNotEmpty, IsNumber, IsString } from 'class-validator';

   export class CreateUserProfileDto {
     @IsNumber()
     @IsNotEmpty()
     id: number; // ID đồng bộ từ Account.id bên Identity Service

     @IsString()
     @IsNotEmpty()
     name: string;

     @IsEmail()
     email: string;
   }
   ```
2. **[update-user-profile.dto.ts](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/apps/users/src/dto/update-user-profile.dto.ts):**
   ```typescript
   import { IsOptional, IsString } from 'class-validator';

   export class UpdateUserProfileDto {
     @IsString()
     @IsOptional()
     name?: string;

     @IsString()
     @IsOptional()
     phone?: string;

     @IsString()
     @IsOptional()
     avatar?: string;

     @IsString()
     @IsOptional()
     bio?: string;
   }
   ```

---

## 5. Bước 5: Lập trình Logic xử lý dữ liệu

### 5.1. Viết [users.service.ts](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/apps/users/src/users.service.ts)
Dùng Prisma Service để quản lý thông tin hồ sơ `UserProfile` (không xử lý mật khẩu hay bảo mật):

```typescript
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.userProfile.findMany();
  }

  async findOne(id: number) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { id },
    });
    if (!profile) throw new NotFoundException(`User profile with id ${id} not found`);
    return profile;
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
```

### 5.2. Viết [users.controller.ts](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/apps/users/src/users.controller.ts)
Gắn các nhãn tin nhắn `@MessagePattern` để tiếp nhận cuộc gọi TCP điều phối dữ liệu profile từ API Gateway hoặc Identity Service:

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { UsersService } from './users.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @MessagePattern('find_all_profiles')
  async findAll() {
    try {
      return await this.usersService.findAll();
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('find_one_profile')
  async findOne(@Payload() id: number) {
    try {
      return await this.usersService.findOne(Number(id));
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('find_profile_by_email')
  async findByEmail(@Payload() email: string) {
    try {
      return await this.usersService.findByEmail(email);
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('create_user_profile')
  async create(@Payload() createUserProfileDto: CreateUserProfileDto) {
    try {
      return await this.usersService.create(createUserProfileDto);
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('update_user_profile')
  async update(@Payload() payload: { id: number; updateUserProfileDto: UpdateUserProfileDto }) {
    try {
      return await this.usersService.update(Number(payload.id), payload.updateUserProfileDto);
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('delete_user_profile')
  async remove(@Payload() id: number) {
    try {
      return await this.usersService.remove(Number(id));
    } catch (error) {
      throw new RpcException(error.message);
    }
  }
}
```

---

## 6. Bước 6: Đẩy Database và Chạy thử nghiệm Local

1. Khởi động PostgreSQL local (xem lại tài liệu 01).
2. Tạo các bảng dữ liệu bằng lệnh Prisma:
   ```bash
   npx prisma db push
   ```
3. Sinh Prisma Client để đồng bộ kiểu dữ liệu local:
   ```bash
   npx prisma generate
   ```
4. Khởi chạy microservice ở chế độ dev:
   ```bash
   npm run start:dev users
   ```
   Nếu màn hình hiện log: `🚀 Users Microservice is listening on TCP port 3001` tức là bạn đã thiết lập thành công.
