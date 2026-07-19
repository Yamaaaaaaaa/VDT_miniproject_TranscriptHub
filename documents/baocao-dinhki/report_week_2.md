# BÁO CÁO TUẦN 2

## MỤC LỤC

- [NỘI DUNG TỔNG HỢP](#nội-dung-tổng-hợp)
- [PHẦN 1: LỘ TRÌNH HỌC TẬP](#phần-1-lộ-trình-học-tập)
- [PHẦN 2: TIẾN ĐỘ DỰ ÁN TRANSCRIPTHUB](#phần-2-tiến-độ-dự-án-transcripthub)
  - [2.1 Identity Service — Xác thực & Phân quyền](#21-identity-service--xác-thực--phân-quyền)
  - [2.2 Users Service — Quản lý hồ sơ người dùng](#22-users-service--quản-lý-hồ-sơ-người-dùng)
  - [2.3 API Gateway — Cổng vào hệ thống](#23-api-gateway--cổng-vào-hệ-thống)
  - [2.4 Thư viện dùng chung (libs/common)](#24-thư-viện-dùng-chung-libscommon)

---

## NỘI DUNG TỔNG HỢP

Tuần 2 tập trung vào hai mảng song song:

**Phần học tập (3 buổi):**
- **Agile Software Development:** Hiểu rõ quy trình phát triển phần mềm theo phương pháp linh hoạt, vai trò các thành viên (Scrum Master, Product Owner, Dev Team) và cách áp dụng công cụ quản lý như Jira, GitHub Projects.
- **Phân tích & Thiết kế hệ thống:** Từ Problem Framing cho đến API Contract Design, Data Design và nguyên tắc Reliability/Security/Observability by Design.
- **AI Agent trong PTPM:** Tìm hiểu kiến trúc Agent, các pattern orchestration và cách tích hợp công cụ như Claude Code, GitHub Copilot, Cursor vào quy trình phát triển thực tế.

**Phần dự án:** Triển khai lớp **xác thực & cổng giao tiếp** của hệ thống TranscriptHub — bao gồm Identity Service (JWT, bcrypt, RBAC), Users Service, API Gateway (HTTP + Swagger) và thư viện `libs/common` dùng chung.

---

## PHẦN 1: LỘ TRÌNH HỌC TẬP

| Buổi học | Môn học / Chủ đề | Nội dung chi tiết |
|----------|-----------------|-------------------|
| **Buổi 1** | Agile Software Development | - Giới thiệu các mô hình phát triển phần mềm: Waterfall, Scrum, Kanban, XP. <br>- Tổng quan phương pháp Agile: giá trị cốt lõi (Agile Manifesto), 12 nguyên tắc. <br>- Vai trò trong dự án Agile: Product Owner, Scrum Master, Development Team. <br>- Các ceremony: Sprint Planning, Daily Standup, Sprint Review, Retrospective. <br>- Công cụ thực tế: Jira, GitHub Projects, Confluence. <br>- Thực hành: Lên kế hoạch Sprint đầu tiên cho dự án TranscriptHub. |
| **Buổi 2** | Phân tích & Thiết kế hệ thống | - Problem Framing & Scope: Xác định bài toán, stakeholder và ranh giới hệ thống. <br>- Requirements Engineering: Phân loại yêu cầu chức năng (FR) và phi chức năng (NFR). <br>- Mô hình hóa hệ thống (Just Enough UML): Use Case, Sequence, Component Diagram. <br>- System Decomposition & kiến trúc mức cao: Microservices, bounded context. <br>- API & Contract Design: RESTful conventions, request/response schema, versioning. <br>- Data Design & Consistency: ACID, CAP theorem, eventual consistency. <br>- Reliability, Security, Observability by Design. <br>- Testability & Traceability. |
| **Buổi 3** | AI Agent trong PTPM | - AI Agent là gì? Phân biệt LLM đơn lẻ với Agent có tool-use và memory. <br>- Agent Architecture Patterns: ReAct, Plan-and-Execute, Multi-Agent. <br>- Agent Orchestration Patterns: Sequential, Parallel, Hierarchical. <br>- Công cụ AI Agent phổ biến: Claude Code, GitHub Copilot, Cursor, Aider. <br>- Tích hợp AI Agent vào quy trình: phát triển feature mới, fix bug, refactor code, viết docs. <br>- Thực hành: Sử dụng AI Agent hỗ trợ generate boilerplate cho NestJS service. |

---

## PHẦN 2: TIẾN ĐỘ DỰ ÁN TRANSCRIPTHUB

### 2.1 Identity Service — Xác thực & Phân quyền

Identity Service là microservice đầu tiên được xây dựng, chịu trách nhiệm toàn bộ vòng đời xác thực người dùng.

#### Luồng đăng ký (Register)

```
Client → API Gateway → Identity Service
  1. Kiểm tra email đã tồn tại chưa (identityRepo.findAccountByEmail)
  2. Băm mật khẩu bcrypt với salt rounds = 10
  3. Tạo Account mới (identityRepo.createAccount)
  4. Gán Role mặc định 'USER' (identityRepo.createAccountRole)
  5. Đồng bộ sang Users Service qua RPC TCP (userGateway.createUserProfile)
  6. Phát JWT access token + refresh token
```

#### Luồng đăng nhập (Login)

```
Client → API Gateway → Identity Service
  1. Tìm Account theo email
  2. So sánh mật khẩu bằng bcrypt.compare()
  3. Lấy danh sách roles & permissions của Account
  4. Ký JWT access token (15 phút) + refresh token (7 ngày)
  5. Lưu refresh token vào Redis (TTL = 7 ngày)
  6. Trả về { accessToken, refreshToken, user }
```

#### Cơ chế JWT & RBAC

| Thành phần | Mô tả |
|-----------|-------|
| **Access Token** | JWT ngắn hạn (15 phút), chứa `accountId`, `roles[]`, `permissions[]` |
| **Refresh Token** | JWT dài hạn (7 ngày), lưu trong Redis để có thể thu hồi |
| **Guard** | `JwtAuthGuard` xác thực Bearer token tại API Gateway |
| **Role Guard** | `RolesGuard` kiểm tra vai trò `ADMIN` / `USER` |
| **Permission Guard** | `PermissionsGuard` kiểm tra quyền chi tiết |

#### Giao tiếp nội bộ (RPC TCP)

Identity Service giao tiếp với Users Service thông qua giao thức RPC TCP của NestJS — không dùng HTTP, loại bỏ chi phí header và handshake:

```typescript
// UserGateway trong Identity Service
@Client({
  transport: Transport.TCP,
  options: { host: 'users-service', port: 4001 },
})
private usersClient: ClientProxy;

// Gọi Users Service đồng bộ
await this.usersClient.send('create_user_profile', { accountId, name, email }).toPromise();
```

---

### 2.2 Users Service — Quản lý hồ sơ người dùng

Users Service quản lý bảng `user_profiles` (schema `users`) và bảng `notifications`, hoàn toàn độc lập với Identity Service theo nguyên tắc Bounded Context.

#### Các chức năng chính

| Endpoint (via API Gateway) | Mô tả |
|---------------------------|-------|
| `GET /api/users/profile` | Lấy hồ sơ người dùng hiện tại |
| `PATCH /api/users/profile` | Cập nhật tên, điện thoại, avatar, bio |
| `GET /api/users/notifications` | Lấy danh sách thông báo |
| `PATCH /api/users/notifications/:id/read` | Đánh dấu thông báo đã đọc |

#### Cấu trúc bảng `user_profiles`

```prisma
model UserProfile {
  id        Int      @id   // Khớp 1-1 với Account.id
  name      String
  email     String   @unique
  phone     String?
  avatar    String?
  bio       String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@schema("users")
}
```

---

### 2.3 API Gateway — Cổng vào hệ thống

API Gateway là điểm nhận duy nhất từ phía Client (HTTP/REST), tổng hợp và điều phối sang các microservice nội bộ qua RPC TCP.

#### Cấu hình khởi động

```typescript
// main.ts
const app = await NestFactory.create(ApiGatewayModule);
app.use(json({ limit: '50mb' }));          // Hỗ trợ transcript lớn
app.enableCors({ origin: '*' });
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}));
app.useGlobalFilters(new GlobalHttpExceptionFilter());
app.useGlobalInterceptors(new TransformInterceptor());
app.setGlobalPrefix('api');
SwaggerModule.setup('api/docs', app, document);  // Swagger UI
```

#### Các module trong API Gateway

```
api-gateway/src/
├── identity/     → Route /api/auth/*     → Identity Service (TCP :4000)
├── users/        → Route /api/users/*    → Users Service    (TCP :4001)
├── files/        → Route /api/files/*    → File Service     (TCP :4002)
├── meetings/     → Route /api/meetings/* → Meeting Service  (TCP :4003)
├── transcripts/  → Route /api/transcripts/* → Transcript Svc (TCP :4004)
├── collab/       → Route /api/collab/*   → Collab Service   (TCP :4005)
└── filters/      → GlobalHttpExceptionFilter
```

---

### 2.4 Thư viện dùng chung (libs/common)

Để tránh lặp code giữa các microservice, dự án tổ chức `libs/common` chứa:

| Thành phần | Vai trò |
|-----------|---------|
| `exceptions/error-code.ts` | Định nghĩa `AppException` và bảng mã lỗi `ErrorCodes` thống nhất |
| `interceptors/transform.interceptor.ts` | Chuẩn hóa mọi response theo format `{ success, data, timestamp }` |
| `guards/jwt-auth.guard.ts` | Xác thực Bearer JWT cho mọi route yêu cầu đăng nhập |
| `guards/roles.guard.ts` | Kiểm tra quyền RBAC dựa trên `@Roles()` decorator |
| `decorators/` | `@CurrentUser()`, `@Roles()`, `@Permissions()` |
