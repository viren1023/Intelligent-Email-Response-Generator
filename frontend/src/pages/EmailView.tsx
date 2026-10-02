import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { emailService, type ThreadResponse } from '../services/email';
import { aiService } from '../services/ai';

// Thread skeleton
const ThreadSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-0 divide-y divide-gray-100">
    {[1, 2].map(i => (
      <div key={i} className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3.5 bg-gray-200 rounded w-1/4" />
            <div className="h-3 bg-gray-100 rounded w-1/3" />
          </div>
          <div className="h-3 bg-gray-100 rounded w-20" />
        </div>
        <div className="space-y-2 pl-13">
          <div className="h-3 bg-gray-100 rounded w-full" />
          <div className="h-3 bg-gray-100 rounded w-5/6" />
          <div className="h-3 bg-gray-100 rounded w-3/4" />
        </div>
      </div>
    ))}
  </div>
);

const EmailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const threadId = location.state?.threadId;

  const [thread, setThread] = useState<ThreadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [responseId, setResponseId] = useState<number | null>(null);
  const [generatedText, setGeneratedText] = useState('');
  const [customInstruction, setCustomInstruction] = useState('');

  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  useEffect(() => {
    if (!id || !threadId) { navigate('/dashboard'); return; }
    emailService.getThread(id, threadId)
      .then(setThread)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id, threadId, navigate]);

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!id || !threadId) return;
    setIsGenerating(true);
    try {
      const data = await aiService.generateReply(id, { thread_id: threadId, custom_instruction: customInstruction || undefined });
      setResponseId(data.response_id);
      setGeneratedText(data.generated_text);
    } catch {
      alert('Failed to generate reply. Is Ollama running?');
    } finally {
      setIsGenerating(false);
    }
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

  const subject = thread?.messages[0]?.subject || '(No Subject)';
  const firstMsg = thread?.messages[0];
  const participants = thread
    ? [...new Set(thread.messages.map(m => m.from.split('<')[0].replace(/"/g, '').trim()))]
    : [];

  return (
    <div className="h-screen flex overflow-hidden bg-gray-50">
      {/* ── Left metadata panel (FIX #5: was empty) ── */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 sticky top-0 h-screen">
        <div className="p-4 border-b border-gray-200 flex items-center gap-2">
          <button onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Inbox
          </button>
        </div>

        {loading ? (
          <div className="p-4 animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
            <div className="h-3 bg-gray-100 rounded w-2/3" />
          </div>
        ) : thread ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Subject */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Subject</p>
              <p className="text-sm text-gray-900 font-medium leading-snug">{subject}</p>
            </div>

            {/* From */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">From</p>
              <p className="text-sm text-gray-700">{firstMsg?.from}</p>
            </div>

            {/* Date */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Date</p>
              <p className="text-sm text-gray-700">
                {firstMsg?.date ? new Date(firstMsg.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
              </p>
            </div>

            {/* Participants */}
            {participants.length > 1 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Participants</p>
                <div className="space-y-1">
                  {participants.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-100 to-indigo-200 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                        {p.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm text-gray-700 truncate">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Thread size */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Messages</p>
              <p className="text-sm text-gray-700">{thread.messages.length} message{thread.messages.length !== 1 ? 's' : ''}</p>
            </div>

            {/* Generate button — also here for quick access */}
            {!generatedText && !isGenerating && (
              <button onClick={() => handleGenerate()}
                className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white text-sm font-medium py-2.5 px-4 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Generate AI Reply
              </button>
            )}
          </div>
        ) : null}
      </aside>

      {/* ── Thread + AI panel ── */}
      <div className="flex-1 flex gap-0 min-w-0 overflow-hidden">
        {/* Thread column */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto py-6 px-6">
            {loading ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-200 bg-gray-50/50">
                  <div className="h-5 bg-gray-200 rounded w-2/3 animate-pulse" />
                </div>
                <ThreadSkeleton />
              </div>
            ) : error ? (
              <div className="bg-white rounded-xl shadow-sm border border-red-100 p-12 text-center">
                <p className="text-red-500 font-medium mb-3">Failed to load conversation</p>
                <button onClick={() => navigate('/dashboard')} className="text-sm text-blue-600 hover:underline">← Back to Inbox</button>
              </div>
            ) : thread ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Sticky subject bar */}
                <div className="p-5 border-b border-gray-200 bg-gray-50/80 sticky top-0 z-10 backdrop-blur-sm flex items-center justify-between">
                  <h1 className="text-lg font-bold text-gray-900 truncate">{subject}</h1>
                  {!generatedText && !isGenerating && (
                    <button onClick={() => handleGenerate()}
                      className="flex-shrink-0 ml-4 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white text-sm font-medium py-2 px-4 rounded-lg shadow-sm transition-all flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      AI Reply
                    </button>
                  )}
                </div>

                <div className="divide-y divide-gray-100">
                  {thread.messages.map((msg, idx) => (
                    <div key={msg.id} className={`p-6 ${idx === thread.messages.length - 1 ? 'bg-blue-50/20' : ''}`}>
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center font-bold text-gray-600 shadow-inner text-sm">
                            {msg.from.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900 text-sm">{msg.from.split('<')[0].replace(/"/g, '').trim()}</div>
                            <div className="text-xs text-gray-500">To: {msg.to}</div>
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full flex-shrink-0">
                          {new Date(msg.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                      </div>
                      <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed pl-12">
                        {msg.body || '(No content)'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* AI sidebar */}
        {(isGenerating || generatedText) && (
          <div className="w-96 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
            <div className="p-4 border-b border-indigo-100 bg-indigo-50/50 flex items-center gap-2">
              <span className="text-lg">✨</span>
              <h3 className="font-semibold text-indigo-900">AI Assistant</h3>
            </div>

            <div className="p-5 flex-1 overflow-auto flex flex-col gap-4">
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4" />
                  <p className="text-indigo-700 font-medium">Generating reply...</p>
                  <p className="text-gray-400 text-sm mt-1">Analyzing conversation</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col flex-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Generated Reply</label>
                    <textarea
                      className="flex-1 w-full p-4 border border-gray-200 rounded-lg text-sm font-sans focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none bg-gray-50 min-h-48"
                      value={generatedText}
                      onChange={e => setGeneratedText(e.target.value)}
                    />
                  </div>
                  <form onSubmit={handleGenerate} className="pt-3 border-t border-gray-100">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Refine</label>
                    <div className="flex gap-2">
                      <input type="text" placeholder="E.g., Make it shorter..."
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={customInstruction}
                        onChange={e => setCustomInstruction(e.target.value)} />
                      <button type="submit" className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                        Retry
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>

            {generatedText && !isGenerating && (
              <div className="p-4 border-t border-gray-100 bg-gray-50">
                {isSent ? (
                  <div className="bg-green-100 text-green-800 p-3 rounded-lg flex items-center justify-center font-medium text-sm">
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Reply sent successfully!
                  </div>
                ) : (
                  <button onClick={handleSend} disabled={isSending}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-lg shadow-sm transition-colors flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed text-sm">
                    {isSending ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />Sending...</>
                    ) : (
                      <><svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>Send Reply</>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailView;
