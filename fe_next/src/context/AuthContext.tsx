'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, tokenStorage, type UserProfileResponse } from '../services/api';

interface AuthContextType {
  isAuthenticated: boolean;
  user: UserProfileResponse | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (profile: Partial<UserProfileResponse>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<UserProfileResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Parse JWT helper to extract roles
  const parseUserRolesFromToken = (token: string): string[] => {
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadJson);
        const scope = payload.scope || '';
        // Scope is space separated: "ROLE_USER ROLE_ADMIN"
        return scope
          .split(' ')
          .filter((s: string) => s.startsWith('ROLE_'))
          .map((s: string) => s.replace('ROLE_', ''));
      }
    } catch (e) {
      console.error('Failed to parse JWT scope', e);
    }
    return ['USER'];
  };

  const loadUserProfile = async () => {
    const token = tokenStorage.getAccessToken();
    if (!token) {
      setIsAuthenticated(false);
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const profile = await api.getMyProfile();
      const roles = parseUserRolesFromToken(token);
      setUser({ ...profile, roles });
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Failed to load user profile, clearing token', error);
      tokenStorage.clearTokens();
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUserProfile();
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const result = await api.login(email, password);
      tokenStorage.setTokens(result.accessToken, result.refreshToken);
      await loadUserProfile();
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const register = async (username: string, email: string, password: string) => {
    setLoading(true);
    try {
      await api.register(username, email, password);
      setLoading(false);
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await api.logout();
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      setLoading(false);
    }
  };

  const updateProfile = async (profileUpdate: Partial<UserProfileResponse>) => {
    try {
      const updated = await api.updateMyProfile(profileUpdate);
      const token = tokenStorage.getAccessToken();
      const roles = token ? parseUserRolesFromToken(token) : [];
      setUser({ ...updated, roles });
    } catch (error) {
      console.error('Failed to update profile', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        loading,
        login,
        register,
        logout,
        updateProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
