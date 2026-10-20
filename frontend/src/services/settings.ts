import api from './api';

export interface UserPreferences {
  active_provider: 'ollama' | 'gemini';
  ollama_model: string;
  gemini_model: string;
  default_tone: string;
  custom_tone_prompt: string;
}

export interface PreferencesResponse {
  preferences: UserPreferences;
  has_gemini_key: boolean;
  masked_gemini_key: string;
}

export interface AIModel {
  name: string;
  size?: number;
}

export const settingsService = {
  getPreferences: async (): Promise<PreferencesResponse> => {
    const res = await api.get('/api/settings/preferences');
    return res.data;
  },
  updatePreferences: async (data: Partial<UserPreferences>): Promise<{ status: string; preferences: UserPreferences }> => {
    const res = await api.patch('/api/settings/preferences', data);
    return res.data;
  },
  getOllamaModels: async (): Promise<AIModel[]> => {
    const res = await api.get('/api/settings/models/ollama');
    return res.data.models || [];
  },
  testOllama: async (): Promise<{ status: string; models_count?: number; detail?: string }> => {
    const res = await api.get('/api/settings/models/ollama/test');
    return res.data;
  },
  getGeminiModels: async (): Promise<AIModel[]> => {
    const res = await api.get('/api/settings/models/gemini');
    return res.data.models || [];
  },
  setGeminiKey: async (apiKey: string): Promise<{ status: string; masked_key: string }> => {
    const res = await api.patch('/api/settings/gemini-key', { api_key: apiKey });
    return res.data;
  },
  deleteGeminiKey: async (): Promise<{ status: string }> => {
    const res = await api.delete('/api/settings/gemini-key');
    return res.data;
  },
  testGeminiKey: async (apiKey?: string): Promise<{ status: string; models_count?: number; detail?: string }> => {
    const res = await api.post('/api/settings/gemini-key/test', apiKey ? { api_key: apiKey } : {});
    return res.data;
  }
};
