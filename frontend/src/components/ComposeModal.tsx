import React, { useState, useEffect, useRef } from 'react';
import { emailService } from '../services/email';
import { aiService } from '../services/ai';
import { settingsService } from '../services/settings';
import { FormattedEmailBody } from './FormattedEmailBody';
import {
  Sparkles,
  Send,
  X,
  Maximize2,
  Minimize2,
  Paperclip,
  Image as ImageIcon,
  Link2,
  Bold,
  Italic,
  List,
  Bot,
  User as UserIcon,
  FileText,
  Cpu,
  BookmarkCheck,
  Eye,
  PenTool,
  ChevronDown,
  Check,
} from 'lucide-react';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface AttachedFile {
  id: string;
  name: string;
  size: string;
  type: 'file' | 'image';
  previewUrl?: string;
}

interface ChatBubble {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  time: string;
}

interface ModelOption {
  name: string;
  provider: 'ollama' | 'gemini';
  label: string;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Mode: 'write' or 'preview'
  const [editorMode, setEditorMode] = useState<'write' | 'preview'>('write');

  // Expand modal state (80-90% by default, or maximized 96%)
  const [isMaximized, setIsMaximized] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Link dialog
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');

  // AI Chat & Models state
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState<string>('');
  const [defaultToneName, setDefaultToneName] = useState<string>(() => {
    try {
      return localStorage.getItem('app_default_tone')?.toLowerCase() || 'professional';
    } catch {
      return 'professional';
    }
  });
  const [aiTone, setAiTone] = useState<string>(() => {
    try {
      return localStorage.getItem('app_default_tone')?.toLowerCase() || 'professional';
    } catch {
      return 'professional';
    }
  });
  const [availableTones, setAvailableTones] = useState<string[]>([
    'professional',
    'friendly',
    'concise',
    'formal',
    'urgent',
  ]);

