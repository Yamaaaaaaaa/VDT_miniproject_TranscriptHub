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