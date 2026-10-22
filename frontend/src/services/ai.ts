import api from './api';

export interface GenerateRequest {
  thread_id: string;
  custom_instruction?: string;
  tone?: string;
}

export interface GenerateResponse {
  response_id: number;
  generated_text: string;
}

export interface SendReplyRequest {
  response_id: number;
  edited_text: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface EmailAnalysis {
  summary: string;
  sentiment: string;
  scenarios: string[];
  quick_chip?: string;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const aiService = {
  generateReply: async (emailId: string, data: GenerateRequest): Promise<GenerateResponse> => {
    const response = await api.post(`/api/emails/${emailId}/generate-reply`, data);
    return response.data;
  },

  streamReply: async (
    emailId: string,
    data: GenerateRequest,
    onChunk: (token: string) => void,
    onStart?: (responseId: number) => void,
    onDone?: (fullText: string, responseId: number) => void,
    signal?: AbortSignal
  ): Promise<void> => {
    const res = await fetch(`${BASE_URL}/api/emails/${emailId}/stream-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include',
      signal,
    });

    if (!res.ok) throw new Error(`Stream request failed with status ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No readable stream available');

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.status === 'start' && parsed.response_id && onStart) {
              onStart(parsed.response_id);
            }
            if (parsed.token) {
              onChunk(parsed.token);
            }
            if (parsed.status === 'done' && onDone) {
              onDone(parsed.full_text, parsed.response_id);
            }
          } catch {
            // ignore partial JSON parse error
          }
        }
      }
    }
  },

  getQuickReplies: async (emailId: string, threadId: string): Promise<string[]> => {
    const response = await api.get(`/api/emails/${emailId}/quick-replies`, {
      params: { thread_id: threadId }
    });
    return response.data.suggestions || [];
  },

  getChatPrompts: async (emailId: string, threadId: string): Promise<string[]> => {
    const response = await api.get(`/api/emails/${emailId}/chat-prompts`, {
      params: { thread_id: threadId }
    });
    return response.data.prompts || [];
  },

  chatStream: async (
    emailId: string,
    threadId: string,
    message: string,
    onChunk: (token: string) => void,
    onDone?: (fullContent: string) => void,
    signal?: AbortSignal
  ): Promise<void> => {
    const res = await fetch(`${BASE_URL}/api/emails/${emailId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_id: threadId, message }),
      credentials: 'include',
      signal,
    });

    if (!res.ok) throw new Error(`Chat stream failed with status ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No readable stream available');

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.token) {
              onChunk(parsed.token);
            }
            if (parsed.status === 'done' && onDone) {
              onDone(parsed.content);
            }
          } catch {
            // ignore
          }
        }
      }
    }
  },

  getChatHistory: async (emailId: string): Promise<ChatMessage[]> => {
    const res = await api.get(`/api/emails/${emailId}/chat-history`);
    return res.data.messages || [];
  },

  deleteChatHistory: async (emailId: string): Promise<void> => {
    await api.delete(`/api/emails/${emailId}/chat-history`);
  },

  batchUrgency: async (emails: Array<{ id: string; subject: string; snippet: string }>): Promise<Record<string, string>> => {
    const res = await api.post('/api/emails/batch-urgency', { emails });
    return res.data.urgencies || {};
  },

  sendReply: async (emailId: string, data: SendReplyRequest): Promise<void> => {
    await api.post(`/api/emails/${emailId}/reply`, data);
  },

  generateComposeDraft: async (data: {
    prompt: string;
    recipient?: string;
    subject?: string;
    current_body?: string;
    tone?: string;
    model_name?: string;
    provider?: string;
    chat_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    image_names?: string[];
  }): Promise<{ subject: string; draft: string; reply: string }> => {
    const res = await api.post('/api/emails/compose-draft', data);
    return {
      subject: res.data.subject || '',
      draft: res.data.draft || '',
      reply: res.data.reply || '',
    };
  },

  getAnalysis: async (emailId: string, threadId: string): Promise<EmailAnalysis> => {
    const res = await api.get(`/api/emails/${emailId}/analysis`, { params: { thread_id: threadId } });
    return res.data;
  }
};

export function isAiErrorMessage(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  return (
    (t.startsWith('[') && t.endsWith(']')) ||
    t.includes('Quota Exceeded') ||
    t.includes('Usage limit reached') ||
    t.includes('Model Unavailable') ||
    t.includes('Model Busy') ||
    t.includes('Authentication Error') ||
    t.includes('Gemini Error') ||
    t.includes('RESOURCE_EXHAUSTED') ||
    t.includes('Could not complete this draft request') ||
    t.includes('Could not generate smart reply')
  );
}
