import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { emailService, type ThreadResponse, type ThreadMessage } from '../services/email';
import { authService, type User } from '../services/auth';
import { getCachedUser, getCachedUnreadCount, setCachedUnreadCount } from '../utils/cache';
import { aiService } from '../services/ai';
import api from '../services/api';
import { REFERENCE_THREADS } from '../services/referenceData';
import { getInitials, getAvatarColorClass } from '../utils/avatar';
import { FormattedEmailBody } from '../components/FormattedEmailBody';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { ComposeModal } from '../components/ComposeModal';
import {
  ArrowLeft,
  Sparkles,
  MessageSquare,
  Send,
  Paperclip,
  Link2,
  Bold,
  Italic,
  List,
  Quote,
  Eye,
  Edit3,
  X,
  FileText,
  Reply,
  Copy,
  Check,
  RotateCcw,
  Cpu,
  ChevronDown,
  Wand2,
  Square,
  ArrowRight,
  Star,
} from 'lucide-react';

interface ModelOption {
  provider: 'ollama' | 'gemini';
  name: string;
  label: string;
}

interface CustomTone {
  id: string;
  name: string;
  instruction: string;
  enabled: boolean;
  isDefault?: boolean;
}

interface ChatMessageItem {
  role: 'user' | 'assistant';
  content: string;
  isDraft?: boolean;
}

const BASE_TONES = ['Professional', 'Friendly', 'Concise', 'Formal', 'Direct'];

