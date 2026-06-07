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

export interface LoginResponseData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

// Token storage helpers
export const tokenStorage = {
  getAccessToken: () => localStorage.getItem('access_token'),
  getRefreshToken: () => localStorage.getItem('refresh_token'),
  setTokens: (accessToken: string, refreshToken: string) => {
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
  },
  clearTokens: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
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
  }
};
