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

  const [prompts, setPrompts] = useState<string[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(false);

  useEffect(() => {
    if (isOpen && emailId) {
      setLoadingHistory(true);
      setLoadingPrompts(true);
      aiService.getChatHistory(emailId)
        .then(history => {
          setMessages(history);
          setTimeout(scrollToBottom, 100);
        })
        .catch(() => {})
        .finally(() => setLoadingHistory(false));

      aiService.getChatPrompts(emailId, threadId)
        .then(res => {
          if (res && res.length > 0) setPrompts(res);
        })
        .catch(() => {})
        .finally(() => setLoadingPrompts(false));
    }
  }, [isOpen, emailId, threadId]);

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
    <div className="w-80 sm:w-96 flex-shrink-0 border-l border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface-darkCard flex flex-col h-full z-20 transition-all select-none">
      {/* Header */}
      <div className="h-14 px-5 border-b border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface-darkCard flex items-center justify-between flex-shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Chat with Email</h3>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">Context-aware thread discussion</p>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={handleClearHistory}
              title="Clear chat history"
              className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            title="Close panel"
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Suggested prompts if empty */}
      {messages.length === 0 && !streamingText && (
        <div className="p-4 bg-indigo-50/40 dark:bg-indigo-950/20 border-b border-indigo-100/40 dark:border-indigo-900/30">
          <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200 mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Recommended quick prompts:
            </span>
            {loadingPrompts && (
              <span className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            )}
          </p>
          <div className="space-y-1.5">
            {(prompts.length > 0 ? prompts : [
              'Summarize the key action items in this email thread.',
              'What specific questions or deadlines require my attention?',
              'Draft a comprehensive response addressing all open items.',
            ]).map((promptText, i) => (
              <button
                key={i}
                onClick={() => { setInput(promptText); }}
                className="w-full text-left text-xs bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 text-slate-700 dark:text-slate-200 p-2.5 rounded-xl border border-indigo-100 dark:border-slate-700 active:scale-[0.98] transition-all duration-150 ease-out leading-relaxed shadow-xs"
              >
                {promptText}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loadingHistory && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-indigo-600 border-t-transparent" />
          </div>
        )}

        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-xs ${
                m.role === 'user'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-xs border border-slate-200/60 dark:border-slate-700/60'
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>

            {m.role === 'assistant' && onInsertToReply && (
              <div className="flex gap-2 mt-1 ml-1">
                <button
                  onClick={() => onInsertToReply(m.content)}
                  className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Use as Reply Draft
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Live streaming message */}
        {isStreaming && (
          <div className="flex flex-col items-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-xs px-4 py-2.5 text-xs leading-relaxed bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-xs border border-slate-200/60 dark:border-slate-700">
              <div className="whitespace-pre-wrap">{streamingText}</div>
              <span className="inline-block w-2 h-4 bg-indigo-600 animate-pulse ml-0.5" />
            </div>
            <button
              onClick={handleStop}
              className="mt-1.5 text-xs text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 font-bold flex items-center gap-1"
            >
              <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              Stop generating
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form onSubmit={handleSend} className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Ask about this email thread..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isStreaming}
            className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white p-2.5 rounded-xl shadow-md shadow-indigo-500/20 active:scale-95 transition-all duration-150 ease-out flex-shrink-0"
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
