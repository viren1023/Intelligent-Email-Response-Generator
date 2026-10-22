import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { responseService, type ResponseHistoryItem, type ResponseHistoryDetail } from '../services/responses';
import { authService, type User } from '../services/auth';
import { emailService } from '../services/email';
import { getCachedUser, getCachedUnreadCount, setCachedUnreadCount } from '../utils/cache';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { ComposeModal } from '../components/ComposeModal';

const HistorySkeleton: React.FC = () => (
  <div className="space-y-4 animate-pulse">
    {[1, 2, 3, 4].map(i => (
      <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 space-y-3">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800" />
            <div className="space-y-1.5">
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-32" />
              <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-48" />
            </div>
          </div>
          <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-20" />
        </div>
        <div className="h-3.5 bg-slate-100 dark:bg-slate-800/60 rounded w-3/4" />
      </div>
    ))}
  </div>
);

const History: React.FC = () => {
  const [history, setHistory] = useState<ResponseHistoryItem[]>([]);
  const [user, setUser] = useState<User | null>(getCachedUser);
  const [unreadCount, setUnreadCount] = useState<number>(getCachedUnreadCount);
  const [loading, setLoading] = useState(true);
  const [selectedDetail, setSelectedDetail] = useState<ResponseHistoryDetail | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    authService.getMe()
      .then(userData => {
        setUser(userData);
        return responseService.getHistory();
      })
      .then(historyData => {
        if (historyData) setHistory(historyData);
        emailService.getUnreadCount()
          .then(c => {
            setUnreadCount(c || 0);
            setCachedUnreadCount(c || 0);
          })
          .catch(() => {});
      })
      .catch((err) => {
        if (err?.response?.status === 401) {
          navigate('/login');
        }
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleOpenDetail = async (id: number) => {
    try {
      const detail = await responseService.getDetail(id);
      setSelectedDetail(detail);
    } catch {
      alert('Failed to load response detail');
    }
  };

  const handleLogout = () => authService.logout().then(() => navigate('/login'));

  const statusBadge = (status: string) => {
    if (status === 'SENT') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          Sent
        </span>
      );
    }
    if (status === 'EDITED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
          Edited Draft
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Generated
      </span>
    );
  };

  return (
    <div className="w-full h-screen flex flex-col bg-white dark:bg-surface-darkCard overflow-hidden">
      <Header
        user={user}
        onLogout={handleLogout}
        title="Email.ai"
      />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar
          user={user}
          activePage="history"
          unreadCount={unreadCount}
          onOpenCompose={() => setIsComposeOpen(true)}
          onLogout={handleLogout}
        />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-white dark:bg-surface-darkCard">
          <div className="max-w-4xl mx-auto px-8 py-8 animate-fade-in">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Response History</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Audit log of all AI generated email drafts and sent responses.
              </p>
            </div>
            <div className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60 rounded-full text-xs font-bold">
              {history.length} Saved {history.length === 1 ? 'Record' : 'Records'}
            </div>
          </div>

          {loading ? (
            <HistorySkeleton />
          ) : history.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-8">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-3 text-slate-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">No Response History</h3>
              <p className="text-xs text-slate-400">Drafts generated via the AI Response Generator will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map(item => {
                const senderText = item.sender || 'AI Response';
                const avatarChar = (senderText.charAt(0) || 'A').toUpperCase();
                return (
                  <div
                    key={item.id}
                    onClick={() => handleOpenDetail(item.id)}
                    className="group bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700/60 shadow-xs hover:shadow-md transition-all duration-200 ease-out cursor-pointer active:scale-[0.99]"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center justify-center border border-indigo-200/50 dark:border-indigo-800/50">
                          {avatarChar}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm block group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {senderText}
                          </span>
                          <h4 className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-lg">
                            {item.subject || '(No Subject)'}
                          </h4>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                        {item.generated_at ? new Date(item.generated_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                      </span>
                    </div>

                  {/* Text snippet preview */}
                  {item.snippet && (
                    <div className="my-2.5 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-800/60 text-xs font-mono text-slate-600 dark:text-slate-300 leading-relaxed truncate">
                      "{item.snippet}..."
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-200 dark:border-slate-800/80">
                    <div className="flex items-center gap-2">
                      {statusBadge(item.status)}
                      {item.sent_at && (
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          Sent: {new Date(item.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      Inspect Draft →
                    </span>
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>
      </main>

      {/* Response Detail Modal */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-lg">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">Generated AI Response</h3>
                  <p className="text-xs text-slate-400">Model: {selectedDetail.model_name || 'LLM'} · {selectedDetail.generation_time || 0}ms</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDetail(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-5">
              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Target Subject</div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{selectedDetail.subject}</div>
                <div className="text-xs text-slate-500 mt-1">From: {selectedDetail.sender}</div>
              </div>

              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Original AI Draft</div>
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 text-xs font-mono text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap border border-slate-200/60 dark:border-slate-700/60">
                  {selectedDetail.generated_text}
                </div>
              </div>

              {selectedDetail.edited_text && (
                <div>
                  <div className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-2">Edited / Final Response</div>
                  <div className="bg-indigo-50/40 dark:bg-indigo-950/30 rounded-2xl p-4 text-xs font-mono text-indigo-900 dark:text-indigo-200 leading-relaxed whitespace-pre-wrap border border-indigo-200/50 dark:border-indigo-800/50">
                    {selectedDetail.edited_text}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedDetail(null)}
                className="px-5 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl text-xs font-bold active:scale-95 transition-all shadow-xs"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      </div>

      <ComposeModal isOpen={isComposeOpen} onClose={() => setIsComposeOpen(false)} />
    </div>
  );
};

export default History;
