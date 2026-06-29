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

        // BE giờ trả về { code: 1000, result: { accessToken, refreshToken } }
        const refreshedTokens = response.data.result ?? response.data;

        // Decode new access token to update role and permissions
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
    secret: process.env.NEXTAUTH_SECRET,
    providers: [
        Credentials({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            authorize: async (credentials) => {
                // Hàm này tự động chạy khi client gọi signIn("credentials", { email, password })

                if (!credentials?.email || !credentials?.password) return null;

                const gatewayUrl = process.env.API_GATEWAY_URL ?? "http://localhost:3000";
                try {
                    // 1. Gửi request POST lên API Gateway Backend để kiểm tra email & mật khẩu
                    const res = await axios.post(`${gatewayUrl}/api/identity/login`, {
                        email: credentials.email,
                        password: credentials.password,
                    });

                    // BE giờ trả về { code: 1000, result: { account, accessToken, refreshToken } }
                    const data = res.data.result ?? res.data;
                    if (!data || !data.accessToken) return null;

                    // Giải mã JWT accessToken để lấy roles và permissions
                    const payloadBase64 = data.accessToken.split('.')[1];
                    const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'));

                    // 2. Trả về thông tin User gồm thông tin Profile + các Token + Vai trò & Quyền hạn
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
                session.accessToken = token.accessToken as string | undefined;
                session.refreshToken = token.refreshToken as string | undefined;
                session.error = token.error as "RefreshTokenError" | undefined;
            }
            return session;
        },
    },
    pages: { signIn: "/login" },
    session: { strategy: "jwt" },
});