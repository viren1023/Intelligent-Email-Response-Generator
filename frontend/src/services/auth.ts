import api from './api';
import { setCachedUser, clearAppCache } from '../utils/cache';

export interface User {
  id: number;
  email: string;
  name: string;
  picture: string | null;
}

export const authService = {
  getMe: async (): Promise<User> => {
    const response = await api.get('/auth/me');
    setCachedUser(response.data);
    return response.data;
  },
  logout: async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } finally {
      clearAppCache();
    }
  },
  getGoogleLoginUrl: (): string => {
    return `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/auth/google`;
  }
};
