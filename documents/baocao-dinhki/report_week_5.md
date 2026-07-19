# BÁO CÁO TUẦN 5

## MỤC LỤC

- [NỘI DUNG TỔNG HỢP](#nội-dung-tổng-hợp)
- [PHẦN 1: LỘ TRÌNH HỌC TẬP](#phần-1-lộ-trình-học-tập)
- [PHẦN 2: TIẾN ĐỘ DỰ ÁN TRANSCRIPTHUB](#phần-2-tiến-độ-dự-án-transcripthub)
  - [2.1 Xác thực phía Frontend (NextAuth.js)](#21-xác-thực-phía-frontend-nextauthjs)
  - [2.2 Dashboard Layout & Navigation](#22-dashboard-layout--navigation)
  - [2.3 Trang Transcript Editor — Trung tâm của ứng dụng](#23-trang-transcript-editor--trung-tâm-của-ứng-dụng)
  - [2.4 Audio Player & Audio-Text Mapping](#24-audio-player--audio-text-mapping)

---

## NỘI DUNG TỔNG HỢP

Tuần 5 tập trung vào:

**Phần học tập (3 buổi):**
- **Web Development Practice:** Ứng dụng tổng hợp kiến thức — dựng ứng dụng web hoàn chỉnh với database, backend API và frontend giao tiếp với nhau; so sánh Monolith vs Microservices trong thực tế.
- **Web Deployment & Optimization:** Chiến lược triển khai (server, VPS, container, cloud), đo lường performance (Core Web Vitals, Lighthouse), tối ưu query/cache, load balancing và horizontal scaling.
- **Security in Web Development:** Các lỗ hổng phổ biến (OWASP Top 10), kỹ thuật phòng ngừa (input validation, parameterized queries, HTTPS, CSP), thực hành khai thác SQL Injection và vá lỗi.

**Phần dự án:** Hoàn thiện toàn bộ **Frontend Next.js** — từ luồng đăng nhập (NextAuth), Dashboard quản lý phòng họp, Audio Player HTTP Range, đến Transcript Editor tích hợp Quill + Yjs cộng tác thời gian thực.

---

## PHẦN 1: LỘ TRÌNH HỌC TẬP

| Buổi học | Môn học / Chủ đề | Nội dung chi tiết |
|----------|-----------------|-------------------|
| **Buổi 1** | Web Development Practice | - Giới thiệu kiến trúc Monolith vs Microservices — khi nào chọn cái nào. <br>- Một số pattern trong Microservices: API Gateway, Saga, CQRS, Outbox Pattern. <br>- Hướng dẫn cài đặt môi trường dev đầy đủ (Docker Compose: DB + Backend + Frontend). <br>- Thực hành: Lập trình trang web 3 tầng (PostgreSQL + NestJS API + Next.js UI) hoàn chỉnh. <br>- Code review và best practice: separation of concerns, clean code. |
| **Buổi 2** | Web Deployment & Optimization | - Tổng quan triển khai: VPS, PaaS (Heroku, Railway), Container (Docker), Cloud (GCP/AWS/Azure). <br>- Đo lường performance: Core Web Vitals (LCP, FID, CLS), Lighthouse, WebPageTest. <br>- Tối ưu từ code: tối ưu SQL query, Connection Pooling, Redis Cache, CDN cho static assets. <br>- Tối ưu khả năng mở rộng: Load Balancing (Nginx), Horizontal Scaling, High Availability. <br>- Monitoring & Alerting: Prometheus, Grafana, structured logging. |
| **Buổi 3** | Security in Web Development | - Tổng quan nguy cơ bảo mật: OWASP Top 10 (Injection, Broken Auth, XSS, CSRF, ...). <br>- Kỹ thuật phòng ngừa: Input validation, Parameterized queries, Output encoding. <br>- Encryption: HTTPS/TLS, mã hóa mật khẩu (bcrypt), JWT best practice. <br>- Access control: RBAC, ABAC, Principle of Least Privilege. <br>- Best practice: Security headers (CSP, HSTS, X-Frame-Options), Rate limiting. <br>- Thực hành: Khai thác lỗi SQL Injection trên website demo, sau đó vá lỗi bằng parameterized query. |

---

## PHẦN 2: TIẾN ĐỘ DỰ ÁN TRANSCRIPTHUB

### 2.1 Xác thực phía Frontend (NextAuth.js)

Frontend sử dụng **NextAuth.js** với Credentials Provider để tích hợp với Identity Service backend, lưu JWT vào session an toàn:

#### Cấu hình NextAuth

```typescript
// auth.ts
export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    CredentialsProvider({
      async authorize(credentials) {
        // Gọi API Gateway → Identity Service
        const res = await fetch(`${API_URL}/api/auth/login`, {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        const { data } = await res.json();
        // Trả về user object chứa accessToken + refreshToken
        return { ...data.user, accessToken: data.accessToken };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.accessToken = user.accessToken;
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      return session;
    },
  },
});
```

#### Middleware bảo vệ route

```typescript
// middleware.ts
export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnDashboard = req.nextUrl.pathname.startsWith('/home');

  if (isOnDashboard && !isLoggedIn) {
    return Response.redirect(new URL('/login', req.nextUrl));
  }
});
```

---

### 2.2 Dashboard Layout & Navigation

Dashboard sử dụng **Next.js App Router** với route group `(dashboard)` để chia sẻ layout chung (sidebar, header) giữa tất cả trang quản lý:

#### Cấu trúc route

```
app/
├── (dashboard)/
│   ├── layout.tsx        ← Sidebar + Header dùng chung
│   ├── home/             ← Trang chủ (danh sách meetings)
│   ├── meetings/         ← Chi tiết phòng họp
│   ├── files/            ← Quản lý file audio
│   ├── transcripts/      ← Danh sách & editor transcript
│   │   └── [fileId]/     ← Editor theo fileId
│   ├── users/            ← Quản lý người dùng (ADMIN)
│   └── roles/            ← Quản lý vai trò (ADMIN)
├── login/                ← Trang đăng nhập
└── register/             ← Trang đăng ký
```

#### Permission Guard

Các trang admin được bảo vệ bằng component `PermissionGuard` phía client:

```tsx
// components/permission-guard.tsx
export function PermissionGuard({ required, children }: Props) {
  const { data: session } = useSession();
  const hasPermission = session?.user?.permissions?.includes(required);

  if (!hasPermission) return <redirect to="/unauthorized" />;
  return <>{children}</>;
}
```

---

### 2.3 Trang Transcript Editor — Trung tâm của ứng dụng

Trang transcript editor (`/transcripts/[fileId]`) là giao diện phức tạp nhất, tích hợp 4 tính năng đồng thời:

#### Tích hợp Quill Editor + Yjs

```tsx
// Khởi tạo Yjs + Quill trong useEffect
const ydoc = new Y.Doc();
const provider = new WebsocketProvider(COLLAB_WS_URL, roomId, ydoc);
const ytext = ydoc.getText('transcript');

const quill = new Quill('#editor', {
  theme: 'snow',
  modules: { cursors: true, history: { userOnly: true } },
});

// Binding Quill ↔ Yjs
const binding = new QuillBinding(ytext, quill, provider.awareness);

// Hiển thị con trỏ của người dùng khác
const cursors = quill.getModule('cursors');
provider.awareness.on('change', () => {
  // Cập nhật màu sắc và vị trí con trỏ từng người
});
```

#### Phiên bản lịch sử

| Tính năng | Triển khai |
|-----------|-----------|
| **Auto-save** | Debounce 30 giây sau lần thay đổi cuối |
| **Manual save** | Nút "Lưu phiên bản" → tạo `TranscriptVersion` |
| **Version list** | Hiển thị danh sách snapshot theo thời gian |
| **Diff view** | So sánh inline hai phiên bản (highlight thêm/xóa) |
| **Rollback** | Khôi phục Y.Doc về state của phiên bản đã chọn |

---

### 2.4 Audio Player & Audio-Text Mapping

#### Audio Player với HTTP Range

```tsx
// Sử dụng HTML5 <audio> với src streaming qua API Gateway
<audio
  ref={audioRef}
  src={`/api/files/${fileId}/stream`}
  onTimeUpdate={handleTimeUpdate}
/>
```

Trình duyệt tự động gửi `Range: bytes=...` khi người dùng tua, API Gateway forward sang File Service để trả `206 Partial Content`.

#### Audio-Text Mapping hai chiều

| Hướng | Cơ chế |
|-------|--------|
| **Audio → Text** | `onTimeUpdate` so sánh `currentTime` với `segment.startTime / endTime` → highlight segment đang phát |
| **Text → Audio** | Click vào segment text → đọc `segment.startTime` → `audioRef.current.currentTime = startTime` |

```tsx
// Highlight segment đang phát
const handleTimeUpdate = () => {
  const current = audioRef.current.currentTime;
  const activeSegment = segments.find(
    (s) => current >= s.startTime && current <= s.endTime,
  );
  if (activeSegment) setHighlightedSegmentId(activeSegment.id);
};

// Nhảy đến vị trí âm thanh khi click chữ
const handleSegmentClick = (segment: Segment) => {
  audioRef.current.currentTime = segment.startTime;
  audioRef.current.play();
};
```
