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
    getAll: () => api.get("/users").then((res) => res.data.result ?? res.data),
    getOne: (id: number) => api.get(`/users/${id}`).then((res) => res.data.result ?? res.data),
    create: (data: any) => api.post("/users", data).then((res) => res.data.result ?? res.data),
    registerAccount: (data: any) => api.post("/identity/register", data).then((res) => res.data.result ?? res.data),
    update: (id: number, data: any) => api.patch(`/users/${id}`, data).then((res) => res.data.result ?? res.data),
    remove: (id: number) => api.delete(`/users/${id}`).then((res) => res.data.result ?? res.data),

    // API cập nhật vai trò người dùng (Tương tác sang phần Identity DB)
    updateUserRoles: (id: number, roles: string[]) =>
        api.patch(`/identity/users/${id}/roles`, { roles }).then((res) => res.data.result ?? res.data),
};

export const rolesApi = {
    getAll: () => api.get("/identity/roles").then((res) => res.data.result ?? res.data),
    getOne: (id: number) => api.get(`/identity/roles/${id}`).then((res) => res.data.result ?? res.data),
    create: (name: string) => api.post("/identity/roles", { name }).then((res) => res.data.result ?? res.data),
    update: (id: number, name: string) => api.patch(`/identity/roles/${id}`, { name }).then((res) => res.data.result ?? res.data),
    remove: (id: number) => api.delete(`/identity/roles/${id}`).then((res) => res.data.result ?? res.data),
    updatePermissions: (id: number, permissions: string[]) =>
        api.patch(`/identity/roles/${id}/permissions`, { permissions }).then((res) => res.data.result ?? res.data),
};

export const permissionsApi = {
    getAll: () => api.get("/identity/permissions").then((res) => res.data.result ?? res.data),
    getOne: (id: number) => api.get(`/identity/permissions/${id}`).then((res) => res.data.result ?? res.data),
};

export const filesApi = {
    list: (page = 0, size = 10) => api.get(`/files?page=${page}&size=${size}`).then((res) => res.data.result ?? res.data),
    getMetadata: (fileId: string) => api.get(`/files/${fileId}`).then((res) => res.data.result ?? res.data),
    updateMetadata: (fileId: string, fileName: string) => api.put(`/files/${fileId}`, { fileName }).then((res) => res.data.result ?? res.data),
    delete: (fileId: string) => api.delete(`/files/${fileId}`).then((res) => res.data.result ?? res.data),
    initializeUpload: (data: { fileName: string; fileSize: number; mimeType: string }) =>
        api.post("/files/upload/init", data).then((res) => res.data.result ?? res.data),
    completeUpload: (fileId: string) =>
        api.post(`/files/upload/complete/${fileId}`).then((res) => res.data.result ?? res.data),
};

export const transcriptsApi = {
    getAll: () => api.get("/transcripts").then((res) => res.data.result ?? res.data),
    getByAudioFile: (audioFileId: string) => api.get(`/transcripts/file/${audioFileId}`).then((res) => res.data),
    generate: (fileId: string) => api.post("/transcripts/generate", { fileId }).then((res) => res.data.result ?? res.data),
    delete: (id: number) => api.delete(`/transcripts/${id}`).then((res) => res.data.result ?? res.data),
    exportAsText: (audioFileId: string) =>
        api.get(`/transcripts/file/${audioFileId}/export/text`, { responseType: "blob" }).then((res) => res.data),
    exportAsJson: (audioFileId: string) =>
        api.get(`/transcripts/file/${audioFileId}/export/json`, { responseType: "blob" }).then((res) => res.data),
};

export const meetingsApi = {
    list: (page = 0, size = 10, includeAudioFile = false, includeTranscript = false) => 
        api.get(`/meetings?page=${page}&size=${size}&includeAudioFile=${includeAudioFile}&includeTranscript=${includeTranscript}`)
           .then((res) => res.data.result ?? res.data),
    getOne: (id: string, includeAudioFile = false, includeTranscript = false) => 
        api.get(`/meetings/${id}?includeAudioFile=${includeAudioFile}&includeTranscript=${includeTranscript}`)
           .then((res) => res.data.result ?? res.data),
    create: (data: { title: string; description?: string; audioFileId: string }) => 
        api.post('/meetings', data).then((res) => res.data.result ?? res.data),
    update: (id: string, data: { title: string; description?: string; status?: string; audioFileId?: string }) => 
        api.put(`/meetings/${id}`, data).then((res) => res.data.result ?? res.data),
    delete: (id: string) => 
        api.delete(`/meetings/${id}`).then((res) => res.data.result ?? res.data),
    getMembers: (id: string) => 
        api.get(`/meetings/${id}/members`).then((res) => res.data.result ?? res.data),
    addMember: (id: string, data: { userId?: number; email?: string; role: string }) => 
        api.post(`/meetings/${id}/members`, data).then((res) => res.data.result ?? res.data),
    updateMemberRole: (id: string, userId: number, role: string) => 
        api.put(`/meetings/${id}/members/${userId}`, { role }).then((res) => res.data.result ?? res.data),
    removeMember: (id: string, userId: number) => 
        api.delete(`/meetings/${id}/members/${userId}`).then((res) => res.data.result ?? res.data),
};

export const collabApi = {
    /** Save/auto-save the current collab transcript state via API Gateway */
    saveTranscript: (data: { meetingId: string; rawText: string; structuredContent: any }) =>
        api.post("/collab/transcript", data).then((res) => res.data.result ?? res.data),
};

export default api;