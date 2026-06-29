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