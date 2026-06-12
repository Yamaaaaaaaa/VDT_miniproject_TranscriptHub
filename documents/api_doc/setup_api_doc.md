# Hướng dẫn Thiết lập API Documentation (Swagger) từ số 0

Tài liệu này hướng dẫn chi tiết các bước thiết lập, cấu hình và sử dụng **Swagger API Documentation** trên dịch vụ API Gateway trong hệ thống NestJS Monorepo của TranscriptHub.

---

## 1. Tổng quan Kiến trúc Swagger trong Monorepo

Trong hệ thống microservices:
- Các dịch vụ nội bộ như `users-service` và `identity-service` giao tiếp với nhau bằng giao thức **TCP RPC** và không có các endpoint HTTP công khai.
- **API Gateway** đóng vai trò là điểm đầu vào (Entrypoint) HTTP duy nhất, tiếp nhận và chuyển tiếp các yêu cầu từ phía client (Next.js FE, Mobile App, v.v.).
- Do đó, **Swagger** chỉ cần được cài đặt và cấu hình trực tiếp tại dự án **API Gateway** để tự động thu thập và hiển thị tài liệu cho tất cả các HTTP endpoint công khai.

---

## 2. Các bước Cài đặt và Thiết lập

### Bước 1: Cài đặt các Thư viện cần thiết
Tại thư mục gốc của backend `services_ms`, chạy lệnh cài đặt Swagger:
```bash
npm install @nestjs/swagger swagger-ui-express
```

### Bước 2: Khởi tạo SwaggerModule trong API Gateway
Mở tệp [main.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/api-gateway/src/main.ts) của API Gateway và bổ sung cấu hình khởi tạo Swagger:

```typescript
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiGatewayModule } from './api-gateway.module';

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule);

  // Cấu hình Prefix mặc định cho các API
  app.setGlobalPrefix('api');

  // Khởi tạo tài liệu Swagger
  const config = new DocumentBuilder()
    .setTitle('TranscriptHub API Documentation')
    .setDescription('Tài liệu API hệ thống microservices của TranscriptHub')
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      name: 'JWT',
      description: 'Nhập mã token Access JWT để xác thực các endpoint bảo mật',
      in: 'header',
    })
    .build();

  const document = SwaggerModule.createDocument(app, config);
  
  // Thiết lập đường dẫn tài liệu tại: /api/docs
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

---

## 3. Cấu hình DTOs (Data Transfer Objects) với Swagger

Để Swagger tự động nhận diện và hiển thị cấu hình (Schema) của dữ liệu yêu cầu gửi lên, chúng ta cần khai báo các thuộc tính sử dụng decorator `@ApiProperty()` từ `@nestjs/swagger`.

### Ví dụ DTO Đăng ký: [register.dto.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/api-gateway/src/identity/dto/register.dto.ts)
```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
    @ApiProperty({
        description: 'Địa chỉ email đăng ký tài khoản',
        example: 'user@example.com',
    })
    @IsEmail({}, { message: 'Định dạng email không hợp lệ' })
    @IsNotEmpty({ message: 'Email là bắt buộc' })
    email: string;

    @ApiProperty({
        description: 'Mật khẩu tài khoản (tối thiểu 6 ký tự)',
        example: 'password123',
        minLength: 6,
    })
    @IsString()
    @IsNotEmpty({ message: 'Mật khẩu là bắt buộc' })
    @MinLength(6, { message: 'Mật khẩu phải dài tối thiểu 6 ký tự' })
    password: string;

    @ApiProperty({
        description: 'Tên hiển thị của người dùng',
        example: 'Nguyễn Văn A',
    })
    @IsString()
    @IsNotEmpty({ message: 'Tên là bắt buộc' })
    name: string;
}
```

---

## 4. Tích hợp Decorator trong Controllers

Các decorator quan trọng dùng trong các Controller của API Gateway để phân loại và làm đẹp tài liệu:
- `@ApiTags('Name')`: Nhóm các endpoint liên quan vào một danh mục (ví dụ: `Identity`, `Users`).
- `@ApiBearerAuth()`: Đánh dấu nhóm endpoint yêu cầu xác thực bằng mã token JWT Bearer.
- `@ApiOperation({ summary: 'Mô tả ngắn' })`: Ghi chú chức năng của api cụ thể.
- `@ApiResponse({ status: code, description: 'Mô tả phản hồi' })`: Đặc tả các mã phản hồi HTTP trả về.

### Ví dụ về UserController: [users.controller.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/services_ms/apps/api-gateway/src/users/users.controller.ts)
```typescript
import { Controller, Get, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtIdentityGuard } from '../identity/guards/jwt-identity.guard';

@ApiTags('Users')          // Nhóm vào danh mục "Users" trên UI
@ApiBearerAuth()           // Yêu cầu xác thực Bearer Token
@UseGuards(JwtIdentityGuard)
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get(':id')
    @ApiOperation({ summary: 'Lấy thông tin hồ sơ người dùng theo ID' })
    @ApiResponse({ status: 200, description: 'Lấy dữ liệu thành công.' })
    @ApiResponse({ status: 404, description: 'Không tìm thấy hồ sơ người dùng.' })
    @ApiResponse({ status: 401, description: 'Không có quyền truy cập (chưa xác thực).' })
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.usersService.findOne(id);
    }
}
```

---

## 5. Hướng dẫn Sử dụng và Kiểm tra API

### Bước 1: Khởi động hệ thống
Khởi động docker-compose bình thường:
```bash
docker compose up -d
```

### Bước 2: Truy cập Swagger UI
Mở trình duyệt web của bạn và truy cập địa chỉ:
👉 **[http://localhost:3000/api/docs](http://localhost:3000/api/docs)**

### Bước 3: Đăng nhập và Lấy mã Token (Authorize)
1. Tại danh mục **Identity**, mở api `POST /api/identity/login`.
2. Click chọn **Try it out**, sửa thông tin tài khoản seed mẫu:
   ```json
   {
     "email": "admin@gmail.com",
     "password": "admin123"
   }
   ```
3. Nhấn **Execute**.
4. Sao chép chuỗi mã `accessToken` trong kết quả JSON trả về.
5. Cuộn lên đầu trang, click nút **Authorize** (ở góc trên bên phải).
6. Dán chuỗi mã `accessToken` vừa sao chép vào ô dữ liệu và nhấn **Authorize**, sau đó nhấn **Close**.
7. Bây giờ bạn có thể trực tiếp thực thi thử nghiệm bất kỳ API bảo mật nào thuộc nhóm **Users** (ví dụ: `GET /api/users`) mà không gặp lỗi `401 Unauthorized` nữa!
