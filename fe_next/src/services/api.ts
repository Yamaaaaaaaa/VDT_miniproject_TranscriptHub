const API_BASE_URL = 'http://localhost:8080';

export interface ApiResponse<T> {
  code?: number;
  message?: string;
  result: T;
}

export interface Role {
  name: string;
  description: string;
}

export interface PermissionResponse {
  name: string;
  description: string;
}

export interface RoleResponse {
  name: string;
  description: string;
  permissions: PermissionResponse[];
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

export interface IdentityUserResponse {
  id: number;
  username: string;
  email: string;
  emailVerified: boolean;
  roles: Role[];
}

export interface UserProfileResponse {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  phone?: string;
  city?: string;
  roles?: string[]; // Custom helper field
}

export interface FileMetadataResponse {
  id: string;
  fileName: string;
  bucketName: string;
  objectKey: string;
  fileSize: number;
  mimeType: string;
  durationSeconds: number;
  status: string;
  uploaderId: number;
  createdAt: string;
}

export interface TranscriptSegment {
  id: string;
  startTime: number;
  endTime: number;
  speaker: string;
  text: string;
}

export interface TranscriptContent {
  segments: TranscriptSegment[];
}

export interface Transcript {
  id: number;
  audioFileId: string;
  rawText: string;
  structuredContent: TranscriptContent;
  status: string; // PROCESSING, COMPLETED, FAILED
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponseData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface MeetingResponse {
  id: string;
  title: string;
  description: string;
  creatorId: number;
  audioFileId: string;
  status: 'CREATING' | 'PROCESSING' | 'COMPLETED';
  createdAt: string;
  updatedAt: string;
  audioFile?: FileMetadataResponse;
  transcript?: Transcript;
}

export interface MeetingMemberResponse {
  id: number;
  meetingId: string;
  userId: number;
  role: 'HOST' | 'EDITOR' | 'VIEWER';
  joinedAt: string;
}

// Token storage helpers
export const tokenStorage = {
  getAccessToken: () => typeof window !== 'undefined' ? localStorage.getItem('access_token') : null,
  getRefreshToken: () => typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null,
  setTokens: (accessToken: string, refreshToken: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
    }
  },
  clearTokens: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    }
  }
};

// Generic fetch client
async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const token = tokenStorage.getAccessToken();
  const headers = new Headers(options.headers);
  
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  const text = await response.text();
  let data: ApiResponse<T>;
  
  try {
    data = text ? JSON.parse(text) : { result: {} as T };
  } catch (err) {
    throw new Error('Định dạng phản hồi từ máy chủ không hợp lệ.');
  }

  if (!response.ok) {
    // If unauthorized, clear tokens
    if (response.status === 401 || response.status === 403) {
      tokenStorage.clearTokens();
      // Redirect to login page to avoid inconsistent authentication state
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
        window.location.href = '/login';
      }
    }
    throw new Error(data.message || `Lỗi hệ thống: ${response.status}`);
  }

  // Gateway error code check
  if (data.code && data.code !== 1000 && data.code !== 200) {
    // If backend returns a business exception code
    throw new Error(data.message || 'Yêu cầu không hợp lệ.');
  }

  return data;
}

