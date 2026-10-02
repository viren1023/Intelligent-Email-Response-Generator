import React, { useState, useEffect, useRef } from 'react';
import { aiService, type ChatMessage } from '../services/ai';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  emailId: string;
  threadId: string;
  onInsertToReply?: (text: string) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  isOpen,
  onClose,
  emailId,
  threadId,
  onInsertToReply,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen && emailId) {
      setLoadingHistory(true);
      aiService.getChatHistory(emailId)
        .then(history => {
          setMessages(history);
          setTimeout(scrollToBottom, 100);
        })
        .catch(() => {})
        .finally(() => setLoadingHistory(false));
    }
  }, [isOpen, emailId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    setInput('');
    const newMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: Date.now() };
    setMessages(prev => [...prev, newMsg]);
    setIsStreaming(true);
    setStreamingText('');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let fullAssistant = '';
      await aiService.chatStream(
        emailId,
        threadId,
        trimmed,
        (token) => {
          fullAssistant += token;
          setStreamingText(fullAssistant);
        },
        (finalContent) => {
          setMessages(prev => [...prev, { role: 'assistant', content: finalContent, timestamp: Date.now() }]);
          setStreamingText('');
          setIsStreaming(false);
        },
        controller.signal
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: 'Sorry, I encountered an error. Please verify Ollama is running.', timestamp: Date.now() }
        ]);
      }
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      if (streamingText) {
        setMessages(prev => [...prev, { role: 'assistant', content: streamingText, timestamp: Date.now() }]);
      }
      setIsStreaming(false);
      setStreamingText('');
    }
  };

  const handleClearHistory = async () => {
    if (window.confirm('Clear chat history for this email?')) {
      await aiService.deleteChatHistory(emailId);
      setMessages([]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-96 max-w-full bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col transition-all animate-slide-in">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-gray-800 dark:to-gray-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
            💬
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Email AI Assistant</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Contextual Chat for this thread</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={handleClearHistory}
              title="Clear chat history"
              className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            title="Close panel"
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Suggested prompts if empty */}
      {messages.length === 0 && !streamingText && (
        <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/30 border-b border-indigo-100/50 dark:border-indigo-900/30">
          <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-200 mb-2">💡 Quick questions you can ask:</p>
          <div className="space-y-1.5">
            {[
              'Summarize this email thread in 2 bullet points.',
              'What are the next action items or deadlines mentioned?',
              'Draft a polite decline explaining I am fully booked.',
            ].map((prompt, i) => (
              <button
                key={i}
                onClick={() => { setInput(prompt); }}
                className="w-full text-left text-xs bg-white dark:bg-gray-700/70 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 text-gray-700 dark:text-gray-200 p-2 rounded-lg border border-indigo-100 dark:border-gray-600 transition-colors leading-relaxed"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loadingHistory && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600" />
          </div>
        )}

        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-none'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-none border border-gray-200/60 dark:border-gray-600'
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>

            {m.role === 'assistant' && onInsertToReply && (
              <div className="flex gap-2 mt-1 ml-1">
                <button
                  onClick={() => onInsertToReply(m.content)}
                  className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Use as Reply
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Live streaming message */}
        {isStreaming && (
          <div className="flex flex-col items-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-none px-4 py-2.5 text-sm leading-relaxed bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm border border-gray-200/60 dark:border-gray-600">
              <div className="whitespace-pre-wrap">{streamingText}</div>
              <span className="inline-block w-2 h-4 bg-indigo-600 animate-pulse ml-0.5" />
            </div>
            <button
              onClick={handleStop}
              className="mt-1 text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 font-medium"
            >
              ■ Stop generating
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form onSubmit={handleSend} className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Ask about this email thread..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isStreaming}
            className="flex-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white p-2.5 rounded-xl shadow-sm transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
};
