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