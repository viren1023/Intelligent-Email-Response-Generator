import api from './api';

export interface User {
  id: number;
  email: string;
  name: string;
  picture: string | null;
}

export const authService = {
  getMe: async (): Promise<User> => {
    const response = await api.get('/auth/me');
    return response.data;
  },
  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },
  getGoogleLoginUrl: (): string => {
    return `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/auth/google`;
  }
};