// API methods
export const api = {
  // Login
  login: async (email: string, password: string): Promise<LoginResponseData> => {
    const response = await request<LoginResponseData>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    return response.result;
  },

  // Register
  register: async (username: string, email: string, password: string): Promise<IdentityUserResponse> => {
    const response = await request<IdentityUserResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password })
    });
    return response.result;
  },

  // Get current user profile
  getMyProfile: async (): Promise<UserProfileResponse> => {
    const response = await request<UserProfileResponse>('/users/my-profile', {
      method: 'GET'
    });
    return response.result;
  },

  // Update current user profile
  updateMyProfile: async (profile: Partial<UserProfileResponse>): Promise<UserProfileResponse> => {
    const response = await request<UserProfileResponse>('/users/my-profile', {
      method: 'PUT',
      body: JSON.stringify(profile)
    });
    return response.result;
  },

  // Get all users (User Management list)
  getAllUsers: async (): Promise<UserProfileResponse[]> => {
    const response = await request<UserProfileResponse[]>('/users', {
      method: 'GET'
    });
    return response.result;
  },

  // Get all identity users with roles (identity-service)
  getAllIdentityUsers: async (): Promise<Page<IdentityUserResponse>> => {
    const response = await request<Page<IdentityUserResponse>>('/api/users?size=100', {
      method: 'GET'
    });
    return response.result;
  },

  // Create a new user (identity-service)
  adminCreateUser: async (payload: any): Promise<IdentityUserResponse> => {
    const response = await request<IdentityUserResponse>('/api/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return response.result;
  },

  // Update user roles and details (identity-service)
  adminUpdateUser: async (id: number, payload: any): Promise<IdentityUserResponse> => {
    const response = await request<IdentityUserResponse>(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    return response.result;
  },

  // Delete user (identity-service)
  adminDeleteUser: async (id: number): Promise<void> => {
    await request<void>(`/api/users/${id}`, {
      method: 'DELETE'
    });
  },

  // Get all roles (identity-service)
  getAllRoles: async (): Promise<RoleResponse[]> => {
    const response = await request<RoleResponse[]>('/api/roles', {
      method: 'GET'
    });
    return response.result;
  },

  // Logout (Optional endpoint)
  logout: async (): Promise<void> => {
    const token = tokenStorage.getRefreshToken();
    if (token) {
      try {
        await request<void>('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ token })
        });
      } catch (err) {
        console.error('Logout request failed on backend, but clearing locally', err);
      }
    }
    tokenStorage.clearTokens();
  },

  // File management
  listFiles: async (page: number, size: number): Promise<Page<FileMetadataResponse>> => {
    const response = await request<Page<FileMetadataResponse>>(`/api/v1/files?page=${page}&size=${size}`, {
      method: 'GET'
    });
    return response.result;
  },

  getFile: async (fileId: string): Promise<FileMetadataResponse> => {
    const response = await request<FileMetadataResponse>(`/api/v1/files/${fileId}`, {
      method: 'GET'
    });
    return response.result;
  },

  uploadFile: async (file: File): Promise<FileMetadataResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await request<FileMetadataResponse>('/api/v1/files/upload', {
      method: 'POST',
      body: formData
    });
    return response.result;
  },

  deleteFile: async (fileId: string): Promise<string> => {
    const response = await request<string>(`/api/v1/files/${fileId}`, {
      method: 'DELETE'
    });
    return response.result;
  },

  renameFile: async (fileId: string, fileName: string): Promise<FileMetadataResponse> => {
    const response = await request<FileMetadataResponse>(`/api/v1/files/${fileId}`, {
      method: 'PUT',
      body: JSON.stringify({ fileName })
    });
    return response.result;
  },

  // Transcript management
  getTranscript: async (fileId: string): Promise<Transcript> => {
    const response = await request<Transcript>(`/api/v1/transcripts/file/${fileId}`, {
      method: 'GET'
    });
    return response.result;
  },

  generateTranscript: async (fileId: string): Promise<Transcript> => {
    const response = await request<Transcript>('/api/v1/transcripts/generate', {
      method: 'POST',
      body: JSON.stringify({ fileId })
    });
    return response.result;
  },

  getAllTranscripts: async (): Promise<Transcript[]> => {
    const response = await request<Transcript[]>('/api/v1/transcripts', {
      method: 'GET'
    });
    return response.result;
  },

  // Meeting management
  listMeetings: async (page: number, size: number, includeAudioFile = false, includeTranscript = false): Promise<Page<MeetingResponse>> => {
    const response = await request<Page<MeetingResponse>>(`/api/v1/meetings?page=${page}&size=${size}&includeAudioFile=${includeAudioFile}&includeTranscript=${includeTranscript}`, {
      method: 'GET'
    });
    return response.result;
  },

  createMeeting: async (title: string, description: string, audioFileId: string): Promise<MeetingResponse> => {
    const response = await request<MeetingResponse>('/api/v1/meetings', {
      method: 'POST',
      body: JSON.stringify({ title, description, audioFileId })
    });
    return response.result;
  },

  getMeeting: async (id: string, includeAudioFile = false, includeTranscript = false): Promise<MeetingResponse> => {
    const response = await request<MeetingResponse>(`/api/v1/meetings/${id}?includeAudioFile=${includeAudioFile}&includeTranscript=${includeTranscript}`, {
      method: 'GET'
    });
    return response.result;
  },

  updateMeeting: async (id: string, title: string, description: string, status: 'CREATING' | 'PROCESSING' | 'COMPLETED'): Promise<MeetingResponse> => {
    const response = await request<MeetingResponse>(`/api/v1/meetings/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title, description, status })
    });
    return response.result;
  },

  deleteMeeting: async (id: string): Promise<string> => {
    const response = await request<string>(`/api/v1/meetings/${id}`, {
      method: 'DELETE'
    });
    return response.result;
  },

  getMeetingMembers: async (id: string): Promise<MeetingMemberResponse[]> => {
    const response = await request<MeetingMemberResponse[]>(`/api/v1/meetings/${id}/members`, {
      method: 'GET'
    });
    return response.result;
  },

  addMeetingMemberByEmail: async (id: string, email: string, role: 'HOST' | 'EDITOR' | 'VIEWER'): Promise<MeetingMemberResponse> => {
    const response = await request<MeetingMemberResponse>(`/api/v1/meetings/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role })
    });
    return response.result;
  },

  updateMeetingMemberRole: async (id: string, userId: number, role: 'HOST' | 'EDITOR' | 'VIEWER'): Promise<MeetingMemberResponse> => {
    const response = await request<MeetingMemberResponse>(`/api/v1/meetings/${id}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role })
    });
    return response.result;
  },

  removeMeetingMember: async (id: string, userId: number): Promise<string> => {
    const response = await request<string>(`/api/v1/meetings/${id}/members/${userId}`, {
      method: 'DELETE'
    });
    return response.result;
  }
};
