# Tài Liệu Triển Khai: Giới Hạn Tần Suất Yêu Cầu (Rate Limiting)

Hệ thống **TranscriptHub** xử lý nhiều thông tin nhạy cảm (biên bản họp, âm thanh ghi âm cuộc họp) và tài nguyên lưu trữ dung lượng lớn (MinIO S3). Tài liệu này đặc tả kiến trúc và cách triển khai giới hạn tần suất yêu cầu (**Rate Limiting**) đa lớp để bảo vệ hệ thống trước các nguy cơ tấn công brute-force, spam tải tệp tin (DoS) và làm cạn kiệt tài nguyên hệ thống.

---

## 1. Tổng Quan Kiến Trúc Rate Limiting Đa Lớp

Để đạt hiệu quả tối đa và đảm bảo tính sẵn sàng cao, hệ thống áp dụng mô hình **Phòng thủ chiều sâu (Defense in Depth)** gồm 2 tầng bảo vệ:

```mermaid
graph TD
    Client[Người dùng / Kẻ tấn công] -->|Yêu cầu HTTP/WS| Ingress[1. K8s Ingress Controller]
    Ingress -->|Lọc các đợt DDoS thô| APIGw[2. NestJS API Gateway]
    Ingress -->|Lọc các đợt Spam WS| CollabGw[2. Standalone Collab Gateway]
    
    subgraph Tầng Hạ Tầng (Infrastructure Level)
        Ingress
    end

    subgraph Tầng Ứng Dụng (Application Level)
        APIGw -->|@nestjs/throttler| Services[Microservices Backend]
        CollabGw -->|Custom Upgrade Rate Limiter| Yjs[Y.js Realtime Collab]
    end
```

### So sánh hai lớp bảo vệ:

| Tiêu chí | Tầng Hạ Tầng (K8s Ingress) | Tầng Ứng Dụng (NestJS & WS Gateway) |
| :--- | :--- | :--- |
| **Phạm vi bảo vệ** | Toàn bộ cluster, chặn spam băng thông lớn (Volumetric DDoS) | Bảo vệ logic nghiệp vụ, tránh nghẽn DB và tràn dung lượng ổ đĩa |
| **Ngữ cảnh nghiệp vụ** | Chỉ biết IP/URL thô, không có thông tin User | Biết rõ User ID, Role (Free/Premium), trạng thái xác thực |
| **Độ linh hoạt** | Thấp (chỉ cấu hình chung theo path) | Rất cao (cấu hình chi tiết trên từng API bằng Decorator `@Throttle`) |
| **Hỗ trợ chạy Local** | Không (yêu cầu cấu hình K8s/Nginx phức tạp) | Có sẵn (chạy ổn định trên docker-compose và môi trường dev) |

---

## 2. Chi Tiết Triển Khai Ở Tầng Ứng Dụng

### 2.1. API Gateway (`@nestjs/throttler`)

API Gateway (NestJS) đóng vai trò định tuyến các yêu cầu HTTP. Chúng ta sẽ sử dụng thư viện `@nestjs/throttler` để cấu hình giới hạn tần suất.

#### 1. Cấu hình Toàn cục (Global Settings)
Mặc định, tất cả các endpoint đi qua API Gateway sẽ giới hạn tối đa **60 requests trong 1 phút** từ cùng một địa chỉ IP.

```typescript
// Cấu hình tại api-gateway.module.ts
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 1 phút
        limit: 60,  // Tối đa 60 requests
      },
    ]),
    // ... các module khác
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class ApiGatewayModule {}
```

#### 2. Giới hạn Nghiêm ngặt cho Auth Endpoint (Brute-Force Protection)
Các thao tác đăng nhập và đăng ký là mục tiêu tấn công Brute-force mật khẩu. Chúng ta cấu hình giới hạn tối đa **5 lần yêu cầu trong 1 phút** trên mỗi IP.

