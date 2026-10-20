import axios from 'axios';
import { clearAppCache } from '../utils/cache';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      clearAppCache();
    }
    return Promise.reject(error);
  }
);

export default api;
