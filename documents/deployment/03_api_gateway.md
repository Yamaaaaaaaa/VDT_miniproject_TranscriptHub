# Hướng dẫn Xây dựng API Gateway từ số 0

Tài liệu này hướng dẫn chi tiết từng bước lập trình **API Gateway** (HTTP port 3000) kết nối tới các microservice qua giao thức TCP.

---

## 1. Vai trò của API Gateway

API Gateway là ứng dụng chính (root project) đón tiếp các HTTP Request từ client bên ngoài, thực hiện xác thực và phân phối request tới các TCP microservice chạy ngầm bên trong.

---

## 2. Bước 1: Thiết lập Điểm khởi chạy HTTP: [main.ts](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/apps/api-gateway/src/main.ts)

Sửa đổi file `apps/api-gateway/src/main.ts` của ứng dụng Gateway như sau:

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ApiGatewayModule } from './api-gateway.module';

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule);

  // 1. Cấu hình CORS cho phép mọi nguồn gốc kết nối (Cần thiết khi FE và BE chạy khác cổng)
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // 2. Validate dữ liệu JSON gửi lên từ client
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 3. Đặt tiền tố chung cho tất cả các endpoint là /api
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🌐 API Gateway is running on: http://localhost:${port}/api`);
}
bootstrap();
```

---

## 3. Bước 2: Tạo Module đăng ký kết nối TCP: [users.module.ts](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/apps/api-gateway/src/users/users.module.ts)

Tạo thư mục `apps/api-gateway/src/users/` và viết file module đăng ký dịch vụ `USERS_CLIENT`:

```typescript
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { IdentityModule } from '../identity/identity.module'; // Dùng để xác thực JWT ở bước sau

@Module({
  imports: [
    IdentityModule,
    // Đăng ký cổng kết nối qua TCP microservice
    ClientsModule.register([
      {
        name: 'USERS_CLIENT',
        transport: Transport.TCP,
        options: {
          host: process.env.USERS_SERVICE_HOST ?? 'localhost',
          port: parseInt(process.env.USERS_SERVICE_PORT ?? '3001', 10),
        },
      },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
```

---

## 4. Bước 3: Lập trình Proxy Service gọi TCP: [users.service.ts](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/apps/api-gateway/src/users/users.service.ts)

Tạo service trung gian nhận lệnh từ controller và gọi microservice sử dụng đối tượng `ClientProxy`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Observable, catchError, throwError } from 'rxjs';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    @Inject('USERS_CLIENT') private readonly usersClient: ClientProxy,
  ) {}

  findAll(): Observable<any> {
    // Send message pattern 'find_all_profiles' đến users service qua mạng TCP
    return this.usersClient
      .send('find_all_profiles', {})
      .pipe(catchError((err) => throwError(() => err)));
  }

  findOne(id: number): Observable<any> {
    return this.usersClient
      .send('find_one_profile', id)
      .pipe(catchError((err) => throwError(() => err)));
  }

  create(createUserProfileDto: CreateUserProfileDto): Observable<any> {
    return this.usersClient
      .send('create_user_profile', createUserProfileDto)
      .pipe(catchError((err) => throwError(() => err)));
  }

  update(id: number, updateUserProfileDto: UpdateUserProfileDto): Observable<any> {
    return this.usersClient
      .send('update_user_profile', { id, updateUserProfileDto })
      .pipe(catchError((err) => throwError(() => err)));
  }

  remove(id: number): Observable<any> {
    return this.usersClient
      .send('delete_user_profile', id)
      .pipe(catchError((err) => throwError(() => err)));
  }
}
```

---

## 5. Bước 4: Lập trình HTTP REST Controller: [users.controller.ts](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/apps/api-gateway/src/users/users.controller.ts)

Viết controller định nghĩa các API endpoint HTTP. Do các API này nhạy cảm, chúng ta bảo mật bằng `@UseGuards(JwtAuthGuard)`.
Đồng thời, ta cần chuyển đổi lỗi của giao tiếp mạng TCP (RPC) sang HTTP Exception để trả lại mã lỗi chuẩn (như `404 Not Found` hoặc `400 Bad Request`):

```typescript
import {
  Controller, Get, Post, Patch, Delete, Param, Body,
  ParseIntPipe, HttpException, HttpStatus, UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { catchError, throwError } from 'rxjs';
import { JwtIdentityGuard } from '../identity/guards/jwt-identity.guard'; // Sẽ tạo ở bước sau

@UseGuards(JwtIdentityGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll().pipe(
      catchError((err) =>
        throwError(
          () => new HttpException(err?.message ?? 'Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
        )
      )
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id).pipe(
      catchError((err) =>
        throwError(
          () => new HttpException(err?.message ?? 'User profile not found', HttpStatus.NOT_FOUND)
        )
      )
    );
  }

  @Post()
  create(@Body() createUserProfileDto: CreateUserProfileDto) {
    return this.usersService.create(createUserProfileDto).pipe(
      catchError((err) =>
        throwError(
          () => new HttpException(err?.message ?? 'Failed to create user profile', HttpStatus.BAD_REQUEST)
        )
      )
    );
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateUserProfileDto: UpdateUserProfileDto) {
    return this.usersService.update(id, updateUserProfileDto).pipe(
      catchError((err) =>
        throwError(
          () => new HttpException(err?.message ?? 'Failed to update user profile', HttpStatus.BAD_REQUEST)
        )
      )
    );
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(id).pipe(
      catchError((err) =>
        throwError(
          () => new HttpException(err?.message ?? 'Failed to delete user profile', HttpStatus.BAD_REQUEST)
        )
      )
    );
  }
}
```

---

## 6. Bước 5: Đăng ký Router Module chính: [api-gateway.module.ts](file:///d:/VDT/VDT_miniproject_TranscriptHub/services_ms/apps/api-gateway/src/api-gateway.module.ts)

Sửa đổi file module gốc để import `UsersModule` và `AuthModule`:

```typescript
import { Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';
import { IdentityModule } from './identity/identity.module';

@Module({
  imports: [UsersModule, IdentityModule],
  controllers: [],
  providers: [],
})
export class ApiGatewayModule {}
```

Bây giờ API Gateway đã sẵn sàng tiếp nhận HTTP request và gửi tin nhắn TCP sang Users Service. Bước tiếp theo, chúng ta xây dựng Identity Service để xử lý xác thực tài khoản và phân phối JWT Token.