```typescript
// Cấu hình tại identity.controller.ts
import { Throttle } from '@nestjs/throttler';

@Controller('identity')
export class IdentityController {
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Max 5 attempts/phút
  login(@Body() loginDto: LoginDto) {
    return this.identityService.login(loginDto);
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Max 5 attempts/phút
  register(@Body() registerDto: RegisterDto) {
    return this.identityService.register(registerDto);
  }
}
```

#### 3. Giới hạn File Upload (MinIO Disk Flooding Protection)
Để ngăn ngừa kẻ tấn công liên tục đẩy file rác lên làm tràn ngập ổ đĩa MinIO S3 (DoS ổ đĩa), các API khởi tạo và tải file trực tiếp được cấu hình giới hạn tối đa **3 lần upload trong 1 phút**.

```typescript
// Cấu hình tại files.controller.ts
import { Throttle } from '@nestjs/throttler';

@Controller('files')
export class FilesController {
  @Post('upload')
  @UseGuards(JwtIdentityGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // Max 3 uploads/phút
  uploadSingle(@Req() req: express.Request, @Res() res: express.Response) {
    this.doProxy(req, res);
  }

  @Post('upload/init')
  @UseGuards(JwtIdentityGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // Max 3 upload inits/phút
  initializeUpload(@Req() req: express.Request, @Res() res: express.Response) {
    this.doProxy(req, res);
  }
}
```

---

### 2.2. WebSocket Gateway (Collab Gateway Custom Upgrade Limiter)

Do `collab-gateway` chạy một HTTP server thuần túy và sử dụng thư viện `ws` để quản lý các kết nối thời gian thực Y.js, chúng ta không thể sử dụng `@nestjs/throttler`.

Giải pháp là **intercept sự kiện `upgrade` của HTTP Server** trước khi nó được chuyển qua WebSocket Server.

#### Nguyên lý Hoạt Động:
1. Đổi cấu hình WebSocket sang `noServer: true` để tự quản lý quá trình bắt tay (handshake).
2. Khi có sự kiện `upgrade`, trích xuất địa chỉ IP của Client (lấy từ `x-forwarded-for` trước để tương thích k8s Ingress/Reverse Proxy).
3. Đếm số lượng connection handshake trong vòng 1 phút qua Redis (nếu Redis gặp sự cố, hệ thống tự động fallback về cơ chế sliding window trong bộ nhớ RAM cục bộ để tránh làm tê liệt hệ thống).
4. Nếu số lượng handshake từ IP đó **vượt quá 10 lần/phút**, trả về mã trạng thái `HTTP 429 Too Many Requests` và lập tức hủy kết nối socket.

#### Mã nguồn thiết kế:

```javascript
// Thiết kế thuật toán Rate Limiter tại collab-gateway/src/index.js
import { redis } from './services/redis.js';

const handshakeLimits = new Map(); // Dùng cho in-memory fallback

// Dọn dẹp bộ nhớ in-memory định kỳ (tránh rò rỉ bộ nhớ)
setInterval(() => {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  for (const [ip, timestamps] of handshakeLimits.entries()) {
    const fresh = timestamps.filter(t => t > oneMinuteAgo);
    if (fresh.length === 0) {
      handshakeLimits.delete(ip);
    } else {
      handshakeLimits.set(ip, fresh);
    }
  }
}, 300000); // 5 phút quét một lần

function checkInMemoryRateLimit(ip) {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  if (!handshakeLimits.has(ip)) {
    handshakeLimits.set(ip, [now]);
    return false;
  }
  const timestamps = handshakeLimits.get(ip).filter(t => t > oneMinuteAgo);
  if (timestamps.length >= 10) {
    return true; // Bị giới hạn
  }
  timestamps.push(now);
  handshakeLimits.set(ip, timestamps);
  return false;
}

async function isWsHandshakeRateLimited(ip) {
  const limit = 10;
  const windowSeconds = 60;
  const key = `rate:ws:handshake:${ip}`;

  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }
    return current > limit;
  } catch (err) {
    logger.error(`[WS-RateLimit] Redis error, falling back to in-memory: ${err.message}`);
    return checkInMemoryRateLimit(ip);
  }
}
```