  const [chatMessages, setChatMessages] = useState<ChatBubble[]>([
    {
      id: 'init-1',
      role: 'assistant',
      text: "Hi! Tell me what you'd like to say, and I'll craft both the subject line and the email body. You can keep prompting me here to iteratively adjust either part.",
      time: 'Just now',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftSavedMsg, setDraftSavedMsg] = useState(false);

  // Custom Model Dropdown state
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Close model dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Load available models and default preferences + custom tones
  useEffect(() => {
    if (!isOpen) return;

    // Load custom tones from localStorage (both app_custom_tones and emailai_custom_tones fallback)
    try {
      const storedTones = localStorage.getItem('app_custom_tones') || localStorage.getItem('emailai_custom_tones');
      if (storedTones) {
        const parsed = JSON.parse(storedTones);
        const enabledCustoms = parsed.filter((t: any) => t.enabled).map((t: any) => t.name.toLowerCase());
        setAvailableTones((prev) => Array.from(new Set([...prev, ...enabledCustoms])));
      }
    } catch {}

    // Check for saved local draft
    try {
      const savedDraft = localStorage.getItem('app_saved_compose_draft');
      if (savedDraft && !to && !subject && !body) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.to) setTo(parsed.to);
        if (parsed.cc) { setCc(parsed.cc); setShowCc(true); }
        if (parsed.bcc) { setBcc(parsed.bcc); setShowBcc(true); }
        if (parsed.subject) setSubject(parsed.subject);
        if (parsed.body) setBody(parsed.body);
      }
    } catch {}

    Promise.all([
      settingsService.getPreferences().catch(() => null),
      settingsService.getOllamaModels().catch(() => []),
      settingsService.getGeminiModels().catch(() => []),
    ]).then(([prefData, oModels, gModels]) => {
      const modelOptions: ModelOption[] = [];

      // Add Gemini models if key available
      if (prefData?.has_gemini_key) {
        if (gModels && gModels.length > 0) {
          gModels.forEach((m) => {
            modelOptions.push({
              name: m.name,
              provider: 'gemini',
              label: `Gemini: ${m.name}`,
            });
          });
        } else {
          modelOptions.push({
            name: 'gemini-2.5-flash',
            provider: 'gemini',
            label: 'Gemini: 2.5 Flash',
          });
          modelOptions.push({
            name: 'gemini-flash-lite-latest',
            provider: 'gemini',
            label: 'Gemini: Flash Lite',
          });
        }
      }

      // Add Ollama models
      if (oModels && oModels.length > 0) {
        oModels.forEach((m) => {
          modelOptions.push({
            name: m.name,
            provider: 'ollama',
            label: `Ollama: ${m.name}`,
          });
        });
      } else {
        modelOptions.push({
          name: 'mistral',
          provider: 'ollama',
          label: 'Ollama: mistral',
        });
      }

      setModels(modelOptions);

      // Determine default model
      const activeProv = prefData?.preferences?.active_provider || 'gemini';
      const activeModel =
        activeProv === 'gemini'
          ? prefData?.preferences?.gemini_model || 'gemini-2.5-flash'
          : prefData?.preferences?.ollama_model || 'mistral';

      const match = modelOptions.find(
        (m) => m.provider === activeProv && m.name === activeModel
      ) || modelOptions[0];

      if (match) {
        setSelectedModelKey(`${match.provider}::${match.name}`);
      }

      // Determine default tone preset
      const prefTone = prefData?.preferences?.default_tone || localStorage.getItem('app_default_tone') || 'professional';
      setDefaultToneName(prefTone.toLowerCase());
      setAiTone(prefTone.toLowerCase());
    });
  }, [isOpen]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isGenerating]);

  if (!isOpen) return null;

  // Formatting helpers for textarea
  const insertFormatting = (prefix: string, suffix: string = '') => {
    setEditorMode('write');
    const textarea = bodyTextareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = body.substring(start, end);
    const replacement = `${prefix}${selected || 'text'}${suffix}`;
    const newBody = body.substring(0, start) + replacement + body.substring(end);
    setBody(newBody);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + (selected ? selected.length : 4));
    }, 10);
  };

  const handleInsertLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkUrl.trim()) return;
    const textToUse = linkText.trim() || linkUrl.trim();
    const formatted = `[${textToUse}](${linkUrl.trim()})`;
    setBody((prev) => (prev ? `${prev} ${formatted}` : formatted));
    setLinkUrl('');
    setLinkText('');
    setShowLinkDialog(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'file' | 'image') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: AttachedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const sizeStr = f.size > 1024 * 1024 ? `${(f.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(f.size / 1024)} KB`;
      newItems.push({
        id: `${Date.now()}-${i}`,
        name: f.name,
        size: sizeStr,
        type,
        previewUrl: type === 'image' ? URL.createObjectURL(f) : undefined,
      });
    }
    setAttachments((prev) => [...prev, ...newItems]);
    e.target.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSaveDraft = async () => {
    if (!body.trim() && !subject.trim() && !to.trim()) return;
    setIsSavingDraft(true);

    // Save to local cache
    try {
      const draft = { to, cc, bcc, subject, body };
      localStorage.setItem('app_saved_compose_draft', JSON.stringify(draft));
    } catch {}

    // Automatically save draft to Google
    try {
      await emailService.saveGoogleDraft({
        to: to.trim(),
        subject: subject.trim(),
        body: body.trim(),
      });
    } catch {}

    setIsSavingDraft(false);
    setDraftSavedMsg(true);
    setTimeout(() => setDraftSavedMsg(false), 2500);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to.trim() || !subject.trim() || !body.trim()) {
      return;
    }

    setIsSending(true);
    try {
      let fullBody = body.trim();
      if (attachments.length > 0) {
        fullBody += `\n\n[Attachments: ${attachments.map(a => a.name).join(', ')}]`;
      }
      await emailService.composeEmail({
        to: to.trim(),
        subject: subject.trim(),
        body: fullBody,
      });
      localStorage.removeItem('app_saved_compose_draft');
      setTo('');
      setCc('');
      setBcc('');
      setSubject('');
      setBody('');
      setAttachments([]);
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to send email. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  // Iterative chat-based draft generation
  const handleSendAiPrompt = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const prompt = chatInput.trim();
    if (!prompt || isGenerating) return;

    const userBubble: ChatBubble = {
      id: Date.now().toString(),
      role: 'user',
      text: prompt,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, userBubble]);
    setChatInput('');
    setIsGenerating(true);

    const [chosenProvider, chosenModel] = selectedModelKey.split('::');

    try {
      const historyContext = chatMessages.slice(-6).map((m) => ({
        role: m.role,
        content: m.text,
      }));

      const res = await aiService.generateComposeDraft({
        prompt,
        recipient: to,
        subject,
        current_body: body,
        tone: aiTone,
        model_name: chosenModel,
        provider: chosenProvider,
        chat_history: historyContext,
        image_names: attachments.map((a) => a.name),
      });

      if (res.subject) {
        setSubject(res.subject);
      }
      if (res.draft) {
        setBody(res.draft);
      }

      const assistantBubble: ChatBubble = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: res.reply || "I've updated the subject line and email draft.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages((prev) => [...prev, assistantBubble]);
    } catch (err: any) {
      const errorBubble: ChatBubble = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: "Could not complete this draft request. Please ensure the selected AI model/service is running.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages((prev) => [...prev, errorBubble]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in select-none">
      <div
        className={`bg-white dark:bg-surface-darkCard rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden flex flex-col transition-all duration-300 ease-out ${
          isMaximized ? 'w-[96vw] h-[95vh]' : 'w-[90vw] max-w-6xl h-[88vh]'
        }`}
      >
        {/* Header - Clean with proper padding and without congested badge */}
        <div className="h-14 px-6 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between bg-white dark:bg-surface-darkCard flex-shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              New Message
            </h3>
            {draftSavedMsg && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 animate-fade-in">
                <BookmarkCheck className="w-3.5 h-3.5" />
                Draft saved
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMaximized((prev) => !prev)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={isMaximized ? 'Restore size' : 'Expand window'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Main Body: Side-by-Side Left Editor & Permanent Right AI Chat */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
          {/* Left: Email Creation Form */}
          <form
            onSubmit={handleSend}
            className="flex-1 p-5 md:p-6 flex flex-col min-w-0 overflow-y-auto space-y-3 border-b md:border-b-0 md:border-r border-slate-200/80 dark:border-slate-800/80"
          >
            {/* Recipient + CC/BCC toggles */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  required
                  placeholder="To: recipient@example.com"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#1C1D2A] border border-slate-200/80 dark:border-slate-700/70 text-slate-900 dark:text-white rounded-xl px-4 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple transition-all"
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowCc(!showCc)}
                    className={`px-2 py-1 text-xs font-semibold rounded-lg transition-colors ${
                      showCc || cc
                        ? 'bg-purple-100 dark:bg-purple-950/60 text-brand-purple'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                    }`}
                  >
                    Cc
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBcc(!showBcc)}
                    className={`px-2 py-1 text-xs font-semibold rounded-lg transition-colors ${
                      showBcc || bcc
                        ? 'bg-purple-100 dark:bg-purple-950/60 text-brand-purple'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                    }`}
                  >
                    Bcc
                  </button>
                </div>
              </div>

              {/* CC Input */}
              {showCc && (
                <input
                  type="text"
                  placeholder="Cc: someone@example.com"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#1C1D2A] border border-slate-200/80 dark:border-slate-700/70 text-slate-900 dark:text-white rounded-xl px-4 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple transition-all animate-fade-in"
                />
              )}

              {/* BCC Input */}
              {showBcc && (
                <input
                  type="text"
                  placeholder="Bcc: secret@example.com"
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#1C1D2A] border border-slate-200/80 dark:border-slate-700/70 text-slate-900 dark:text-white rounded-xl px-4 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple transition-all animate-fade-in"
                />
              )}
            </div>

            {/* Subject */}
            <div>
              <input
                type="text"
                required
                placeholder="Subject line"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#1C1D2A] border border-slate-200/80 dark:border-slate-700/70 text-slate-900 dark:text-white rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple transition-all"
              />
            </div>

            {/* Formatting Toolbar + Write / Preview Toggle */}
            <div className="flex items-center justify-between border-y border-slate-200/60 dark:border-slate-800/60 py-1.5 px-2 bg-slate-50/50 dark:bg-[#13141E] rounded-lg">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => insertFormatting('**', '**')}
                  className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                  title="Bold"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertFormatting('*', '*')}
                  className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                  title="Italic"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertFormatting('\n- ')}
                  className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                  title="Bullet list"
                >
                  <List className="w-3.5 h-3.5" />
                </button>

                <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />

                {/* Insert Link */}
                <button
                  type="button"
                  onClick={() => setShowLinkDialog((prev) => !prev)}
                  className={`p-1.5 rounded-md transition-colors ${
                    showLinkDialog
                      ? 'bg-purple-100 dark:bg-purple-950/60 text-brand-purple'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                  }`}
                  title="Insert Link"
                >
                  <Link2 className="w-3.5 h-3.5" />
                </button>

                {/* Attach Image */}
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                  title="Insert Image"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileUpload(e, 'image')}
                />

                {/* Attach File */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                  title="Attach Files"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileUpload(e, 'file')}
                />
              </div>

              {/* Right: Write vs Preview Switcher + Word Count */}
              <div className="flex items-center gap-2">
                {body && (
                  <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                    {body.trim().split(/\s+/).length} words
                  </span>
                )}
                <div className="flex items-center bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setEditorMode('write')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                      editorMode === 'write'
                        ? 'bg-white dark:bg-[#1E1F2E] text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                    }`}
                  >
                    <PenTool className="w-3 h-3" />
                    <span>Write</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode('preview')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                      editorMode === 'preview'
                        ? 'bg-white dark:bg-[#1E1F2E] text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                    }`}
                  >
                    <Eye className="w-3 h-3" />
                    <span>Preview</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Link Input Popover */}
            {showLinkDialog && (
              <div className="p-3 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 animate-fade-in">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Link text (optional)"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs outline-none"
                  />
                  <input
                    type="url"
                    placeholder="https://example.com"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleInsertLink}
                    className="btn-charcoal px-3 py-1 rounded-lg text-xs"
                  >
                    Insert
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLinkDialog(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-1 text-xs"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* Attached Files & Images Chips */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {attachments.map((file) => (
                  <div
                    key={file.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#1E1F2E] border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 text-xs font-medium"
                  >
                    {file.type === 'image' ? (
                      <ImageIcon className="w-3.5 h-3.5 text-brand-purple" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-blue-500" />
                    )}
                    <span className="max-w-[120px] truncate">{file.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">({file.size})</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(file.id)}
                      className="ml-1 text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Email Body: Write Mode vs Preview Mode */}
            <div className="flex-1 flex flex-col min-h-[16rem]">
              {editorMode === 'write' ? (
                <textarea
                  ref={bodyTextareaRef}
                  required
                  rows={12}
                  placeholder="Write your email here, or use the Copilot on the right to draft and iteratively refine it..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full flex-1 bg-slate-50 dark:bg-[#1C1D2A] border border-slate-200/80 dark:border-slate-700/70 text-slate-900 dark:text-white rounded-xl p-4 text-xs font-sans leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple transition-all resize-none"
                />
              ) : (
                <div className="w-full flex-1 bg-slate-50/50 dark:bg-[#1C1D2A]/60 border border-slate-200/80 dark:border-slate-700/70 rounded-xl p-4 overflow-y-auto">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Rendered Preview
                  </div>
                  <FormattedEmailBody body={body} />
                </div>
              )}
            </div>

            {/* Footer Action Bar: Save Draft + Discard + Send email */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={isSavingDraft || (!body.trim() && !subject.trim() && !to.trim())}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-40"
                  title="Save draft"
                >
                  {isSavingDraft ? (
                    <div className="w-3.5 h-3.5 border-2 border-brand-purple border-t-transparent rounded-full animate-spin" />
                  ) : draftSavedMsg ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <BookmarkCheck className="w-3.5 h-3.5" />
                  )}
                  <span>{draftSavedMsg ? 'Draft saved' : 'Save draft'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl transition-colors"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  disabled={!to.trim() || isSending}
                  className="btn-charcoal px-5 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
                  title={!to.trim() ? 'Please provide a recipient email' : 'Send message'}
                >
                  {isSending ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <span>Send email</span>
                      <Send className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Right: Permanent AI Chat & Iterative Draft Writer */}
          <div className="w-full md:w-[420px] lg:w-[460px] flex-shrink-0 flex flex-col bg-slate-50/70 dark:bg-[#11121C] border-t md:border-t-0 md:border-l border-slate-200/80 dark:border-slate-800/80 overflow-hidden">
            {/* AI Panel Header: Controls & Model Selector with fixed dark background */}
            <div className="p-3.5 border-b border-slate-200/80 dark:border-slate-800/80 space-y-2.5 bg-white dark:bg-surface-darkCard flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-brand-purple flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Draft Copilot
                    </h4>
                    <span className="text-[10px] text-slate-400 block -mt-0.5">
                      Context-aware email chat
                    </span>
                  </div>
                </div>

                {/* Tone selector */}
                <select
                  value={aiTone}
                  onChange={(e) => setAiTone(e.target.value)}
                  className="bg-white dark:bg-[#1E1F2E] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-medium outline-none cursor-pointer"
                >
                  {availableTones.map((tone) => {
                    const isDefault = tone.toLowerCase() === defaultToneName.toLowerCase();
                    return (
                      <option
                        key={tone}
                        value={tone}
                        className="bg-white dark:bg-[#1E1F2E] text-slate-900 dark:text-slate-100"
                      >
                        {tone.charAt(0).toUpperCase() + tone.slice(1)} {isDefault ? '★ (Default)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Sleek Model Switcher Dropdown (matching EmailView style) */}
              <div className="relative" ref={modelDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                  className="w-full px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-[#161724] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-between transition-colors border border-slate-200/70 dark:border-slate-700/60"
                  title="Switch AI model"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Cpu className="w-3.5 h-3.5 text-brand-purple flex-shrink-0" />
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        (models.find((m) => `${m.provider}::${m.name}` === selectedModelKey) || models[0])?.provider === 'gemini'
                          ? 'bg-sky-500'
                          : 'bg-emerald-500'
                      }`}
                    />
                    <span className="truncate">
                      {(models.find((m) => `${m.provider}::${m.name}` === selectedModelKey) || models[0])?.label || 'Select Model'}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 ml-2" />
                </button>

                {isModelDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#1E1F2E] rounded-xl shadow-xl border border-slate-200/90 dark:border-slate-700/80 py-1.5 z-50 text-xs">
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Select AI Model
                    </div>
                    {models.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-400 italic">No models found</div>
                    ) : (
                      models.map((opt) => (
                        <button
                          key={`${opt.provider}::${opt.name}`}
                          type="button"
                          onClick={() => {
                            setSelectedModelKey(`${opt.provider}::${opt.name}`);
                            setIsModelDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                            selectedModelKey === `${opt.provider}::${opt.name}`
                              ? 'text-brand-purple font-semibold bg-purple-50/50 dark:bg-purple-950/30'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                opt.provider === 'gemini' ? 'bg-sky-500' : 'bg-emerald-500'
                              }`}
                            />
                            <span className="truncate">{opt.label}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 uppercase font-mono ml-2 flex-shrink-0">
                            {opt.provider === 'gemini' ? 'Cloud' : 'Local'}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Chat conversation area */}
            <div ref={chatScrollRef} className="flex-1 p-4 overflow-y-auto space-y-3.5">
              {chatMessages.map((msg) => {
                const isAssistant = msg.role === 'assistant';
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2.5 ${isAssistant ? '' : 'flex-row-reverse'}`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                        isAssistant
                          ? 'bg-purple-100 dark:bg-purple-950/80 text-brand-purple'
                          : 'bg-slate-900 dark:bg-slate-700 text-white'
                      }`}
                    >
                      {isAssistant ? <Bot className="w-3.5 h-3.5" /> : <UserIcon className="w-3.5 h-3.5" />}
                    </div>

                    <div className={`max-w-[85%] space-y-1 ${isAssistant ? '' : 'text-right'}`}>
                      <div
                        className={`p-3 rounded-2xl text-xs leading-relaxed text-left shadow-xs ${
                          isAssistant
                            ? 'bg-white dark:bg-surface-darkCard text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-800'
                            : 'bg-charcoal text-white rounded-br-none'
                        }`}
                      >
                        {msg.text}
                      </div>
                      <span className="text-[10px] text-slate-400 px-1">{msg.time}</span>
                    </div>
                  </div>
                );
              })}

              {isGenerating && (
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-950/80 text-brand-purple flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                  <div className="p-3 rounded-2xl bg-white dark:bg-surface-darkCard border border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-brand-purple animate-ping" />
                    <span>Thinking and drafting email...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input form with general placeholder */}
            <form
              onSubmit={handleSendAiPrompt}
              className="p-3 border-t border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface-darkCard flex-shrink-0"
            >
              <div className="relative flex items-center">
                <textarea
                  rows={2}
                  placeholder="Ask AI to write or modify this email (e.g. adjust tone, draft follow-up, shorten subject)..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendAiPrompt();
                    }
                  }}
                  className="w-full bg-slate-50 dark:bg-[#1C1D2A] border border-slate-200/80 dark:border-slate-700/70 text-slate-900 dark:text-white rounded-xl pl-3.5 pr-10 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple resize-none transition-all"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isGenerating}
                  className="absolute right-2.5 p-1.5 rounded-lg bg-charcoal hover:bg-[#3B3F4E] text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 shadow-xs"
                  title="Send Prompt"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 px-1">
                Press Enter to send. Prompts will update Subject and Body simultaneously.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
