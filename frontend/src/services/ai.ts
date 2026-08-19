import api from './api';

export interface GenerateRequest {
  thread_id: string;
  custom_instruction?: string;
}

export interface GenerateResponse {
  response_id: number;
  generated_text: string;
}

export interface SendReplyRequest {
  response_id: number;
  edited_text: string;
}

export const aiService = {
  generateReply: async (emailId: string, data: GenerateRequest): Promise<GenerateResponse> => {
    const response = await api.post(`/api/emails/${emailId}/generate-reply`, data);
    return response.data;
  },
  sendReply: async (emailId: string, data: SendReplyRequest): Promise<void> => {
    await api.post(`/api/emails/${emailId}/reply`, data);
  }
};
