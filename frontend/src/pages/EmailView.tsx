import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { emailService, type ThreadResponse } from '../services/email';
import { aiService } from '../services/ai';
import { responseService } from '../services/responses';
import { settingsService } from '../services/settings';
import { ChatPanel } from '../components/ChatPanel';
import { ShortcutsModal } from '../components/ShortcutsModal';
import { useTheme } from '../context/ThemeContext';

// Thread skeleton loader
const ThreadSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-0 divide-y divide-gray-100 dark:divide-gray-800">
    {[1, 2].map(i => (
      <div key={i} className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
          </div>
          <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-20" />
        </div>
        <div className="space-y-2 pl-13">
          <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-full" />
          <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-5/6" />
          <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-3/4" />
        </div>
      </div>
    ))}
  </div>
);

const TONES = [
  { id: 'professional', label: 'Professional' },
  { id: 'friendly', label: 'Friendly' },
  { id: 'concise', label: 'Concise' },
  { id: 'formal', label: 'Formal' },
  { id: 'custom', label: 'Custom...' },
];

const EmailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const threadId = location.state?.threadId;
  const { theme, toggleTheme } = useTheme();

  const [thread, setThread] = useState<ThreadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Quick replies
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [loadingQuickReplies, setLoadingQuickReplies] = useState(false);

  // Tone state
  const [selectedTone, setSelectedTone] = useState('professional');
  const [customToneText, setCustomToneText] = useState('');
  const [showCustomToneInput, setShowCustomToneInput] = useState(false);

  // AI Reply & Streaming state
  const [isGenerating, setIsGenerating] = useState(false);
  const [responseId, setResponseId] = useState<number | null>(null);
  const [generatedText, setGeneratedText] = useState('');
  const [customInstruction, setCustomInstruction] = useState('');
  const streamAbortRef = useRef<AbortController | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-save state
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | null>(null);
  const autoSaveTimerRef = useRef<any>(null);

  // Chat & Shortcuts modal state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Sending state
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  // Load preferences default tone
  useEffect(() => {
    settingsService.getPreferences()
      .then(res => {
        if (res?.preferences?.default_tone) {
          setSelectedTone(res.preferences.default_tone);
        }
        if (res?.preferences?.custom_tone_prompt) {
          setCustomToneText(res.preferences.custom_tone_prompt);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch thread & quick replies
  useEffect(() => {
    if (!id || !threadId) { navigate('/dashboard'); return; }
    
    setLoading(true);
    emailService.getThread(id, threadId)
      .then(t => {
        setThread(t);
        setLoadingQuickReplies(true);
        aiService.getQuickReplies(id, threadId)
          .then(setQuickReplies)
          .catch(() => {})
          .finally(() => setLoadingQuickReplies(false));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id, threadId, navigate]);

  // Streaming reply generation
  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!id || !threadId || isGenerating) return;

    setIsGenerating(true);
    setGeneratedText('');
    setSaveStatus(null);

    const controller = new AbortController();
    streamAbortRef.current = controller;

    const toneToUse = selectedTone === 'custom' ? (customToneText || 'custom') : selectedTone;

    try {
      let accumulated = '';
      await aiService.streamReply(
        id,
        {
          thread_id: threadId,
          custom_instruction: customInstruction || undefined,
          tone: toneToUse,
        },
        (token) => {
          accumulated += token;
          setGeneratedText(accumulated);
        },
        (respId) => {
          setResponseId(respId);
        },
        (fullText, respId) => {
          setGeneratedText(fullText);
          setResponseId(respId);
          setIsGenerating(false);
        },
        controller.signal
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        alert('Failed to stream reply. Is Ollama running?');
      }
    } finally {
      setIsGenerating(false);
      streamAbortRef.current = null;
    }
  };

  const handleStopStream = () => {
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      setIsGenerating(false);
      streamAbortRef.current = null;
    }
  };

  // Draft Auto-Save Debounce
  const handleTextChange = (newVal: string) => {
    setGeneratedText(newVal);
    if (!responseId) return;

    setSaveStatus('saving');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        await responseService.autoSaveDraft(responseId, newVal);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(null), 3000);
      } catch {
        setSaveStatus(null);
      }
    }, 2000);
  };

  const handleSend = async () => {
    if (!id || !responseId) return;
    if (!window.confirm('Send this reply?')) return;
    setIsSending(true);
    try {
      await aiService.sendReply(id, { response_id: responseId, edited_text: generatedText });
      setIsSent(true);
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch {
      alert('Failed to send reply.');
    } finally {
      setIsSending(false);
    }
  };

  const handleApplyQuickReply = (text: string) => {
    setGeneratedText(prev => (prev ? `${prev}\n\n${text}` : text));
    if (editorRef.current) {
      editorRef.current.focus();
    }
  };

  // Keyboard Shortcuts Handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isEditing = ['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName || '');

    if (e.key === '?' && !isEditing) {
      e.preventDefault();
      setIsShortcutsOpen(prev => !prev);
    } else if (e.key === 'Escape') {
      if (isShortcutsOpen) setIsShortcutsOpen(false);
      else if (isChatOpen) setIsChatOpen(false);
    } else if (e.key.toLowerCase() === 'r' && !isEditing && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      handleGenerate();
    } else if (e.key.toLowerCase() === 'e' && !isEditing && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      editorRef.current?.focus();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      if (generatedText && responseId && !isSending) {
        e.preventDefault();
        handleSend();
      }
    }
  }, [isShortcutsOpen, isChatOpen, generatedText, responseId, isSending]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const subject = thread?.messages[0]?.subject || '(No Subject)';
  const firstMsg = thread?.messages[0];
  const participants = thread
    ? [...new Set(thread.messages.map(m => m.from.split('<')[0].replace(/"/g, '').trim()))]
    : [];

  return (
    <div className="h-screen flex overflow-hidden bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* ── Left metadata panel ── */}
      <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col flex-shrink-0 sticky top-0 h-screen">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Inbox
          </button>
          <button
            onClick={toggleTheme}
            title="Toggle theme"
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>

        {loading ? (
          <div className="p-4 animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
            <div className="h-3 bg-gray-100 dark:bg-gray-700/60 rounded w-1/2" />
            <div className="h-3 bg-gray-100 dark:bg-gray-700/60 rounded w-2/3" />
          </div>
        ) : thread ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Subject */}
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Subject</p>
              <p className="text-sm text-gray-900 dark:text-gray-100 font-medium leading-snug">{subject}</p>
            </div>

            {/* From */}
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">From</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{firstMsg?.from}</p>
            </div>

            {/* Date */}
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Date</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {firstMsg?.date ? new Date(firstMsg.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
              </p>
            </div>

            {/* Participants */}
            {participants.length > 1 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Participants</p>
                <div className="space-y-1">
                  {participants.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-100 to-indigo-200 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {p.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Thread size */}
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Messages</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{thread.messages.length} message{thread.messages.length !== 1 ? 's' : ''}</p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => setIsChatOpen(prev => !prev)}
                className="w-full bg-indigo-50 hover:bg-indigo-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-indigo-700 dark:text-indigo-300 text-sm font-medium py-2.5 px-3 rounded-lg border border-indigo-200 dark:border-gray-600 transition-all flex items-center justify-center gap-2"
              >
                <span>💬</span>
                {isChatOpen ? 'Close Chat' : 'Ask AI About Thread'}
              </button>

              <button
                onClick={() => setIsShortcutsOpen(true)}
                className="w-full text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 py-1.5 flex items-center justify-center gap-1.5"
              >
                <span>⌨️</span> Shortcuts (<kbd className="font-mono">?</kbd>)
              </button>
            </div>
          </div>
        ) : null}
      </aside>

      {/* ── Thread + AI panel ── */}
      <div className="flex-1 flex gap-0 min-w-0 overflow-hidden relative">
        {/* Thread column */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto py-6 px-6">
            {loading ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                  <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-2/3 animate-pulse" />
                </div>
                <ThreadSkeleton />
              </div>
            ) : error ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-red-100 dark:border-red-900 p-12 text-center">
                <p className="text-red-500 font-medium mb-3">Failed to load conversation</p>
                <button onClick={() => navigate('/dashboard')} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">← Back to Inbox</button>
              </div>
            ) : thread ? (
              <div className="space-y-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {/* Sticky subject bar */}
                  <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80 sticky top-0 z-10 backdrop-blur-sm flex items-center justify-between">
                    <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">{subject}</h1>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setIsChatOpen(true)}
                        className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium py-2 px-3 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <span>💬</span> Chat
                      </button>
                      {!generatedText && !isGenerating && (
                        <button
                          onClick={() => handleGenerate()}
                          className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white text-sm font-medium py-2 px-4 rounded-lg shadow-sm transition-all flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          AI Reply (<kbd className="text-[10px] opacity-80">R</kbd>)
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Messages list */}
                  <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
                    {thread.messages.map((msg, idx) => (
                      <div key={msg.id} className={`p-6 ${idx === thread.messages.length - 1 ? 'bg-blue-50/20 dark:bg-blue-900/10' : ''}`}>
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center font-bold text-gray-600 dark:text-gray-200 shadow-inner text-sm">
                              {msg.from.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900 dark:text-white text-sm">{msg.from.split('<')[0].replace(/"/g, '').trim()}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">To: {msg.to}</div>
                            </div>
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/60 px-2.5 py-1 rounded-full flex-shrink-0">
                            {new Date(msg.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                          </div>
                        </div>
                        <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed pl-12">
                          {msg.body || '(No content)'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Smart Quick Reply Suggestions */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-sm">⚡</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Smart Quick Replies
                    </span>
                    {loadingQuickReplies && (
                      <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin ml-2" />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {quickReplies.map((qr, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleApplyQuickReply(qr)}
                        className="text-xs bg-gray-50 dark:bg-gray-700/80 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 hover:text-indigo-600 dark:hover:text-indigo-300 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-full px-3.5 py-1.5 transition-all font-medium flex items-center gap-1.5 shadow-sm"
                      >
                        <span>+</span> {qr}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* ── AI Reply Workspace Sidebar ── */}
        {(isGenerating || generatedText) && (
          <div className="w-96 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col overflow-hidden shadow-lg">
            {/* Header */}
            <div className="p-4 border-b border-indigo-100 dark:border-gray-700 bg-indigo-50/50 dark:bg-gray-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">✨</span>
                <h3 className="font-semibold text-indigo-900 dark:text-indigo-200 text-sm">AI Response Generator</h3>
              </div>
              {saveStatus === 'saving' && (
                <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" /> Saving...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                  Draft saved ✓
                </span>
              )}
            </div>

            <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4">
              {/* Tone Selector Pills */}
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
                  Response Tone
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {TONES.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      disabled={isGenerating}
                      onClick={() => {
                        setSelectedTone(t.id);
                        if (t.id === 'custom') setShowCustomToneInput(true);
                        else setShowCustomToneInput(false);
                      }}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        selectedTone === t.id
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {showCustomToneInput && (
                  <div className="mt-2">
                    <input
                      type="text"
                      placeholder="E.g., Enthusiastic and empathetic..."
                      value={customToneText}
                      onChange={e => setCustomToneText(e.target.value)}
                      disabled={isGenerating}
                      className="w-full text-xs border border-indigo-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                )}
              </div>

              {/* Streaming / Response Textarea */}
              <div className="flex flex-col flex-1 min-h-[220px]">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {isGenerating ? 'Generating Reply...' : 'Reply Draft'}
                  </label>
                  {isGenerating && (
                    <button
                      onClick={handleStopStream}
                      className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 font-semibold flex items-center gap-1"
                    >
                      ■ Stop
                    </button>
                  )}
                </div>

                <textarea
                  ref={editorRef}
                  disabled={isGenerating}
                  className={`flex-1 w-full p-3.5 border rounded-lg text-sm font-sans outline-none resize-none transition-all leading-relaxed ${
                    isGenerating
                      ? 'bg-gray-100 dark:bg-gray-900 border-indigo-300 dark:border-indigo-800 text-gray-700 dark:text-gray-300 cursor-not-allowed opacity-90'
                      : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-gray-700'
                  }`}
                  value={generatedText}
                  onChange={e => handleTextChange(e.target.value)}
                  placeholder="Generated response will appear here..."
                />
              </div>

              {/* Refinement input */}
              <form onSubmit={handleGenerate} className="pt-3 border-t border-gray-100 dark:border-gray-700">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
                  Refine Instructions
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="E.g., Make it shorter, add a question..."
                    disabled={isGenerating}
                    className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={customInstruction}
                    onChange={e => setCustomInstruction(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={isGenerating}
                    className="bg-indigo-50 dark:bg-gray-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-gray-600 border border-indigo-200 dark:border-gray-600 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    Regenerate
                  </button>
                </div>
              </form>
            </div>

            {/* Bottom Actions */}
            {generatedText && !isGenerating && (
              <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
                {isSent ? (
                  <div className="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 p-3 rounded-lg flex items-center justify-center font-medium text-sm">
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Reply sent successfully!
                  </div>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={isSending}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-lg shadow-sm transition-colors flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed text-sm gap-2"
                  >
                    {isSending ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Sending...</>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        Send Reply (<kbd className="text-[10px] opacity-80">Ctrl+Enter</kbd>)
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Slide-over Chat Panel ── */}
        {id && threadId && (
          <ChatPanel
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            emailId={id}
            threadId={threadId}
            onInsertToReply={(text) => handleApplyQuickReply(text)}
          />
        )}
      </div>

      {/* Shortcuts Modal */}
      <ShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
    </div>
  );
};

export default EmailView;
