import api from './api';

export interface EmailMetadata {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
}

export interface ThreadMessage {
  id: string;
  from: string;
  to: string;
  date: string;
  subject: string;
  body: string;
}

export interface ThreadResponse {
  thread_id: string;
  messages: ThreadMessage[];
}

export const emailService = {
  getUnread: async (): Promise<EmailMetadata[]> => {
    const response = await api.get('/api/emails/unread');
    return response.data.emails;
  },
  getThread: async (emailId: string, threadId: string): Promise<ThreadResponse> => {
    const response = await api.get(`/api/emails/${emailId}/thread?thread_id=${threadId}`);
    return response.data;
  }
};
