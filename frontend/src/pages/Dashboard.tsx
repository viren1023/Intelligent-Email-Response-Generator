import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService, type User } from '../services/auth';
import { emailService, type EmailMetadata, type InboxTab } from '../services/email';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { ComposeModal } from '../components/ComposeModal';
import { getInitials, getAvatarColorClass } from '../utils/avatar';
import {
  getCachedUser,
  setCachedUser,
  getCachedUnreadCount,
  setCachedUnreadCount,
  getCachedEmails,
  setCachedEmails,
} from '../utils/cache';
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  MailOpen,
  Trash2,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

function formatEmailDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (isToday) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return 'Yesterday';
  }

  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  return d.toLocaleDateString([], { year: '2-digit', month: 'short', day: 'numeric' });
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = (searchParams.get('tab') as InboxTab) || 'primary';
  const initialSearch = searchParams.get('search') || '';
  const [tab, setTab] = useState<InboxTab>(initialTab);

  // Instant hydration from cache
  const [user, setUser] = useState<User | null>(getCachedUser);
  const [unreadCount, setUnreadCount] = useState<number>(getCachedUnreadCount);
  const [emails, setEmails] = useState<EmailMetadata[]>(() => getCachedEmails(initialTab));
  const [filteredEmails, setFilteredEmails] = useState<EmailMetadata[]>(() => getCachedEmails(initialTab));
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageTokens, setPageTokens] = useState<(string | undefined)[]>([undefined]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);

  // Category & Search filters
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Important' | 'Urgent' | 'Other'>('All');
  const [searchQuery, setSearchQuery] = useState(initialSearch);

  // Modals
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const emailListRef = useRef<HTMLDivElement>(null);

  // Fetch data with cache persistence
  const loadEmails = useCallback(async (activeTab: InboxTab, page: number = 1, token?: string) => {
    // Show loader if navigating beyond page 1 or if no cached data
    if (page > 1 || !getCachedEmails(activeTab)?.length) {
      setLoading(true);
    }
    try {
      const data = await emailService.getAll(activeTab, token);
      if (data && Array.isArray(data.emails)) {
        setEmails(data.emails);
        if (page === 1) {
          setCachedEmails(activeTab, data.emails);
        }
        setNextPageToken(data.next_page_token || null);
        if (data.next_page_token) {
          setPageTokens((prev) => {
            const copy = [...prev];
            copy[page] = data.next_page_token || undefined;
            return copy;
          });
        }
      } else {
        setEmails([]);
        setNextPageToken(null);
      }
    } catch (err: any) {
      if (err?.response?.status === 401) {
        navigate('/login');
        return;
      }
      setEmails([]);
    } finally {
      setLoading(false);
      emailListRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [navigate]);

  const handleNextPage = () => {
    if (!nextPageToken || loading) return;
    const nextPage = currentPage + 1;
    const token = pageTokens[currentPage];
    setCurrentPage(nextPage);
    setLoading(true);
    loadEmails(tab, nextPage, token);
  };

  const handlePrevPage = () => {
    if (currentPage <= 1 || loading) return;
    const prevPage = currentPage - 1;
    const token = pageTokens[prevPage - 1];
    setCurrentPage(prevPage);
    setLoading(true);
    loadEmails(tab, prevPage, token);
  };

  useEffect(() => {
    authService.getMe()
      .then((u) => {
        setUser(u);
        setCachedUser(u);
        loadEmails(tab, 1, undefined);
        emailService.getUnreadCount()
          .then((c) => {
            const val = c || 0;
            setUnreadCount(val);
            setCachedUnreadCount(val);
          })
          .catch(() => setUnreadCount(0));
      })
      .catch(() => {
        navigate('/login');
      });
  }, [loadEmails, tab, navigate]);

  // Filter emails based on category tab and search query
  useEffect(() => {
    let list = [...emails];

    if (categoryFilter === 'Important') {
      list = list.filter(
        (e) =>
          !/\b(newsletter|announcement|digest|dark mode|release notes|weekly|monthly|update available)\b/i.test(e.subject + ' ' + e.snippet) &&
          /\b(important|action required|priority|invoice|payment|contract|billing|security alert|action needed)\b/i.test(e.subject + ' ' + e.snippet)
      );
    } else if (categoryFilter === 'Urgent') {
      list = list.filter(
        (e) =>
          /\b(urgent|immediate|asap|critical|expiring|deadline|emergency)\b/i.test(e.subject + ' ' + e.snippet)
      );
    } else if (categoryFilter === 'Other') {
      list = list.filter(
        (e) =>
          !/\b(urgent|immediate|asap|critical|expiring|deadline|emergency|important|action required|priority|invoice|payment|contract|billing|security alert|action needed)\b/i.test(e.subject + ' ' + e.snippet)
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      list = list.filter(
        (e) =>
          e.subject.toLowerCase().includes(query) ||
          e.from.toLowerCase().includes(query) ||
          e.snippet.toLowerCase().includes(query)
      );
    }

    setFilteredEmails(list);
  }, [emails, categoryFilter, searchQuery]);

  const handleTabChange = (t: InboxTab) => {
    setTab(t);
    setSearchParams({ tab: t });
    setCurrentPage(1);
    setPageTokens([undefined]);
    setNextPageToken(null);
    const cached = getCachedEmails(t);
    if (cached && cached.length > 0) {
      setEmails(cached);
    }
    loadEmails(t, 1, undefined);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        loadEmails(tab, currentPage, undefined),
        emailService.getUnreadCount().then((c) => {
          const val = c || 0;
          setUnreadCount(val);
          setCachedUnreadCount(val);
        }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleOpenEmail = (email: EmailMetadata) => {
    navigate(`/email/${email.id}?fromTab=${tab}`, { state: { threadId: email.threadId, fromTab: tab } });
  };

  const handleToggleRead = async (email: EmailMetadata, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = !email.is_unread;
    const updated = emails.map((item) =>
      item.id === email.id ? { ...item, is_unread: newStatus } : item
    );
    setEmails(updated);
    setCachedEmails(tab, updated);

    const delta = newStatus ? 1 : -1;
    const newCount = Math.max(0, unreadCount + delta);
    setUnreadCount(newCount);
    setCachedUnreadCount(newCount);

    try {
      if (newStatus) {
        await emailService.markUnread(email.id);
      } else {
        await emailService.markRead(email.id);
      }
    } catch {}
  };

  const handleDeleteEmail = async (email: EmailMetadata, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = emails.filter((item) => item.id !== email.id);
    setEmails(updated);
    setCachedEmails(tab, updated);

    if (email.is_unread) {
      const newCount = Math.max(0, unreadCount - 1);
      setUnreadCount(newCount);
      setCachedUnreadCount(newCount);
    }

    try {
      await emailService.deleteEmail(email.id);
    } catch {}
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {}
    navigate('/login');
  };

  return (
    <div className="w-full h-screen flex flex-col bg-white dark:bg-surface-darkCard overflow-hidden">
      {/* Universal Top Header */}
      <Header
        user={user}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showSearch={true}
        onLogout={handleLogout}
      />

      {/* Main Body Layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Auto-collapsible Sidebar */}
        <Sidebar
          user={user}
          activeTab={tab}
          activePage="dashboard"
          unreadCount={unreadCount}
          onTabChange={handleTabChange}
          onOpenCompose={() => setIsComposeOpen(true)}
          onLogout={handleLogout}
        />

        {/* Central Email Column */}
        <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-surface-darkCard overflow-hidden">
          {/* Filter Tabs Bar with Distinct Color Shade */}
          <div className="px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0 bg-slate-100/70 dark:bg-[#12131D]">
            <div className="flex items-center gap-1.5">
              {(['All', 'Important', 'Urgent', 'Other'] as const).map((cat) => {
                const isActive = categoryFilter === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-xs border border-slate-200/80 dark:border-slate-700/80'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing || loading}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-95 flex items-center gap-1.5 text-xs font-semibold"
                title="Refresh email list"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-brand-purple' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                {filteredEmails.length} {filteredEmails.length === 1 ? 'message' : 'messages'}
              </span>
            </div>
          </div>

          {/* Email List Rows */}
          <div ref={emailListRef} className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800/80">
            {loading ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="px-6 py-4 flex items-start gap-4 animate-pulse">
                    <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-800 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-32" />
                        <div className="h-3 bg-slate-100 dark:bg-slate-800/70 rounded w-14" />
                      </div>
                      <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
                      <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredEmails.length === 0 ? (
              <div className="p-16 text-center text-xs text-slate-400">
                {searchQuery.trim() ? 'No emails match your search.' : 'No emails found in this mailbox.'}
              </div>
            ) : (
              filteredEmails.map((email) => {
                const sender = email.from.split('<')[0].replace(/"/g, '').trim() || email.from;
                const initials = getInitials(sender);
                const avatarColor = getAvatarColorClass(sender);

                return (
                  <div
                    key={email.id}
                    onClick={() => handleOpenEmail(email)}
                    className={`px-6 py-3.5 cursor-pointer transition-colors flex items-start gap-3.5 group relative ${
                      email.is_unread
                        ? 'bg-white dark:bg-surface-darkCard border-l-[3.5px] border-l-brand-purple hover:bg-purple-50/30 dark:hover:bg-[#1E1F2E] shadow-[0_1px_2px_rgba(0,0,0,0.02)]'
                        : 'bg-slate-50/70 dark:bg-[#13141E] border-l-[3.5px] border-l-transparent hover:bg-slate-100 dark:hover:bg-[#1A1B28]'
                    }`}
                  >
                    {/* Monogram Avatar */}
                    <div className={`w-9 h-9 rounded-full border flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5 shadow-xs ${avatarColor}`}>
                      {initials}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Top Line: Sender, AI badge, Time, Actions */}
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`text-sm truncate ${
                              email.is_unread
                                ? 'font-bold text-slate-900 dark:text-white'
                                : 'font-semibold text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {sender}
                          </span>

                          {email.ai_replied && (
                            <span className="text-[10px] font-semibold text-brand-purple bg-purple-50 dark:bg-purple-950/60 border border-purple-200/60 dark:border-purple-800/60 px-2 py-0.5 rounded-md inline-flex items-center gap-1 flex-shrink-0">
                              <Sparkles className="w-2.5 h-2.5" />
                              <span>AI Replied</span>
                            </span>
                          )}
                        </div>

                        {/* Timestamp & Hover Action Buttons */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Hover action toolbar */}
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                            <button
                              onClick={(e) => handleToggleRead(email, e)}
                              title={email.is_unread ? 'Mark as read' : 'Mark as unread'}
                              className="p-1 rounded-lg text-slate-400 hover:text-brand-purple hover:bg-purple-50 dark:hover:bg-purple-950/50 transition-colors"
                            >
                              {email.is_unread ? <MailOpen className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={(e) => handleDeleteEmail(email, e)}
                              title="Delete email"
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Stylish Timestamp Badge */}
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-[#1E1F2E] text-slate-500 dark:text-slate-400 group-hover:bg-slate-200/60 dark:group-hover:bg-[#252636] transition-colors whitespace-nowrap">
                            {formatEmailDate(email.date)}
                          </span>
                        </div>
                      </div>

                      {/* Subject Line */}
                      <div
                        className={`text-xs sm:text-sm mb-0.5 leading-snug truncate ${
                          email.is_unread
                            ? 'font-semibold text-slate-900 dark:text-slate-100'
                            : 'font-medium text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {email.subject}
                      </div>

                      {/* Snippet Preview */}
                      <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 leading-relaxed">
                        {email.snippet}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Docked Pagination Bar */}
          <div className="h-12 px-6 border-t border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface-darkCard flex items-center justify-between flex-shrink-0">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Page <span className="font-semibold text-slate-900 dark:text-slate-100">{currentPage}</span>
              {filteredEmails.length > 0 && (
                <span className="ml-1 text-slate-400 dark:text-slate-500 hidden sm:inline">
                  • {filteredEmails.length} messages on page
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevPage}
                disabled={currentPage <= 1 || loading}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <div className="px-2.5 py-0.5 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 min-w-[28px] text-center border border-slate-200/50 dark:border-slate-700/50">
                {currentPage}
              </div>

              <button
                onClick={handleNextPage}
                disabled={!nextPageToken || loading}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* Compose Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        onSuccess={() => loadEmails(tab, 1, undefined)}
      />
    </div>
  );
};

export default Dashboard;
