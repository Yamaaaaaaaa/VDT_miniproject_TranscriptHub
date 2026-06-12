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