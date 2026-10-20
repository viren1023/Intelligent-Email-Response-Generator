import api from './api';

export type InboxTab = 'primary' | 'unread' | 'sent' | 'all' | 'drafts';

export interface EmailMetadata {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  is_unread: boolean;
  is_sent: boolean;
  ai_replied?: boolean;
}

export interface InboxPage {
  emails: EmailMetadata[];
  next_page_token: string | null;
  tab: InboxTab;
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
  getAll: async (tab: InboxTab = 'primary', pageToken?: string): Promise<InboxPage> => {
    const params: Record<string, string> = { tab };
    if (pageToken) params.page_token = pageToken;
    const response = await api.get('/api/emails/all', { params });
    return response.data;
  },
  getUnreadCount: async (): Promise<number> => {
    const response = await api.get('/api/emails/unread-count');
    return response.data.count || 0;
  },
  getThread: async (emailId: string, threadId: string): Promise<ThreadResponse> => {
    const response = await api.get(`/api/emails/${emailId}/thread?thread_id=${threadId}`);
    return response.data;
  },
  composeEmail: async (data: { to: string; subject: string; body: string }): Promise<{ status: string; id?: string }> => {
    const response = await api.post('/api/emails/compose', data);
    return response.data;
  },
  saveGoogleDraft: async (data: { to?: string; subject?: string; body: string }): Promise<{ status: string; id?: string }> => {
    const response = await api.post('/api/emails/draft', data);
    return response.data;
  },
  markRead: async (emailId: string): Promise<void> => {
    await api.post(`/api/emails/${emailId}/mark-read`);
  },
  markUnread: async (emailId: string): Promise<void> => {
    await api.post(`/api/emails/${emailId}/mark-unread`);
  },
  deleteEmail: async (emailId: string): Promise<void> => {
    await api.delete(`/api/emails/${emailId}`);
  }
};
