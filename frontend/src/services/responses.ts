import api from './api';

export interface ResponseHistoryItem {
  id: number;
  sender: string;
  subject: string;
  snippet?: string;
  status: string;
  generated_at: string;
  sent_at: string | null;
}

export interface ResponseHistoryDetail extends ResponseHistoryItem {
  email: {
    sender: string;
    subject: string;
    snippet: string;
  };
  generated_text: string;
  edited_text: string | null;
  model_name: string;
  generation_time: number;
}

export const responseService = {
  getHistory: async (): Promise<ResponseHistoryItem[]> => {
    const res = await api.get('/api/responses');
    return Array.isArray(res.data) ? res.data : [];
  },
  getDetail: async (id: number): Promise<ResponseHistoryDetail> => {
    const res = await api.get(`/api/responses/${id}`);
    return res.data;
  },
  autoSaveDraft: async (id: number, edited_text: string): Promise<{ status: string; updated_at: string }> => {
    const res = await api.patch(`/api/responses/${id}`, { edited_text });
    return res.data;
  }
};
