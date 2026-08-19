import api from './api';

export interface ResponseHistoryItem {
  id: number;
  sender: string;
  subject: string;
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
    return res.data;
  },
  getDetail: async (id: number): Promise<ResponseHistoryDetail> => {
    const res = await api.get(`/api/responses/${id}`);
    return res.data;
  }
};