export const EmailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const threadId = location.state?.threadId || (id?.includes('john') ? 'thread-john-smith-1' : 'thread-1');

  // Core User & Thread State
  const [thread, setThread] = useState<ThreadResponse | null>(null);
  const [user, setUser] = useState<User | null>(getCachedUser);
  const [unreadCount, setUnreadCount] = useState<number>(getCachedUnreadCount);
  const [loading, setLoading] = useState(true);
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  // Panel State: Only one can be open at a time ('none' | 'responder' | 'chat')
  const [activePanel, setActivePanel] = useState<'none' | 'responder' | 'chat'>('none');

  // Bottom Reply Box State
  const [replyText, setReplyText] = useState('');
  const [previewReply, setPreviewReply] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [extraSentMessages, setExtraSentMessages] = useState<ThreadMessage[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Model & Provider State
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [currentModel, setCurrentModel] = useState<string>('mistral:7b');
  const [currentProvider, setCurrentProvider] = useState<'ollama' | 'gemini'>('ollama');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Tones State (combining base + active custom tones)
  const [customTones, setCustomTones] = useState<CustomTone[]>([]);
  const [defaultToneName, setDefaultToneName] = useState<string>(() => {
    try {
      return localStorage.getItem('app_default_tone')?.toLowerCase() || 'professional';
    } catch {
      return 'professional';
    }
  });
  const [responderTone, setResponderTone] = useState<string>('Professional');

  const allAvailableTones = useMemo(() => {
    const list = [...BASE_TONES];
    customTones.forEach(ct => {
      if (!list.includes(ct.name)) list.push(ct.name);
    });
    return list;
  }, [customTones]);

  // Smart Responder State
  const [responderInstruction, setResponderInstruction] = useState('');
  const [responderDraft, setResponderDraft] = useState('');
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [quickChips, setQuickChips] = useState<string[]>([]);
  const [replyCopied, setReplyCopied] = useState(false);
  const responderAbortRef = useRef<AbortController | null>(null);

  // Thread Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [chatStreamingText, setChatStreamingText] = useState('');
  const [chatPrompts, setChatPrompts] = useState<string[]>([]);
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Load User, Unread Count & Thread
  useEffect(() => {
    authService.getMe()
      .then(setUser)
      .catch(() => { navigate('/login'); });

    emailService.getUnreadCount()
      .then((c) => {
        setUnreadCount(c);
        setCachedUnreadCount(c);
      })
      .catch(() => {});

    if (id && threadId) {
      emailService.getThread(id, threadId)
        .then((data) => {
          if (data && data.messages && data.messages.length > 0) setThread(data);
          else setThread(REFERENCE_THREADS[threadId] || null);
        })
        .catch(() => { setThread(REFERENCE_THREADS[threadId] || null); })
        .finally(() => setLoading(false));
    } else {
      setThread(REFERENCE_THREADS[threadId] || null);
      setLoading(false);
    }
  }, [id, threadId, navigate]);

  // Load Models, Preferences & Custom Tones
  useEffect(() => {
    const loadAiConfig = async () => {
      try {
        const [prefRes, ollamaRes] = await Promise.all([
          api.get('/api/settings/preferences').catch(() => null),
          api.get('/api/settings/models/ollama').catch(() => null),
        ]);

        const opts: ModelOption[] = [];
        if (ollamaRes?.data?.models) {
          ollamaRes.data.models.forEach((m: any) => {
            opts.push({ provider: 'ollama', name: m.name, label: m.name });
          });
        }
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
            try {
              localStorage.setItem('app_default_tone', defT);
            } catch {}
          }
        } else if (opts.length > 0) {
          setCurrentModel(opts[0].name);
        }
      } catch {}
    };

    loadAiConfig();

    // Load active custom tones from localStorage (fallback to app_custom_tones or emailai_custom_tones)
    try {
      const storedTones = localStorage.getItem('app_custom_tones') || localStorage.getItem('emailai_custom_tones');
      if (storedTones) {
        const parsed = JSON.parse(storedTones) as CustomTone[];
        const enabledTones = parsed.filter(t => t.enabled);
        setCustomTones(enabledTones);
        const def = enabledTones.find(t => t.isDefault);
        if (def) {
          setDefaultToneName(def.name.toLowerCase());
          try {
            localStorage.setItem('app_default_tone', def.name.toLowerCase());
          } catch {}
        }
      } else {
        // Fallback default custom tones if not yet saved in localStorage
        const defaults: CustomTone[] = [
          {
            id: 'tone-1',
            name: 'Executive Brief',
            instruction: 'Extremely concise, bullet points only, action-oriented with decision deadlines.',
            enabled: true,
            isDefault: false,
          },
          {
            id: 'tone-2',
            name: 'Warm & Empathetic',
            instruction: 'Supportive and encouraging, friendly sign-off, acknowledging personal context.',
            enabled: true,
            isDefault: false,
          },
        ];
        setCustomTones(defaults);
      }
    } catch {}
  }, []);

  // Sync responderTone when defaultToneName or allAvailableTones are ready
  useEffect(() => {
    if (defaultToneName && allAvailableTones.length > 0) {
      const match = allAvailableTones.find(t => t.toLowerCase() === defaultToneName.toLowerCase());
      if (match) {
        setResponderTone(match);
      }
    }
  }, [defaultToneName, allAvailableTones]);

  // Close model dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch quick suggestions & chat prompts
  useEffect(() => {
    if (id && threadId) {
      aiService.getQuickReplies(id, threadId)
        .then((chips) => {
          if (chips && chips.length > 0) setQuickChips(chips);
        })
        .catch(() => {});

      aiService.getChatPrompts(id, threadId)
        .then((prompts) => {
          if (prompts && prompts.length > 0) setChatPrompts(prompts);
        })
        .catch(() => {});

      aiService.getChatHistory(id)
        .then((history) => {
          if (history && history.length > 0) {
            setChatMessages(history.map(h => ({
              role: h.role,
              content: h.content,
              isDraft: checkIfDraft(h.content),
            })));
          }
        })
        .catch(() => {});
    }
  }, [id, threadId]);

  // Scroll chat to bottom
  useEffect(() => {
    if (activePanel === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatStreamingText, activePanel]);

  const activeThread = thread || REFERENCE_THREADS['thread-john-smith-1'];
  const firstMessage = activeThread?.messages?.[0];
  const subjectTitle = firstMessage?.subject || 'Inquiry on pricing and integration';
  const senderFull = firstMessage?.from || 'John Smith <john.smith@acmecorp.com>';
  const senderName = senderFull.split('<')[0].replace(/"/g, '').trim() || 'John Smith';

  // Display messages ordered: newest sent/received on top, oldest at the bottom
  const orderedMessages = useMemo(() => {
    const threadMsgs = activeThread?.messages ? [...activeThread.messages].reverse() : [];
    const sentMsgs = [...extraSentMessages].reverse();
    return [...sentMsgs, ...threadMsgs];
  }, [activeThread, extraSentMessages]);

  const handleLogout = async () => {
    await authService.logout();
    navigate('/login');
  };

  // Toggle panels with mutual exclusivity
  const togglePanel = (panel: 'responder' | 'chat') => {
    setActivePanel((prev) => (prev === panel ? 'none' : panel));
  };

  // Model switch
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

  // Formatting buttons for reply bar
  const insertFormatting = (before: string, after: string = '', defaultPlaceholder: string = '') => {
    const textarea = replyTextareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = replyText.substring(start, end) || defaultPlaceholder;
    const replacement = `${before}${selected}${after}`;
    const nextVal = replyText.substring(0, start) + replacement + replyText.substring(end);
    setReplyText(nextVal);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  };

  const handleInsertLink = () => {
    const url = prompt('Enter link URL (e.g. https://example.com):');
    if (!url) return;
    const text = prompt('Enter link text:', 'link') || 'link';
    insertFormatting(`[${text}](${url})`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAttachedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Send reply
  const handleSendReply = async () => {
    if (!replyText.trim() || isSending) return;
    setIsSending(true);
    const newReply: ThreadMessage = {
      id: `reply-${Date.now()}`,
      from: `${user?.name || 'You'} <${user?.email || 'user@work.com'}>`,
      to: senderFull,
      date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      subject: `Re: ${subjectTitle}`,
      body: replyText,
    };

    try {
      if (id) await aiService.sendReply(id, { response_id: 1, edited_text: replyText });
    } catch {}

    setExtraSentMessages(prev => [...prev, newReply]);
    setReplyText('');
    setAttachedFiles([]);
    setIsSending(false);
  };

  // Helper to determine if a message is an email draft
  function checkIfDraft(text: string): boolean {
    const lower = text.toLowerCase();
    const hasGreeting = /^(hi|hello|dear)\s+/m.test(lower) || lower.includes('dear ') || lower.includes('hi ');
    const hasSignoff = /(best regards|sincerely|thanks,|thank you,|warm regards|cheers,)/m.test(lower);
    const hasSubject = /subject:/i.test(lower);
    return (hasGreeting && hasSignoff) || hasSubject || text.includes('I am writing to') || text.includes('Thank you for reaching out');
  }

  // Smart Responder generation
  const handleGenerateSmartReply = async (customInstructionOverride?: string) => {
    if (isGeneratingReply) return;
    const instruction = customInstructionOverride !== undefined ? customInstructionOverride : responderInstruction;
    setIsGeneratingReply(true);
    setResponderDraft('');

    const controller = new AbortController();
    responderAbortRef.current = controller;

    try {
      if (id) {
        let accumulated = '';
        await aiService.streamReply(
          id,
          {
            thread_id: threadId,
            tone: responderTone.toLowerCase(),
            custom_instruction: instruction || undefined,
          },
          (token) => {
            accumulated += token;
            setResponderDraft(accumulated);
          },
          undefined,
          (fullText) => {
            setResponderDraft(fullText);
            setIsGeneratingReply(false);
          },
          controller.signal
        );
      } else {
        // Fallback demo response if no backend connection
        setTimeout(() => {
          setResponderDraft(`Hi ${senderName},\n\nThank you for following up. I am currently reviewing the details of our agreement and will get back to you with the finalized items by tomorrow morning.\n\nBest regards,\n${user?.name || 'Viren'}`);
          setIsGeneratingReply(false);
        }, 800);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setResponderDraft('Could not generate smart reply. Please verify that the selected AI model is reachable.');
      }
      setIsGeneratingReply(false);
    } finally {
      responderAbortRef.current = null;
    }
  };

  const handleStopResponderGeneration = () => {
    if (responderAbortRef.current) {
      responderAbortRef.current.abort();
      setIsGeneratingReply(false);
    }
  };

  const handleInsertDraftToReply = (textToInsert: string) => {
    setReplyText(textToInsert);
    setTimeout(() => {
      replyTextareaRef.current?.focus();
    }, 50);
  };

  const handleCopyDraft = (text: string) => {
    navigator.clipboard.writeText(text);
    setReplyCopied(true);
    setTimeout(() => setReplyCopied(false), 2000);
  };

  // Chat Submission
  const handleSendChat = async (e?: React.FormEvent, customMsg?: string) => {
    if (e) e.preventDefault();
    const query = (customMsg || chatInput).trim();
    if (!query || isChatStreaming) return;

    if (!customMsg) setChatInput('');
    const isExplicitDraftRequest = /\b(draft|reply|respond|write\s+(a\s+)?(mail|email|response))\b/i.test(query);

    setChatMessages(prev => [...prev, { role: 'user', content: query }]);
    setIsChatStreaming(true);
    setChatStreamingText('');

    const controller = new AbortController();
    chatAbortRef.current = controller;

    try {
      let accumulated = '';
      if (id) {
        await aiService.chatStream(
          id,
          threadId,
          query,
          (token) => {
            accumulated += token;
            setChatStreamingText(accumulated);
          },
          (finalContent) => {
            const isDraftResult = isExplicitDraftRequest || checkIfDraft(finalContent);
            setChatMessages(prev => [...prev, {
              role: 'assistant',
              content: finalContent,
              isDraft: isDraftResult,
            }]);
            setChatStreamingText('');
            setIsChatStreaming(false);
          },
          controller.signal
        );
      } else {
        setTimeout(() => {
          const fallbackText = isExplicitDraftRequest
            ? `Hi ${senderName},\n\nI have received your note and will review the specifications today. I will update you as soon as possible.\n\nBest regards,\n${user?.name || 'Viren'}`
            : `Here is a summary of the thread: ${senderName} requested clarification regarding the onboarding timeline and budget allocation.`;
          setChatMessages(prev => [...prev, {
            role: 'assistant',
            content: fallbackText,
            isDraft: isExplicitDraftRequest,
          }]);
          setIsChatStreaming(false);
        }, 700);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setChatMessages(prev => [
          ...prev,
          { role: 'assistant', content: 'Encountered an issue processing your query. Please ensure the AI service is active.' }
        ]);
      }
      setIsChatStreaming(false);
      setChatStreamingText('');
    } finally {
      chatAbortRef.current = null;
    }
  };

  const handleStopChat = () => {
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      if (chatStreamingText) {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: chatStreamingText,
          isDraft: checkIfDraft(chatStreamingText),
        }]);
      }
      setIsChatStreaming(false);
      setChatStreamingText('');
    }
  };

  // Transition from Chat -> Smart Responder
  const handleRefineInResponder = (draftText: string) => {
    setResponderDraft(draftText);
    setActivePanel('responder');
  };

  return (
    <div className="w-full h-screen flex flex-col bg-white dark:bg-surface-darkCard overflow-hidden">
      {/* ── Universal Header ── */}
      <Header
        user={user}
        showSearch={false}
        onLogout={handleLogout}
        customCenterContent={
          <div className="flex items-center gap-2.5 w-full min-w-0">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
              title="Back to inbox"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0 flex-1 truncate">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {subjectTitle}
              </h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                {senderFull}
              </p>
            </div>
          </div>
        }
        rightActionContent={
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#1C1D2A] border border-slate-200/80 dark:border-slate-800/80">
            {/* Smart Responder Toggle */}
            <button
              onClick={() => togglePanel('responder')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activePanel === 'responder'
                  ? 'bg-brand-purple text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Open intelligent email responder"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Smart Responder</span>
            </button>

            {/* AI Thread Chat Toggle */}
            <button
              onClick={() => togglePanel('chat')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activePanel === 'chat'
                  ? 'bg-brand-purple text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Chat about this email thread"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Thread Chat</span>
            </button>
          </div>
        }
      />

      {/* ── Main Layout: Sidebar + Thread Body + Side Panel ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          user={user}
          activePage="email"
          unreadCount={unreadCount}
          onOpenCompose={() => setIsComposeOpen(true)}
          onLogout={handleLogout}
        />

        {/* Central Thread View */}
        <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-surface-darkCard overflow-hidden">
          {/* Messages list */}
          <div className="flex-1 overflow-y-auto py-6 px-4 sm:px-8">
            <div className="max-w-3xl mx-auto space-y-5">
              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700/60" />
                <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Conversation</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700/60" />
              </div>

              {loading ? (
                <div className="text-center text-xs text-slate-400 py-12">Loading conversation...</div>
              ) : orderedMessages.length === 0 ? (
                <div className="text-center text-xs text-slate-400 py-12">No messages found in this thread.</div>
              ) : (
                orderedMessages.map((msg, idx) => {
                  const isUser =
                    msg.from.toLowerCase().includes('(you)') ||
                    msg.from.toLowerCase().includes('emily') ||
                    (user?.email && msg.from.includes(user.email)) ||
                    (user?.name && msg.from.includes(user.name));
                  const authorName = msg.from.split('<')[0].replace(/"/g, '').trim();

                  return (
                    <div key={msg.id || idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl p-5 space-y-3 border ${
                        isUser
                          ? 'bg-brand-purple/5 dark:bg-brand-purple/10 border-brand-purple/20 dark:border-brand-purple/20'
                          : 'bg-slate-50/80 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-700/60'
                      }`}>
                        <div className="flex items-center justify-between gap-6">
                          <div className="flex items-center gap-2.5">
                            {isUser && user?.picture ? (
                              <img src={user.picture} alt={authorName} referrerPolicy="no-referrer" className="w-7 h-7 rounded-full object-cover ring-1 ring-slate-200" />
                            ) : (
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] ${getAvatarColorClass(authorName)}`}>
                                {getInitials(authorName)}
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
                                  {isUser ? `${user?.name || authorName} (You)` : authorName}
                                </span>
                                {idx === 0 && (
                                  <span className="text-[10px] font-bold text-brand-purple bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 px-1.5 py-0.2 rounded-full">
                                    Latest
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400">{msg.from.match(/<([^>]+)>/)?.[1] || ''}</span>
                            </div>
                          </div>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 flex-shrink-0">{msg.date || 'Today'}</span>
                        </div>
                        <FormattedEmailBody body={msg.body} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Reply Bar with Markdown Formatting Toolbar ── */}
          <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-darkCard px-4 sm:px-6 py-3">
            <div className="max-w-3xl mx-auto">
              <div className="rounded-2xl border border-slate-200/90 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 focus-within:border-brand-purple/50 focus-within:ring-2 focus-within:ring-brand-purple/10 transition-all duration-200 overflow-hidden">
                {/* Header bar of reply composer */}
                <div className="flex items-center justify-between px-3.5 pt-2.5 pb-2 border-b border-slate-100 dark:border-slate-700/60 bg-white/40 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <Reply className="w-3.5 h-3.5 text-brand-purple" />
                    <span>Reply to {senderName}</span>
                  </div>

                  {/* Mode switcher: Write / Preview */}
                  <div className="flex items-center bg-slate-100 dark:bg-slate-700/80 p-0.5 rounded-lg text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setPreviewReply(false)}
                      className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                        !previewReply
                          ? 'bg-white dark:bg-surface-darkCard text-slate-900 dark:text-white shadow-xs font-semibold'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                      }`}
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Write</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewReply(true)}
                      className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                        previewReply
                          ? 'bg-white dark:bg-surface-darkCard text-slate-900 dark:text-white shadow-xs font-semibold'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      <span>Preview</span>
                    </button>
                  </div>
                </div>

                {/* Attached File Badges */}
                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-3.5 pt-2">
                    {attachedFiles.map((f, i) => (
                      <div key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 text-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                        <FileText className="w-3.5 h-3.5 text-slate-500" />
                        <span className="truncate max-w-[150px]">{f.name}</span>
                        <button onClick={() => handleRemoveFile(i)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ml-1">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Editor or Preview Pane */}
                {previewReply ? (
                  <div className="px-4 py-3 min-h-[90px] max-h-56 overflow-y-auto text-xs sm:text-sm bg-white dark:bg-surface-darkCard">
                    {replyText.trim() ? (
                      <FormattedEmailBody body={replyText} />
                    ) : (
                      <span className="text-slate-400 italic">No content to preview yet. Write your message first.</span>
                    )}
                  </div>
                ) : (
                  <textarea
                    ref={replyTextareaRef}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write a clear, thoughtful reply..."
                    rows={replyText.includes('\n') ? 5 : 3}
                    className="w-full px-3.5 py-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 bg-transparent focus:outline-none resize-none leading-relaxed"
                  />
                )}

                <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />

                {/* Formatting Toolbar */}
                <div className="flex items-center justify-between px-3.5 py-2 border-t border-slate-100 dark:border-slate-700/60 bg-white/40 dark:bg-slate-800/20">
                  <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                    <button
                      onClick={() => insertFormatting('**', '**', 'bold')}
                      className="p-1.5 rounded-lg hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                      title="Bold (**text**)"
                    >
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => insertFormatting('*', '*', 'italic')}
                      className="p-1.5 rounded-lg hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                      title="Italic (*text*)"
                    >
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => insertFormatting('- ', '', 'list item')}
                      className="p-1.5 rounded-lg hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                      title="Bullet list"
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => insertFormatting('> ', '', 'quote')}
                      className="p-1.5 rounded-lg hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                      title="Quote"
                    >
                      <Quote className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleInsertLink}
                      className="p-1.5 rounded-lg hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                      title="Insert link"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="p-1.5 rounded-lg hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
                      title="Attach file"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      <span className="text-[11px] hidden sm:inline">Attach</span>
                    </button>
                  </div>

                  <button
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || isSending}
                    className="btn-charcoal px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 shadow-sm active:scale-[0.98] transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSending ? 'Sending...' : 'Send'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* ── Side Panels Container (Mutually Exclusive: Smart Responder OR Thread Chat) ── */}
        <aside
          className={`flex-shrink-0 overflow-hidden border-l border-slate-200/80 dark:border-slate-800/80 transition-all duration-300 ease-in-out bg-white dark:bg-surface-darkCard flex flex-col ${
            activePanel !== 'none' ? 'w-80 sm:w-96 opacity-100' : 'w-0 opacity-0 pointer-events-none'
          }`}
        >
          {/* Top Panel Header (Shared style for both panels) */}
          <div className="h-14 px-4 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between flex-shrink-0 bg-white dark:bg-surface-darkCard">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-brand-purple flex items-center justify-center flex-shrink-0">
                {activePanel === 'responder' ? (
                  <Sparkles className="w-3.5 h-3.5" />
                ) : (
                  <MessageSquare className="w-3.5 h-3.5" />
                )}
              </div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                {activePanel === 'responder' ? 'Smart Responder' : 'Thread Discussion'}
              </h3>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Model Switcher Dropdown */}
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
                  <div className="absolute right-0 top-full mt-1.5 w-56 bg-white dark:bg-[#1E1F2E] rounded-xl shadow-xl border border-slate-200/90 dark:border-slate-700/80 py-1.5 z-50 text-xs">
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Select Model
                    </div>
                    {availableModels.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-400 italic">No models found</div>
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

              {/* Close Button */}
              <button
                onClick={() => setActivePanel('none')}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Close panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────────────── */}
          {/* PANEL 1: SMART RESPONDER                                      */}
          {/* ───────────────────────────────────────────────────────────── */}
          {activePanel === 'responder' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 space-y-4">
              {/* Tone Selection */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                  Response Tone
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {allAvailableTones.map((tone) => {
                    const isSelected = responderTone.toLowerCase() === tone.toLowerCase();
                    const isDefault =
                      defaultToneName.toLowerCase() === tone.toLowerCase() ||
                      customTones.some((ct) => ct.isDefault && ct.name.toLowerCase() === tone.toLowerCase());

                    return (
                      <button
                        key={tone}
                        type="button"
                        onClick={() => setResponderTone(tone)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
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

              {/* Specific Instructions input */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                  Guidance / Instructions
                </label>
                <textarea
                  value={responderInstruction}
                  onChange={(e) => setResponderInstruction(e.target.value)}
                  placeholder="E.g. Confirm my availability for Thursday at 2pm, or let them know I am reviewing the budget..."
                  rows={2}
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-xs text-slate-900 dark:text-white rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-brand-purple resize-none"
                />
              </div>

              {/* Quick Suggestion Chips */}
              {quickChips.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Quick Reply Scenarios
                  </span>
                  <div className="space-y-1.5">
                    {quickChips.map((chip, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setResponderInstruction(chip);
                          handleGenerateSmartReply(chip);
                        }}
                        className="w-full text-left p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60 transition-colors flex items-center justify-between"
                      >
                        <span className="truncate">{chip}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0 ml-1" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Generate Button */}
              <div>
                {isGeneratingReply ? (
                  <button
                    onClick={handleStopResponderGeneration}
                    className="w-full py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-rose-100 transition-colors"
                  >
                    <Square className="w-3.5 h-3.5 fill-rose-500" />
                    <span>Stop Generating</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleGenerateSmartReply()}
                    className="w-full btn-charcoal py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99]"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Generate Smart Reply</span>
                  </button>
                )}
              </div>

              {/* Generated Draft Display Card */}
              {responderDraft && (
                <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Draft Preview & Editor
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopyDraft(responderDraft)}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                        title="Copy draft"
                      >
                        {replyCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleGenerateSmartReply()}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                        title="Regenerate"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={responderDraft}
                    onChange={(e) => setResponderDraft(e.target.value)}
                    rows={6}
                    className="w-full p-3 rounded-xl bg-slate-50 dark:bg-[#12131D] border border-slate-200/90 dark:border-slate-700 text-xs leading-relaxed text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand-purple resize-none"
                  />

                  <button
                    onClick={() => handleInsertDraftToReply(responderDraft)}
                    className="w-full py-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-brand-purple border border-purple-200 dark:border-purple-900/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <span>Insert into Reply Editor</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* PANEL 2: AI THREAD CHAT                                       */}
          {/* ───────────────────────────────────────────────────────────── */}
          {activePanel === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Chat Messages Stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Suggested Inquiry Pills */}
                {chatMessages.length === 0 && chatPrompts.length > 0 && (
                  <div className="space-y-2 mb-3">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Suggested inquiries
                    </span>
                    <div className="space-y-1.5">
                      {chatPrompts.map((p, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSendChat(undefined, p)}
                          className="w-full text-left p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60 transition-colors"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Messages history */}
                {chatMessages.map((msg, i) => {
                  const isAssistant = msg.role === 'assistant';

                  // If assistant generated an email reply draft, display special elevated UI card!
                  if (isAssistant && msg.isDraft) {
                    return (
                      <div key={i} className="flex flex-col items-start w-full my-1">
                        <div className="w-full rounded-2xl p-3.5 bg-gradient-to-b from-purple-50/50 to-white dark:from-purple-950/20 dark:to-surface-darkCard border border-purple-200 dark:border-purple-900/80 shadow-xs space-y-2.5">
                          <div className="flex items-center justify-between border-b border-purple-100 dark:border-purple-900/40 pb-2">
                            <div className="flex items-center gap-1.5 text-brand-purple text-xs font-semibold">
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Email Reply Draft</span>
                            </div>
                            <span className="text-[10px] text-slate-400 uppercase font-mono">First-Person</span>
                          </div>

                          <div className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                            {msg.content}
                          </div>

                          {/* Distinct Action Buttons */}
                          <div className="flex items-center gap-2 pt-1 border-t border-purple-100 dark:border-purple-900/40">
                            {/* Prominent Refine Button -> switches to Smart Responder! */}
                            <button
                              onClick={() => handleRefineInResponder(msg.content)}
                              className="flex-1 py-1.5 px-2.5 rounded-lg bg-brand-purple text-white text-[11px] font-semibold flex items-center justify-center gap-1 shadow-2xs hover:bg-purple-700 transition-colors"
                              title="Open in Smart Responder to adjust tone and refine"
                            >
                              <Wand2 className="w-3 h-3" />
                              <span>Refine this message</span>
                            </button>

                            <button
                              onClick={() => handleInsertDraftToReply(msg.content)}
                              className="py-1.5 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                              title="Directly insert into reply composer"
                            >
                              <span>Insert</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Standard chat bubble
                  return (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[88%] ${
                          msg.role === 'user'
                            ? 'bg-purple-600 text-white rounded-br-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-xs border border-slate-200/60 dark:border-slate-700'
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>

                      {/* Small action for assistant bubble */}
                      {isAssistant && (
                        <div className="flex items-center gap-3 mt-1 ml-1">
                          <button
                            onClick={() => handleRefineInResponder(msg.content)}
                            className="text-[11px] text-brand-purple hover:underline font-semibold flex items-center gap-1"
                          >
                            <span>Refine in Responder</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleInsertDraftToReply(msg.content)}
                            className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            Insert to reply
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Streaming Assistant Bubble */}
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

                <div ref={chatBottomRef} />
              </div>

              {/* Chat Input Form */}
              <form onSubmit={handleSendChat} className="p-3 border-t border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface-darkCard flex-shrink-0">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Ask a question or 'draft a reply saying...' "
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={isChatStreaming}
                    className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-900 dark:text-white rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-purple"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isChatStreaming}
                    className="btn-charcoal p-2.5 rounded-xl disabled:opacity-40 flex-shrink-0"
                    title="Send message"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          )}
        </aside>
      </div>

      {/* Compose Modal support from Sidebar */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
      />
    </div>
  );
};

export default EmailView;
