# Hướng dẫn Xây dựng Next.js Frontend (Bản đầy đủ nghiệp vụ: Auth, Users, Roles, Permissions)

Tài liệu này hướng dẫn chi tiết từng bước xây dựng ứng dụng frontend **Next.js** hoàn chỉnh từ số 0, tích hợp **Tailwind CSS**, hệ thống xác thực bảo mật **NextAuth.js v5 (@beta)** với cơ chế tự động xoay vòng Token (JWT Refresh/Rotation), thư viện **Axios** gọi API, cùng tính năng quản lý danh sách người dùng (CRUD) và phân quyền chi tiết (RBAC - Role Based Access Control).

---

## 1. Bước 1: Khởi tạo và Chuẩn bị Dự án

### 1.1. Khởi tạo dự án Next.js trắng
Di chuyển ra thư mục gốc dự án (cạnh thư mục `services_ms`) và chạy lệnh khởi tạo:

```bash
npx create-next-app@latest fe_next
```

*Trong quá trình thiết lập, hãy chọn các tùy chọn chính xác như sau:*
* **Would you like to use TypeScript?** → **Yes**
* **Would you like to use ESLint?** → **Yes**
* **Would you like to use Tailwind CSS?** → **Yes**
* **Would you like to use src/ directory?** → **No** (Chúng ta sẽ để thư mục `app/` ngay ngoài gốc)
* **Would you like to use App Router? (recommended)** → **Yes**
* **Would you like to customize the default import alias (@/*)?** → **Yes**
* **What import alias would you like configured?** → **@/***

### 1.2. Cài đặt các gói thư viện cần thiết
Di chuyển vào thư mục dự án `fe_next` và cài đặt các thư viện bổ sung:

```bash
cd fe_next
npm install next-auth@beta axios lucide-react
```

---

## 2. Bước 2: Cấu hình Proxy và Docker Standalone

Sửa đổi file cấu hình Next.js [next.config.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/next.config.ts) để bật tính năng build tối ưu Docker và chuyển tiếp API (Proxy Rewrites) về API Gateway:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Cần thiết để build Docker image siêu nhẹ
  
  async rewrites() {
    const gatewayUrl = process.env.API_GATEWAY_URL ?? "http://localhost:3000";
    return [
      {
        source: "/api/users/:path*",
        destination: `${gatewayUrl}/api/users/:path*`,
      },
      {
        source: "/api/identity/:path*",
        destination: `${gatewayUrl}/api/identity/:path*`,
      },
    ];
  },
};

export default nextConfig;
```

---

## 3. Bước 3: Tích hợp Xác thực (NextAuth v5 Beta) & Rotate Token

Để lưu thông tin Access Token, Refresh Token, Vai trò (Role) và Quyền hạn (Permissions) vào phiên đăng nhập của NextAuth và tự động gia hạn token khi hết hạn, ta cấu hình như sau:

### 3.1. Định nghĩa kiểu dữ liệu mở rộng: [next-auth.d.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/next-auth.d.ts)
Tạo file khai báo kiểu dữ liệu tại thư mục gốc `fe_next/`:

```typescript
import NextAuth, { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    refreshToken?: string;
    error?: "RefreshTokenError";
    user: {
      id: string;
      role: string;
      permissions: string[];
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    name?: string | null;
    email?: string | null;
    role?: string;
    permissions?: string[];
    accessToken?: string;
    refreshToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    role?: string;
    permissions?: string[];
    error?: "RefreshTokenError";
  }
}
```

### 3.2. Viết file cấu hình chính: [auth.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/auth.ts)
Tạo tệp cấu hình NextAuth tại thư mục gốc `fe_next/`. File này thực hiện đăng nhập và xoay vòng JWT tự động:

```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import axios from "axios";

// Hàm gọi API Gateway để làm mới Access Token bằng Refresh Token
async function refreshAccessToken(token: any) {
  try {
    const gatewayUrl = process.env.API_GATEWAY_URL ?? "http://localhost:3000";
    const response = await axios.post(`${gatewayUrl}/api/identity/refresh`, {
      token: token.refreshToken,
    });

    const refreshedTokens = response.data;
    
    // Giải mã Access Token mới để lấy role và permissions
    const payloadBase64 = refreshedTokens.accessToken.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'));

    // Cộng thêm 55 phút thời hạn sử dụng mới (đệm 5 phút trước khi thực sự hết hạn 1h)
    return {
      ...token,
      accessToken: refreshedTokens.accessToken,
      accessTokenExpires: Date.now() + 55 * 60 * 1000,
      role: decoded.roles?.[0] ?? "USER",
      permissions: decoded.permissions ?? [],
    };
  } catch (error) {
    console.error("Lỗi khi tự động làm mới access token:", error);
    return {
      ...token,
      error: "RefreshTokenError" as const,
    };
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        if (!credentials?.email || !credentials?.password) return null;

        const gatewayUrl = process.env.API_GATEWAY_URL ?? "http://localhost:3000";
        try {
          const res = await axios.post(`${gatewayUrl}/api/identity/login`, {
            email: credentials.email,
            password: credentials.password,
          });

          const data = res.data;
          if (!data || !data.accessToken) return null;

          // Giải mã JWT accessToken để lấy roles và permissions thực tế
          const payloadBase64 = data.accessToken.split('.')[1];
          const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'));

          // Trả về đối tượng user chứa đầy đủ token và thông tin phân quyền
          return {
            id: String(data.account.id),
            name: data.account.profile?.name ?? "User",
            email: data.account.email,
            role: decoded.roles?.[0] ?? "USER",
            permissions: decoded.permissions ?? [],
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
          };
        } catch (error) {
          console.error("Authorize error:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Đăng nhập lần đầu: Lưu toàn bộ thông tin từ User Object vào JWT Token
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.role = user.role;
        token.permissions = user.permissions;
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        // Đặt thời gian hết hạn Access Token (1h = 3600 giây)
        token.accessTokenExpires = Date.now() + 60 * 60 * 1000;
        return token;
      }

      // Các lượt gọi tiếp theo: Kiểm tra xem Access Token đã hết hạn chưa
      if (Date.now() < (token.accessTokenExpires as number)) {
        return token;
      }

      // Access Token hết hạn: Tiến hành tự động gọi API gia hạn qua Refresh Token
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      if (token) {
        session.user = {
          ...session.user,
          id: token.id as string,
          name: token.name,
          email: token.email ?? "",
          role: token.role as string,
          permissions: (token.permissions as string[]) ?? [],
        } as any;
        session.accessToken = token.accessToken;
        session.refreshToken = token.refreshToken;
        session.error = token.error;
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
});
```

### 3.3. Đăng ký API Route: `app/api/auth/[...nextauth]/route.ts`
Tạo thư mục `app/api/auth/[...nextauth]/` và viết file `route.ts`:

```typescript
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

---

## 4. Bước 4: Bảo vệ Tuyến đường và Phân quyền bằng Middleware

Viết file bảo mật [middleware.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/middleware.ts) để bảo vệ toàn bộ phân vùng `/dashboard/*`, đồng thời kiểm tra phân quyền truy cập tuyến đường cụ thể:

```typescript
import { auth } from "./auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { nextUrl } = req;
  const isAuthRoute = nextUrl.pathname.startsWith("/login") || nextUrl.pathname.startsWith("/register");
  const isDashboardRoute = nextUrl.pathname.startsWith("/dashboard");

  // Nếu người dùng đã đăng nhập và cố truy cập trang login/register -> Chuyển về Dashboard
  if (isAuthRoute) {
    if (isLoggedIn) return NextResponse.redirect(new URL("/dashboard/users", nextUrl));
    return NextResponse.next();
  }

  // Nếu người dùng chưa đăng nhập cố vào Dashboard -> Chuyển sang Trang Đăng nhập
  if (isDashboardRoute) {
    if (!isLoggedIn) return NextResponse.redirect(new URL("/login", nextUrl));

    const role = req.auth?.user?.role;
    const permissions = req.auth?.user?.permissions ?? [];

    // Bảo vệ tuyến đường quản trị người dùng: Chỉ cho ADMIN hoặc những ai có quyền 'read_users'
    if (nextUrl.pathname.startsWith("/dashboard/users")) {
      const hasAccess = role === "ADMIN" || permissions.includes("read_users");
      if (!hasAccess) {
        return NextResponse.redirect(new URL("/unauthorized", nextUrl));
      }
    }
  }

  return NextResponse.next();
});

export const config = {
  // Thực hiện middleware cho tất cả các file ngoại trừ các tài nguyên tĩnh
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

---

## 5. Bước 5: Cấu hình API Helper với Axios Interceptor

Tạo thư mục `lib/` và viết file [api.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/lib/api.ts) để thực hiện giao tiếp với backend. Tệp này tự động lấy và gắn kèm Access Token từ NextAuth Session vào mọi API request:

```typescript
import axios from "axios";
import { getSession, signOut } from "next-auth/react";

const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Request Interceptor: Tự động đính kèm Access Token vào header Authorization
api.interceptors.request.use(
  async (config) => {
    const session = await getSession();
    const token = session?.accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Tự động bắt lỗi 401 (Hết hạn cả Access & Refresh Token)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      console.warn("Phiên làm việc hết hạn hoặc không hợp lệ. Đang đăng xuất...");
      if (typeof window !== "undefined") {
        await signOut({ callbackUrl: "/login" });
      }
    }
    return Promise.reject(error);
  }
);

// Đối tượng gọi API CRUD dành cho Users Profile
export const usersApi = {
  getAll: () => api.get("/users").then((res) => res.data),
  getOne: (id: number) => api.get(`/users/${id}`).then((res) => res.data),
  create: (data: any) => api.post("/users", data).then((res) => res.data),
  registerAccount: (data: any) => api.post("/identity/register", data).then((res) => res.data),
  update: (id: number, data: any) => api.patch(`/users/${id}`, data).then((res) => res.data),
  remove: (id: number) => api.delete(`/users/${id}`).then((res) => res.data),
  
  // API cập nhật vai trò người dùng (Tương tác sang phần Identity DB)
  updateUserRoles: (id: number, roles: string[]) => 
    api.patch(`/identity/users/${id}/roles`, { roles }).then((res) => res.data),
};

export default api;
```

---

## 6. Bước 6: Xây dựng Hook và Component Phân quyền UI

Nhằm kiểm soát hiển thị các nút thao tác (Thêm, Sửa, Xóa) trên giao diện dựa vào quyền hạn của tài khoản:

### 6.1. Hook kiểm tra vai trò & quyền hạn: [hooks/use-auth.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/hooks/use-auth.ts)
Tạo thư mục `hooks/` và viết file `use-auth.ts`:

```typescript
import { useSession } from "next-auth/react";

export function useAuth() {
  const { data: session, status } = useSession();

  const user = session?.user;
  const role = user?.role;
  const permissions = user?.permissions ?? [];

  // ADMIN có toàn quyền trong hệ thống
  const hasRole = (targetRole: string) => role === targetRole;
  const hasPermission = (permission: string) => 
    role === "ADMIN" || permissions.includes(permission);

  return {
    user,
    role,
    permissions,
    status,
    hasRole,
    hasPermission,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
  };
}
```

### 6.2. Component bảo vệ hiển thị: [components/permission-guard.tsx](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/components/permission-guard.tsx)
Tạo thư mục `components/` và viết file `permission-guard.tsx`:

```typescript
"use client";

import React from "react";
import { useAuth } from "@/hooks/use-auth";

interface PermissionGuardProps {
  permission?: string;
  role?: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGuard({
  permission,
  role,
  fallback = null,
  children,
}: PermissionGuardProps) {
  const { hasRole, hasPermission, isAuthenticated } = useAuth();

  if (!isAuthenticated) return <>{fallback}</>;

  if (role && !hasRole(role)) {
    return <>{fallback}</>;
  }

  if (permission && !hasPermission(permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
```

---

## 7. Bước 7: Thiết kế Giao diện Đăng nhập và Đăng ký (Premium Dark Mode)

### 7.1. Trang Đăng nhập: [app/login/page.tsx](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/app/login/page.tsx)
Giao diện đăng nhập kính mờ (Glassmorphism) đẹp mắt, hỗ trợ hiển thị lỗi khi thông tin không chính xác:

```typescript
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, Mail, Lock, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Email hoặc mật khẩu không chính xác.");
      } else {
        router.push("/dashboard/users");
      }
    } catch {
      setError("Đã xảy ra lỗi kết nối. Hãy thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950 via-gray-950 to-black p-4">
      <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-indigo-500/10 text-indigo-400 rounded-xl mb-3">
            <LogIn size={28} />
          </div>
          <h1 className="text-2xl font-bold text-white">TranscriptHub</h1>
          <p className="text-sm text-gray-400 mt-1">Đăng nhập quyền quản trị hệ thống</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm mb-6">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                type="email"
                required
                className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">Mật khẩu</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                type="password"
                required
                className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-semibold shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? "Đang xử lý..." : "Đăng nhập"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-6">
          Chưa có tài khoản?{" "}
          <Link href="/register" className="text-indigo-400 hover:underline">
            Đăng ký ngay
          </Link>
        </p>
      </div>
    </div>
  );
}
```

### 7.2. Trang Đăng ký: [app/register/page.tsx](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/app/register/page.tsx)
Giao diện đăng ký tài khoản mới:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { UserPlus, User, Mail, Lock, AlertCircle, CheckCircle } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await axios.post("/api/identity/register", {
        name,
        email,
        password,
      });

      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Đăng ký không thành công. Email có thể đã tồn tại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950 via-gray-950 to-black p-4">
      <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-indigo-500/10 text-indigo-400 rounded-xl mb-3">
            <UserPlus size={28} />
          </div>
          <h1 className="text-2xl font-bold text-white">Tạo tài khoản mới</h1>
          <p className="text-sm text-gray-400 mt-1">Đăng ký tham gia hệ thống TranscriptHub</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm mb-6">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 p-3 rounded-lg text-sm mb-6">
            <CheckCircle size={18} className="shrink-0" />
            <span>Đăng ký thành công! Đang chuyển hướng sang Đăng nhập...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">Họ và Tên</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                type="text"
                required
                className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="Nguyen Van A"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                type="email"
                required
                className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">Mật khẩu</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                type="password"
                required
                className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="Tối thiểu 6 ký tự"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || success}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-semibold shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? "Đang xử lý..." : "Đăng ký tài khoản"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-6">
          Đã có tài khoản?{" "}
          <Link href="/login" className="text-indigo-400 hover:underline">
            Đăng nhập ngay
          </Link>
        </p>
      </div>
    </div>
  );
}
```

---

## 8. Bước 8: Giao diện Quản trị Người dùng & Phân vai trò

### 8.1. Trang Layout chính: [app/dashboard/layout.tsx](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/app/dashboard/layout.tsx)
Giao diện quản trị chia khung (Sidebar Layout) hiển thị menu động dựa trên quyền hạn người dùng:

```typescript
"use client";

import { useAuth } from "@/hooks/use-auth";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { LayoutDashboard, Users, ShieldAlert, LogOut, Shield } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, hasPermission } = useAuth();

  return (
    <div className="min-h-screen flex bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/5 bg-gray-900/50 p-6 flex flex-col justify-between">
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-bold text-indigo-400 flex items-center gap-2">
              <Shield size={22} /> TranscriptHub
            </h2>
            <p className="text-xs text-gray-500 mt-1">Hệ thống quản lý</p>
          </div>

          <nav className="space-y-2">
            <Link
              href="/dashboard/users"
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 text-gray-300 hover:text-white transition-colors"
            >
              <Users size={18} />
              <span>Quản lý thành viên</span>
            </Link>

            {/* Chỉ hiển thị Menu Quản lý Hệ thống cho Admin hoặc quyền nâng cao */}
            {hasPermission("manage_system") && (
              <Link
                href="/dashboard/system"
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 text-gray-300 hover:text-white transition-colors"
              >
                <LayoutDashboard size={18} />
                <span>Thiết lập hệ thống</span>
              </Link>
            )}
          </nav>
        </div>

        <div className="space-y-4 pt-6 border-t border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center font-bold text-indigo-400">
              {user?.name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-tight">{user?.name}</p>
              <span className="text-[10px] px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full font-bold uppercase">
                {user?.role}
              </span>
            </div>
          </div>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
          >
            <LogOut size={18} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-10 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
```

### 8.2. Giao diện CRUD & Quản lý Phân vai trò: [app/dashboard/users/page.tsx](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/app/dashboard/users/page.tsx)
Giao diện quản lý hiển thị danh sách người dùng, thực hiện tạo mới, sửa đổi thông tin, xóa tài khoản và phân vai trò trực tiếp trên giao diện bằng Modal. Áp dụng Phân quyền UI ẩn/hiện nút tương ứng:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { usersApi } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { PermissionGuard } from "@/components/permission-guard";
import { Plus, Edit2, Trash2, ShieldAlert, X } from "lucide-react";

export default function UsersManagementPage() {
  const { hasPermission } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Trạng thái cho Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);

  // Form states
  const [formData, setFormData] = useState({ name: "", phone: "", bio: "" });
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  // Tải danh sách người dùng
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await usersApi.getAll();
      setUsers(data);
    } catch {
      alert("Không thể tải danh sách người dùng.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Xóa người dùng
  const handleDelete = async (id: number) => {
    if (!confirm("Bạn có chắc chắn muốn xóa thành viên này không?")) return;
    try {
      await usersApi.remove(id);
      alert("Xóa thành viên thành công!");
      loadUsers();
    } catch {
      alert("Xóa thất bại. Bạn không đủ quyền hạn.");
    }
  };

  // Mở modal cập nhật thông tin hồ sơ
  const openEditModal = (user: any) => {
    setSelectedUser(user);
    setFormData({
      name: user.name || "",
      phone: user.phone || "",
      bio: user.bio || "",
    });
    setIsEditModalOpen(true);
  };

  // Submit cập nhật hồ sơ
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      await usersApi.update(selectedUser.id, formData);
      alert("Cập nhật thành công!");
      setIsEditModalOpen(false);
      loadUsers();
    } catch {
      alert("Không thể cập nhật hồ sơ.");
    }
  };

  // Mở modal gán vai trò tài khoản (Chỉ admin có quyền)
  const openRoleModal = (user: any) => {
    setSelectedUser(user);
    setSelectedRoles(user.role ? [user.role] : []);
    setIsRoleModalOpen(true);
  };

  // Submit cập nhật vai trò (Role)
  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      await usersApi.updateUserRoles(selectedUser.id, selectedRoles);
      alert("Cập nhật vai trò người dùng thành công!");
      setIsRoleModalOpen(false);
      loadUsers();
    } catch {
      alert("Cập nhật vai trò thất bại.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Quản lý thành viên</h1>
          <p className="text-sm text-gray-400">Danh sách tài khoản và thiết lập quyền hạn hệ thống</p>
        </div>

        {/* Nút Tạo mới chỉ hiển thị nếu có quyền 'create_users' */}
        <PermissionGuard permission="create_users">
          <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 rounded-xl font-semibold transition-colors">
            <Plus size={18} />
            <span>Thêm thành viên</span>
          </button>
        </PermissionGuard>
      </div>

      {loading ? (
        <div className="text-gray-400">Đang tải dữ liệu...</div>
      ) : (
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-gray-300 text-sm font-medium">
                <th className="p-4">ID</th>
                <th className="p-4">Họ và Tên</th>
                <th className="p-4">Email</th>
                <th className="p-4">Số điện thoại</th>
                <th className="p-4">Vai trò</th>
                <th className="p-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="p-4 text-gray-400">#{u.id}</td>
                  <td className="p-4 font-semibold text-white">{u.name}</td>
                  <td className="p-4 text-gray-300">{u.email}</td>
                  <td className="p-4 text-gray-300">{u.phone || "—"}</td>
                  <td className="p-4">
                    <span className="text-xs px-2.5 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full font-bold uppercase">
                      {u.role ?? "USER"}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    {/* Nút phân vai trò chỉ hiển thị cho ADMIN */}
                    {hasPermission("manage_roles") && (
                      <button
                        onClick={() => openRoleModal(u)}
                        className="p-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 rounded-lg transition-colors inline-flex"
                        title="Phân vai trò"
                      >
                        <ShieldAlert size={16} />
                      </button>
                    )}

                    {/* Nút sửa thông tin */}
                    <PermissionGuard permission="update_users">
                      <button
                        onClick={() => openEditModal(u)}
                        className="p-2 bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 rounded-lg transition-colors inline-flex"
                        title="Sửa hồ sơ"
                      >
                        <Edit2 size={16} />
                      </button>
                    </PermissionGuard>

                    {/* Nút xóa người dùng */}
                    <PermissionGuard permission="delete_users">
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="p-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg transition-colors inline-flex"
                        title="Xóa tài khoản"
                      >
                        <Trash2 size={16} />
                      </button>
                    </PermissionGuard>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal cập nhật hồ sơ */}
      {isEditModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-4">
          <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Cập nhật hồ sơ</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Họ và Tên</label>
                <input
                  type="text"
                  required
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-white"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Số điện thoại</label>
                <input
                  type="text"
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-white"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Bio (Giới thiệu)</label>
                <textarea
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-white h-24"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                />
              </div>
              <button type="submit" className="w-full bg-indigo-600 py-2.5 rounded-lg font-semibold text-white">
                Lưu thay đổi
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal cập nhật Vai trò (Role) */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-4">
          <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Gán vai trò tài khoản</h3>
              <button onClick={() => setIsRoleModalOpen(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleRoleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Chọn vai trò cho <b>{selectedUser?.name}</b></label>
                <select
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-white"
                  value={selectedRoles[0] || ""}
                  onChange={(e) => setSelectedRoles([e.target.value])}
                >
                  <option value="USER">USER (Thành viên)</option>
                  <option value="MANAGER">MANAGER (Quản lý)</option>
                  <option value="ADMIN">ADMIN (Quản trị tối cao)</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-purple-600 py-2.5 rounded-lg font-semibold text-white">
                Cập nhật quyền hạn
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 8.3. Trang từ chối truy cập: [app/unauthorized/page.tsx](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/app/unauthorized/page.tsx)
Hiển thị thông báo khi tài khoản cố tình truy cập vào các tuyến đường vượt quá quyền hạn cho phép:

```typescript
"use client";

import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-100 p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="inline-flex p-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-2xl mb-2">
          <ShieldAlert size={40} />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Từ chối truy cập</h1>
        <p className="text-gray-400">Bạn không có quyền hạn cần thiết để truy cập vào tài nguyên hoặc chức năng này.</p>
        
        <div className="pt-4">
          <Link
            href="/dashboard/users"
            className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
          >
            <ArrowLeft size={18} />
            <span>Quay về Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
```

---

## 9. Bước 9: Thiết lập Biến môi trường và Khởi chạy

### 9.1. Tạo file cấu hình môi trường: `.env.local`
Tạo file `.env.local` tại thư mục gốc của dự án `fe_next/` và nhập cấu hình:

```env
# URL đến API Gateway
API_GATEWAY_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# Khoá bí mật dùng để mã hoá session JWT (NextAuth)
AUTH_SECRET=chuoi_key_bao_mat_ngau_nhien_sieu_dai_12345
NEXTAUTH_SECRET=chuoi_key_bao_mat_ngau_nhien_sieu_dai_12345

# URL chạy của client Next.js
NEXTAUTH_URL=http://localhost:3333
AUTH_TRUST_HOST=true
```

### 9.2. Khởi chạy dự án ở môi trường phát triển local
Trong thư mục `fe_next/`, tiến hành cài đặt dependencies (nếu chưa cài) và khởi chạy:

```bash
npm run dev -- -p 3333
```

Ứng dụng sẽ chạy tại địa chỉ `http://localhost:3333`. Bạn có thể mở trình duyệt truy cập để kiểm thử chức năng Đăng ký, Đăng nhập, tự động gia hạn token và Phân quyền thao tác trên Dashboard.
