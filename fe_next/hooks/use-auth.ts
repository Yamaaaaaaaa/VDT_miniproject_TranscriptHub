import { useSession } from "next-auth/react";

export function useAuth() {
    const { data: session, status } = useSession();

    const user = session?.user;
    const role = user?.role;
    const permissions = user?.permissions ?? [];
    const token = session?.accessToken;

    // ADMIN có toàn quyền trong hệ thống
    const hasRole = (targetRole: string) => role === targetRole;
    const hasPermission = (permission: string) =>
        role === "ADMIN" || permissions.includes(permission);

    return {
        user,
        role,
        permissions,
        token,
        status,
        hasRole,
        hasPermission,
        isAuthenticated: status === "authenticated",
        isLoading: status === "loading",
    };
}