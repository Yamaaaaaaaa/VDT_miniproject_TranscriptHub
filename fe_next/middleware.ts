import { auth } from "./auth";
import { NextResponse } from "next/server";

export default auth((req) => {
    const isLoggedIn = !!req.auth;
    const { nextUrl } = req;
    const isAuthRoute = nextUrl.pathname.startsWith("/login") || nextUrl.pathname.startsWith("/register");
    const isProtectedRoute = !isAuthRoute && nextUrl.pathname !== "/unauthorized";

    // Nếu người dùng đã đăng nhập và cố truy cập trang login/register -> Chuyển về trang mặc định /home
    if (isAuthRoute) {
        if (isLoggedIn) {
            return NextResponse.redirect(new URL("/home", nextUrl));
        }
        return NextResponse.next();
    }

    // Nếu người dùng chưa đăng nhập cố vào protected routes -> Chuyển sang Trang Đăng nhập
    if (isProtectedRoute) {
        if (!isLoggedIn) return NextResponse.redirect(new URL("/login", nextUrl));

        const role = req.auth?.user?.role;
        const permissions = req.auth?.user?.permissions ?? [];
        const hasUsersAccess = role === "ADMIN" || permissions.includes("read_users");

        // Nếu vào trang chủ "/", chuyển hướng về "/home"
        if (nextUrl.pathname === "/") {
            return NextResponse.redirect(new URL("/home", nextUrl));
        }

        // Bảo vệ tuyến đường quản trị người dùng: Chỉ cho ADMIN hoặc những ai có quyền 'read_users'
        if (nextUrl.pathname.startsWith("/users")) {
            if (!hasUsersAccess) {
                return NextResponse.redirect(new URL("/unauthorized", nextUrl));
            }
        }

        // Bảo vệ tuyến đường quản trị vai trò & quyền hạn: Chỉ cho ADMIN hoặc những ai có quyền 'manage_roles'
        if (nextUrl.pathname.startsWith("/roles")) {
            const hasAccess = role === "ADMIN" || permissions.includes("manage_roles");
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