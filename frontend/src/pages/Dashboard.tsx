import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService, type User } from '../services/auth';
import { emailService, type EmailMetadata, type InboxTab } from '../services/email';

// ─── helpers ────────────────────────────────────────────────────────────────
function senderName(from: string) {
  return from.split('<')[0].replace(/"/g, '').trim() || from;
}
function senderInitial(from: string) {
  return (senderName(from) || '?').charAt(0).toUpperCase();
}
function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isThisYear = d.getFullYear() === now.getFullYear();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isThisYear) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return d.toLocaleDateString([], { year: '2-digit', month: 'short', day: 'numeric' });
}

const TAB_LABELS: Record<InboxTab, string> = {
  primary: 'Primary',
  unread: 'Unread',
  sent: 'Sent',
  all: 'All Mail',
};

const TAB_EMPTY: Record<InboxTab, string> = {
  primary: 'Your primary inbox is empty.',
  unread: 'No unread emails — Inbox Zero! 🎉',
  sent: 'No sent emails yet.',
  all: 'No emails found.',
};

// ─── sub-components ──────────────────────────────────────────────────────────
interface EmailCardProps {
  email: EmailMetadata;
  onClick: () => void;
}
const EmailCard: React.FC<EmailCardProps> = ({ email, onClick }) => (
  <div
    onClick={onClick}
    className={`flex items-start gap-4 px-5 py-4 cursor-pointer transition-colors group hover:bg-blue-50/60
      ${email.is_unread ? 'bg-white' : 'bg-gray-50/40'}`}
  >
    {/* Avatar */}
    <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shadow-inner
      ${email.is_unread
        ? 'bg-gradient-to-br from-blue-100 to-indigo-200 text-indigo-700'
        : 'bg-gray-100 text-gray-500'}`}
    >
      {senderInitial(email.from)}
    </div>

    {/* Body */}
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-0.5">
        <span className={`truncate text-sm ${email.is_unread ? 'font-semibold text-gray-900' : 'font-normal text-gray-600'}`}>
          {senderName(email.from)}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {email.ai_replied && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">AI ✓</span>
          )}
          <span className={`text-xs ${email.is_unread ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
            {formatDate(email.date)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {email.is_unread && (
          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-0.5" />
        )}
        <span className={`text-sm truncate ${email.is_unread ? 'font-medium text-gray-800' : 'text-gray-500'}`}>
          {email.subject || '(No Subject)'}
        </span>
        <span className="text-sm text-gray-400 truncate hidden sm:block">
          — {email.snippet}
        </span>
      </div>
    </div>
  </div>
);

// ─── Sidebar nav ──────────────────────────────────────────────────────────────
interface SidebarProps {
  user: User;
  activeTab: InboxTab;
  unreadCount: number;
  onTabChange: (t: InboxTab) => void;
  onLogout: () => void;
}
const Sidebar: React.FC<SidebarProps> = ({ user, activeTab, unreadCount, onTabChange, onLogout }) => {
  const tabs: InboxTab[] = ['primary', 'unread', 'sent', 'all'];

  const tabIcon = (t: InboxTab) => {
    if (t === 'primary') return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />;
    if (t === 'unread') return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />;
    if (t === 'sent') return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />;
    return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />;
  };

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="p-4 border-b border-gray-200 flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-base font-bold text-gray-900 tracking-tight">Email AI</h2>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors
              ${activeTab === t ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
          >
            <span className="flex items-center gap-3">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">{tabIcon(t)}</svg>
              {TAB_LABELS[t]}
            </span>
            {t === 'unread' && unreadCount > 0 && (
              <span className="text-xs bg-blue-600 text-white rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center leading-4">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        ))}

        <div className="pt-2 border-t border-gray-100 mt-2 space-y-0.5">
          {[
            { label: 'History', href: '/history', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> },
            { label: 'Settings', href: '/settings', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /> },
          ].map(({ label, href, icon }) => (
            <a
              key={label}
              href={href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">{icon}</svg>
              {label}
            </a>
          ))}
        </div>
      </nav>

      {/* User */}
      <div className="p-3 border-t border-gray-200 flex items-center gap-2">
        {user.picture
          ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full ring-2 ring-gray-100 flex-shrink-0" />
          : <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">{user.name.charAt(0)}</div>
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{user.name}</p>
          <p className="text-xs text-gray-400 truncate">{user.email}</p>
        </div>
        <button
          onClick={onLogout}
          title="Logout"
          className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </aside>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────
const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [emails, setEmails] = useState<EmailMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<InboxTab>('primary');
  const [unreadCount, setUnreadCount] = useState(0);

  // Pagination — stack of tokens for prev
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [tokenStack, setTokenStack] = useState<string[]>([]); // stack of prev tokens
  const pageNum = tokenStack.length + 1;

  // Search
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const loadPage = useCallback(async (activeTab: InboxTab, pageToken?: string) => {
    setLoading(true);
    try {
      const data = await emailService.getAll(activeTab, pageToken);
      setEmails(data.emails);
      setNextToken(data.next_page_token);
    } catch (err: any) {
      if (err?.response?.status === 401) navigate('/login');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  // Boot: get user + initial unread count + first page
  useEffect(() => {
    authService.getMe()
      .then(u => {
        setUser(u);
        // side-load unread count for badge
        emailService.getAll('unread').then(d => setUnreadCount(d.emails.length)).catch(() => {});
        return loadPage('primary');
      })
      .catch(err => {
        if (err?.response?.status === 401) navigate('/login');
        setLoading(false);
      });
  }, [navigate, loadPage]);

  const handleTabChange = (t: InboxTab) => {
    setTab(t);
    setTokenStack([]);
    setNextToken(null);
    setSearch('');
    loadPage(t);
  };

  const handleNext = () => {
    if (!nextToken) return;
    setTokenStack(s => [...s, nextToken]);
    loadPage(tab, nextToken);
    setSearch('');
  };

  const handlePrev = () => {
    if (tokenStack.length === 0) return;
    const newStack = [...tokenStack];
    newStack.pop();
    const prevToken = newStack[newStack.length - 1]; // undefined = page 1
    setTokenStack(newStack);
    loadPage(tab, prevToken);
    setSearch('');
  };

  const handleRefresh = () => {
    setTokenStack([]);
    setSearch('');
    loadPage(tab);
    emailService.getAll('unread').then(d => setUnreadCount(d.emails.length)).catch(() => {});
  };

  const handleLogout = () => authService.logout().then(() => navigate('/login'));

  // Client-side search filter
  const filtered = search.trim()
    ? emails.filter(e => {
        const q = search.toLowerCase();
        return (
          senderName(e.from).toLowerCase().includes(q) ||
          e.subject.toLowerCase().includes(q) ||
          e.snippet.toLowerCase().includes(q)
        );
      })
    : emails;

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar
        user={user}
        activeTab={tab}
        unreadCount={unreadCount}
        onTabChange={handleTabChange}
        onLogout={handleLogout}
      />

      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 sticky top-0 z-10">
          {/* Search */}
          <div className="flex-1 max-w-xl relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search in current page..."
              className="w-full pl-9 pr-8 py-2 text-sm bg-gray-100 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          {/* Compose */}
          <button
            onClick={() => alert('Compose coming soon!')}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Compose
          </button>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            title="Refresh inbox"
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </header>

        {/* Email list area */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-5xl mx-auto py-4 px-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Pagination header */}
              <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-100 bg-gray-50/60">
                <p className="text-xs text-gray-500">
                  {search ? `${filtered.length} of ${emails.length} shown` : `Page ${pageNum}`}
                  {tab === 'unread' && ` · ${unreadCount} unread`}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handlePrev}
                    disabled={tokenStack.length === 0 || loading}
                    className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 transition-colors"
                    title="Previous page"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span className="text-xs text-gray-500 px-1">{pageNum}</span>
                  <button
                    onClick={handleNext}
                    disabled={!nextToken || loading}
                    className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 transition-colors"
                    title="Next page"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              </div>

              {/* List */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-3" />
                  <p className="text-sm">Loading emails...</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </div>
                  <p className="text-gray-500 font-medium">
                    {search ? `No results for "${search}"` : TAB_EMPTY[tab]}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filtered.map(email => (
                    <EmailCard
                      key={email.id}
                      email={email}
                      onClick={() => navigate(`/email/${email.id}`, { state: { threadId: email.threadId } })}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
