import React, { useState, useRef, useEffect } from 'react';
import { aiService } from '../services/ai';
import api from '../services/api';
import {
  Sparkles,
  X,
  Send,
  Square,
  Cpu,
  ChevronDown,
  ArrowRight,
  Star,
} from 'lucide-react';

interface AIAssistantPaneProps {
  emailId: string;
  threadId: string;
  senderName: string;
  senderEmail?: string;
  subject?: string;
  onInsertToReply: (text: string) => void;
  onClose: () => void;
}

const CHAT_TONES = ['Professional', 'Friendly', 'Direct', 'Concise', 'Formal'] as const;



interface ModelOption {
  provider: 'ollama' | 'gemini';
  name: string;
  label: string;
}

export const AIAssistantPane: React.FC<AIAssistantPaneProps> = ({
  emailId,
  threadId,
  senderName: _senderName,
  senderEmail: _senderEmail,
  subject: _subject,
  onInsertToReply,
  onClose,
}) => {
  // Model Switcher State
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [currentModel, setCurrentModel] = useState<string>('mistral:7b');
  const [currentProvider, setCurrentProvider] = useState<'ollama' | 'gemini'>('ollama');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Response Tone
  const [defaultToneName, setDefaultToneName] = useState<string>(() => {
    try {
      return localStorage.getItem('app_default_tone')?.toLowerCase() || 'professional';
    } catch {
      return 'professional';
    }
  });
  const [selectedTone, setSelectedTone] = useState<string>('Professional');

  // (generator state removed — pane is chat-only now)

  // Chat State
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatPrompts, setChatPrompts] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [chatStreamingText, setChatStreamingText] = useState('');
  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement | null>(null);

  // Close model dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Fetch available models & user preferences
  useEffect(() => {
    const loadModelInfo = async () => {
      try {
        const [prefRes, ollamaRes] = await Promise.all([
          api.get('/api/settings/preferences').catch(() => null),
          api.get('/api/settings/models/ollama').catch(() => null),
        ]);

        const opts: ModelOption[] = [];

        // 1. Local Ollama Models (only text generation capable)
        if (ollamaRes?.data?.models) {
          ollamaRes.data.models.forEach((m: any) => {
            opts.push({
              provider: 'ollama',
              name: m.name,
              label: m.name,
            });
          });
        }

        // 2. Gemini Models (only if API key is entered)
        if (prefRes?.data?.has_gemini_key) {
          try {
            const geminiRes = await api.get('/api/settings/models/gemini');
            if (geminiRes?.data?.models) {
              geminiRes.data.models.forEach((g: any) => {
                opts.push({
                  provider: 'gemini',
                  name: g.name,
                  label: `Gemini ${g.name.replace('gemini-', '')}`,
                });
              });
            }
          } catch {}
        }

        setAvailableModels(opts);

        if (prefRes?.data?.preferences) {
          const prefs = prefRes.data.preferences;
          const prov = prefs.active_provider || 'ollama';
          setCurrentProvider(prov);
          const activeMod = prov === 'gemini' ? prefs.gemini_model : prefs.ollama_model;
          setCurrentModel(activeMod || opts[0]?.name || 'mistral:7b');
          if (prefs.default_tone) {
            const defT = prefs.default_tone.toLowerCase();
            setDefaultToneName(defT);
            setSelectedTone(prefs.default_tone.charAt(0).toUpperCase() + prefs.default_tone.slice(1));
          }
        } else if (opts.length > 0) {
          setCurrentModel(opts[0].name);
        }
      } catch {}
    };

    loadModelInfo();
  }, []);

  // Handle direct model switch
  const handleSelectModel = async (opt: ModelOption) => {
    setCurrentProvider(opt.provider);
    setCurrentModel(opt.name);
    setIsModelDropdownOpen(false);

    try {
      await api.patch('/api/settings/preferences', {
        active_provider: opt.provider,
        ...(opt.provider === 'gemini' ? { gemini_model: opt.name } : { ollama_model: opt.name }),
      });
    } catch {}
  };

  // Fetch contextual chat prompts
  useEffect(() => {
    if (emailId && threadId) {
      aiService.getChatPrompts(emailId, threadId)
        .then(prompts => {
          if (prompts && prompts.length > 0) setChatPrompts(prompts);
        })
        .catch(() => {});
    }
  }, [emailId, threadId]);

  // Load chat history on mount
  useEffect(() => {
    if (emailId) {
      aiService.getChatHistory(emailId)
        .then(hist => {
          if (hist && hist.length > 0) {
            setChatMessages(hist.map(h => ({ role: h.role, content: h.content })));
          }
        })
        .catch(() => {});
    }
  }, [emailId]);

  // Auto-scroll chat
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatStreamingText]);

  const handleToneSelect = (tone: string) => {
    setSelectedTone(tone);
  };

  // --- Chat Handlers ---
  const handleSendChat = async (e?: React.FormEvent, customMsg?: string) => {
    if (e) e.preventDefault();
    const query = (customMsg || chatInput).trim();
    if (!query || isChatStreaming) return;

    if (!customMsg) setChatInput('');
    // Prepend tone hint so the model responds in the chosen style
    const toneHint = selectedTone && selectedTone !== 'Professional'
      ? `[Please respond in a ${selectedTone.toLowerCase()} tone] `
      : '';
    const queryWithTone = toneHint + query;
    setChatMessages(prev => [...prev, { role: 'user', content: query }]);
    setIsChatStreaming(true);
    setChatStreamingText('');

    const controller = new AbortController();
    chatAbortControllerRef.current = controller;

    try {
      let fullAssistant = '';
      await aiService.chatStream(
        emailId,
        threadId,
        queryWithTone,
        (token) => {
          fullAssistant += token;
          setChatStreamingText(fullAssistant);
        },
        (finalContent) => {
          setChatMessages(prev => [...prev, { role: 'assistant', content: finalContent }]);
          setChatStreamingText('');
          setIsChatStreaming(false);
        },
        controller.signal
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setChatMessages(prev => [
          ...prev,
          { role: 'assistant', content: 'Encountered an issue processing your question. Please ensure AI model is running.' }
        ]);
      }
    } finally {
      setIsChatStreaming(false);
      setChatStreamingText('');
      chatAbortControllerRef.current = null;
    }
  };

  const handleStopChat = () => {
    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort();
      if (chatStreamingText) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: chatStreamingText }]);
      }
      setIsChatStreaming(false);
      setChatStreamingText('');
    }
  };

  return (
    <aside className="w-80 sm:w-96 flex flex-col flex-shrink-0 bg-white dark:bg-surface-darkCard border-l border-slate-200/80 dark:border-slate-800/80 h-full relative overflow-hidden select-none">
      {/* Top Header: Title, Model Switcher, Close */}
      <div className="h-14 px-4 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between flex-shrink-0 bg-white dark:bg-surface-darkCard">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-brand-purple flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
            AI Assistance
          </h2>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Quick Model Switcher Dropdown */}
          <div className="relative" ref={modelDropdownRef}>
            <button
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors border border-slate-200/60 dark:border-slate-700/60 max-w-[130px]"
              title="Switch AI model"
            >
              <Cpu className="w-3 h-3 text-brand-purple flex-shrink-0" />
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${currentProvider === 'gemini' ? 'bg-sky-500' : 'bg-emerald-500'}`} />
              <span className="truncate">{currentModel}</span>
              <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
            </button>

            {isModelDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-white dark:bg-surface-darkCard rounded-xl shadow-xl border border-slate-200/90 dark:border-slate-700/80 py-1.5 z-50 text-xs">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Select AI Model
                </div>
                {availableModels.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-400 italic flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                    No models connected
                  </div>
                ) : (
                  availableModels.map((opt) => (
                    <button
                      key={`${opt.provider}-${opt.name}`}
                      onClick={() => handleSelectModel(opt)}
                      className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                        currentModel === opt.name
                          ? 'text-brand-purple font-semibold bg-purple-50/50 dark:bg-purple-950/30'
                          : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className={`w-1.5 h-1.5 rounded-full ${opt.provider === 'gemini' ? 'bg-sky-500' : 'bg-emerald-500'}`} />
                        <span className="truncate">{opt.label}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 uppercase font-mono ml-1">
                        {opt.provider === 'gemini' ? 'Cloud' : 'Local'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Close Assistant"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-slate-100 dark:bg-slate-800 flex-shrink-0" />

      {/* Section title */}
      <div className="px-4 pt-3 pb-1 flex-shrink-0">
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Thread Discussion</span>
      </div>

      {/* Tone Selector Pills */}
      <div className="px-4 pb-2 flex-shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {CHAT_TONES.map(tone => {
            const isSelected = selectedTone.toLowerCase() === tone.toLowerCase();
            const isDefault = defaultToneName.toLowerCase() === tone.toLowerCase();
            return (
              <button
                key={tone}
                onClick={() => handleToneSelect(tone)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex-shrink-0 flex items-center gap-1 ${
                  isSelected
                    ? 'bg-purple-100 dark:bg-purple-950/60 text-brand-purple border border-purple-200 dark:border-purple-800 shadow-2xs font-semibold'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700/60'
                }`}
              >
                <span>{tone}</span>
                {isDefault && (
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full border inline-flex items-center gap-0.5 ${
                      isSelected
                        ? 'bg-brand-purple text-white border-brand-purple'
                        : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                    }`}
                    title="Default tone preset"
                  >
                    <Star className="w-2.5 h-2.5 fill-current" />
                    <span>Default</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>


      {/* Thread Discussion */}
      <div className="flex-1 flex flex-col min-h-0">
          {/* Scrollable Chat Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Suggested Context Prompts */}
            {chatMessages.length === 0 && chatPrompts.length > 0 && (
              <div className="space-y-2 mb-3">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Suggested inquiries
                </span>
                <div className="space-y-1.5">
                  {chatPrompts.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendChat(undefined, prompt)}
                      className="w-full text-left p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[88%] ${
                    msg.role === 'user'
                      ? 'bg-purple-600 text-white rounded-br-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-xs border border-slate-200/60 dark:border-slate-700'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>

                {msg.role === 'assistant' && (
                  <button
                    onClick={() => onInsertToReply(msg.content)}
                    className="text-[11px] text-brand-purple hover:underline font-semibold mt-1 ml-1 flex items-center gap-1"
                  >
                    <span>Use as reply draft</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}

            {/* Live Streaming Message */}
            {isChatStreaming && (
              <div className="flex flex-col items-start">
                <div className="max-w-[88%] rounded-2xl rounded-bl-xs p-3 text-xs leading-relaxed bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/60 dark:border-slate-700">
                  <div className="whitespace-pre-wrap">{chatStreamingText}</div>
                  <span className="inline-block w-2 h-3.5 bg-brand-purple animate-pulse ml-0.5" />
                </div>
                <button
                  onClick={handleStopChat}
                  className="mt-1.5 text-xs text-rose-500 hover:text-rose-600 font-semibold flex items-center gap-1"
                >
                  <Square className="w-3 h-3 fill-rose-500" />
                  <span>Stop generating</span>
                </button>
              </div>
            )}

            <div ref={chatMessagesEndRef} />
          </div>

          {/* Bottom Chat Input */}
          <form onSubmit={handleSendChat} className="p-3 border-t border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface-darkCard flex-shrink-0">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Ask about this email..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                disabled={isChatStreaming}
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-900 dark:text-white rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-purple"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isChatStreaming}
                className="btn-charcoal p-2.5 rounded-xl disabled:opacity-40 flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>

    </aside>
  );
};