Tích hợp vào Server Upgrade event:

```javascript
const server = http.createServer();
const wss = new WebSocketServer({ noServer: true }); // Chuyển từ { server } sang noServer

server.on('upgrade', async (req, socket, head) => {
  // Trích xuất IP khách (hỗ trợ reverse proxy/K8s)
  const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const ip = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : rawIp;

  // Kiểm tra rate limit
  const isLimited = await isWsHandshakeRateLimited(ip);
  if (isLimited) {
    logger.warn(`[WS-RateLimit] Blocked too many handshakes from IP: ${ip}`);
    socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  // Nếu hợp lệ, tiếp tục xử lý kết nối WebSocket
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});
```

---

## 3. Cấu Hình Ở Tầng Hạ Tầng (Kubernetes Ingress)

Khi triển khai trên Production Kubernetes, cấu hình giới hạn tần suất yêu cầu được đặt trực tiếp trên **Ingress Controller** để lọc các luồng traffic bất thường trước khi gửi tới API Gateway.

Dưới đây là ví dụ cấu hình sử dụng **Nginx Ingress Controller** bằng annotations trong tệp manifest K8s (`ingress.yaml`):

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: transcripthub-ingress
  namespace: transcripthub
  annotations:
    kubernetes.io/ingress.class: "nginx"
    # Giới hạn số kết nối đồng thời từ một địa chỉ IP khách hàng
    nginx.ingress.kubernetes.io/limit-connections: "20"
    # Giới hạn số yêu cầu trên giây (RPS) từ một địa chỉ IP khách hàng
    nginx.ingress.kubernetes.io/limit-rps: "15"
    # Lượng burst cho phép vượt hạn mức rps tạm thời trước khi block
    nginx.ingress.kubernetes.io/limit-burst-multiplier: "3"
spec:
  rules:
    - host: api.transcripthub.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-gateway
                port:
                  number: 3000
```

---

## 4. Kịch Bản Kiểm Thử & Xác Minh (Testing Guide)

### 4.1. Kiểm thử API Gateway (HTTP)
Sử dụng công cụ dòng lệnh `curl` hoặc Postman để kiểm chứng.

**Chạy kiểm thử Brute-force Login:**
```bash
# Bắn liên tiếp 6 request login rác trong vòng 5 giây
for i in {1..6}; do 
  curl -X POST http://localhost:3000/api/identity/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong-password"}' \
    -w "\nHTTP Status: %{http_code}\n"
done
```
**Kết quả mong đợi:**
- 5 request đầu tiên: Trả về trạng thái `401 Unauthorized` hoặc tương tự.
- Request thứ 6: Trả về trạng thái `429 Too Many Requests` kèm JSON:
  ```json
  {
    "statusCode": 429,
    "message": "ThrottlerException: Too Many Requests"
  }
  ```

---

### 4.2. Kiểm thử Collab Gateway (WebSocket)
Tạo tệp script Node.js tạm thời `scratch/test-ws-rate-limit.js` để mở nhiều kết nối song song nhanh chóng:

```javascript
import WebSocket from 'ws';

const url = 'ws://localhost:3008/test-meeting?token=dummy-token';
const NUM_CONNECTIONS = 12;

for (let i = 1; i <= NUM_CONNECTIONS; i++) {
  const ws = new WebSocket(url);
  
  ws.on('open', () => {
    console.log(`[Conn ${i}] Kết nối thành công`);
    ws.close();
  });
  
  ws.on('error', (err) => {
    console.error(`[Conn ${i}] Lỗi: ${err.message}`);
  });
}
```

**Kết quả mong đợi:**
- 10 kết nối đầu tiên mở và đóng thành công.
- Kết nối 11 và 12 báo lỗi: `Unexpected server response: 429`.
