import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService, type User } from '../services/auth';
import { emailService, type EmailMetadata, type InboxTab } from '../services/email';
import { aiService } from '../services/ai';
import { ShortcutsModal } from '../components/ShortcutsModal';
import { useTheme } from '../context/ThemeContext';

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
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
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

// ─── Skeleton row ────────────────────────────────────────────────────────────
const SkeletonRow: React.FC = () => (
  <div className="flex items-start gap-4 px-5 py-4 animate-pulse dark:bg-gray-800">
    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700" />
    <div className="flex-1 min-w-0 space-y-2 pt-0.5">
      <div className="flex justify-between">
        <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
        <div className="h-3 bg-gray-100 dark:bg-gray-700/60 rounded w-14" />
      </div>
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/5" />
      <div className="h-3 bg-gray-100 dark:bg-gray-700/60 rounded w-3/4" />
    </div>
  </div>
);
const EmailSkeleton: React.FC = () => (
  <div className="divide-y divide-gray-100 dark:divide-gray-700">
    {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
  </div>
);

// ─── Email card ───────────────────────────────────────────────────────────────
interface EmailCardProps {
  email: EmailMetadata;
  urgency?: string;
  onClick: () => void;
}

const EmailCard: React.FC<EmailCardProps> = ({ email, urgency, onClick }) => {
  const urgencyBadge = () => {
    if (urgency === 'URGENT') {
      return <span className="text-[10px] bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-semibold px-2 py-0.5 rounded-full">🔴 Urgent</span>;
    }
    if (urgency === 'IMPORTANT') {
      return <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold px-2 py-0.5 rounded-full">🟡 Important</span>;
    }
    return null;
  };

  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-4 px-5 py-4 cursor-pointer transition-colors group hover:bg-blue-50/60 dark:hover:bg-gray-700/60
        ${email.is_unread ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/40 dark:bg-gray-800/40'}`}
    >
      <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shadow-inner
        ${email.is_unread ? 'bg-gradient-to-br from-blue-100 to-indigo-200 dark:from-indigo-900 dark:to-indigo-700 text-indigo-700 dark:text-indigo-200' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
        {senderInitial(email.from)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3 mb-0.5">
          <div className="flex items-center gap-2 truncate">
            <span className={`truncate text-sm ${email.is_unread ? 'font-semibold text-gray-900 dark:text-white' : 'font-normal text-gray-600 dark:text-gray-300'}`}>
              {senderName(email.from)}
            </span>
            {urgencyBadge()}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {email.ai_replied && (
              <span className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full font-medium">AI ✓</span>
            )}
            <span className={`text-xs ${email.is_unread ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
              {formatDate(email.date)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {email.is_unread && <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-0.5" />}
          <span className={`text-sm truncate ${email.is_unread ? 'font-medium text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}`}>
            {email.subject || '(No Subject)'}
          </span>
          <span className="text-sm text-gray-400 dark:text-gray-500 truncate hidden sm:block">— {email.snippet}</span>
        </div>
      </div>
    </div>
  );
};

// ─── Sidebar ─────────────────────────────────────────────────────────────────
interface SidebarProps {
  user: User;
  activeTab: InboxTab;
  unreadCount: number;
  onTabChange: (t: InboxTab) => void;
  onLogout: () => void;
  onOpenShortcuts: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ user, activeTab, unreadCount, onTabChange, onLogout, onOpenShortcuts }) => {
  const { theme, toggleTheme } = useTheme();
  const tabs: InboxTab[] = ['primary', 'unread', 'sent', 'all'];
  const tabIcon = (t: InboxTab) => {
    if (t === 'primary') return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />;
    if (t === 'unread') return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />;
    if (t === 'sent') return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />;
    return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />;
  };

  return (
    <aside className="w-60 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col flex-shrink-0 sticky top-0 h-screen overflow-y-auto">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">Email AI</h2>
        </div>
        <button
          onClick={toggleTheme}
          title="Toggle Dark Mode"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors
              ${activeTab === t
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'}`}
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

        <div className="pt-2 border-t border-gray-100 dark:border-gray-700 mt-2 space-y-0.5">
          <Link
            to="/history"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History
          </Link>
          <Link
            to="/settings"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            </svg>
            Settings
          </Link>
          <button
            onClick={onOpenShortcuts}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <span className="text-sm">⌨️</span>
            Shortcuts (<kbd className="text-xs font-mono">?</kbd>)
          </button>
        </div>
      </nav>

      <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2">
        {user.picture
          ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full ring-2 ring-gray-100 dark:ring-gray-700 flex-shrink-0" />
          : <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">{user.name.charAt(0)}</div>
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{user.name}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{user.email}</p>
        </div>
        <button onClick={onLogout} title="Logout"
          className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </aside>
  );
};

// ─── Main Dashboard ──────────────────────────────────────────────────────────
const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [emails, setEmails] = useState<EmailMetadata[]>([]);
  const [urgencyMap, setUrgencyMap] = useState<Record<string, string>>({});
  const [urgencyFilter, setUrgencyFilter] = useState<'ALL' | 'URGENT' | 'IMPORTANT'>('ALL');

  const [bootLoading, setBootLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<InboxTab>('primary');
  const [unreadCount, setUnreadCount] = useState(0);

  const [nextToken, setNextToken] = useState<string | null>(null);
  const [tokenStack, setTokenStack] = useState<string[]>([]);
  const pageNum = tokenStack.length + 1;

  const [search, setSearch] = useState('');
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchUrgency = useCallback((fetchedEmails: EmailMetadata[]) => {
    if (!fetchedEmails.length) return;
    const batch = fetchedEmails.map(e => ({ id: e.id, subject: e.subject, snippet: e.snippet }));
    aiService.batchUrgency(batch)
      .then(urgencies => {
        setUrgencyMap(prev => ({ ...prev, ...urgencies }));
      })
      .catch(() => {});
  }, []);

  const loadPage = useCallback(async (activeTab: InboxTab, pageToken?: string) => {
    setLoading(true);
    try {
      const data = await emailService.getAll(activeTab, pageToken);
      setEmails(data.emails);
      setNextToken(data.next_page_token);
      fetchUrgency(data.emails);
    } catch (err: any) {
      if (err?.response?.status === 401) navigate('/login');
    } finally {
      setLoading(false);
    }
  }, [navigate, fetchUrgency]);

  useEffect(() => {
    Promise.all([
      authService.getMe(),
      emailService.getAll('primary'),
    ])
      .then(([u, page]) => {
        setUser(u);
        setEmails(page.emails);
        setNextToken(page.next_page_token);
        fetchUrgency(page.emails);
        emailService.getAll('unread').then(d => setUnreadCount(d.emails.length)).catch(() => {});
      })
      .catch(err => {
        const status = err?.response?.status;
        if (status === 401) {
          navigate('/login');
        } else {
          const msg = err?.response?.data?.detail ?? err?.message ?? 'Could not connect to server';
          setError(msg);
        }
      })
      .finally(() => setBootLoading(false));
  }, [navigate, fetchUrgency]);

  const handleTabChange = (t: InboxTab) => {
    setTab(t);
    setTokenStack([]);
    setNextToken(null);
    setSearch('');
    setUrgencyFilter('ALL');
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
    setTokenStack(newStack);
    loadPage(tab, newStack[newStack.length - 1]);
    setSearch('');
  };
  const handleRefresh = () => {
    setTokenStack([]);
    setSearch('');
    loadPage(tab);
    emailService.getAll('unread').then(d => setUnreadCount(d.emails.length)).catch(() => {});
  };
  const handleLogout = () => authService.logout().then(() => navigate('/login'));

  // Filter pipeline: Search + Urgency filter
  const filtered = emails.filter(e => {
    const matchesSearch = !search.trim() || (
      senderName(e.from).toLowerCase().includes(search.toLowerCase())
      || e.subject.toLowerCase().includes(search.toLowerCase())
      || e.snippet.toLowerCase().includes(search.toLowerCase())
    );

    const emailUrgency = urgencyMap[e.id] || 'NORMAL';
    const matchesUrgency =
      urgencyFilter === 'ALL'
      || (urgencyFilter === 'URGENT' && emailUrgency === 'URGENT')
      || (urgencyFilter === 'IMPORTANT' && (emailUrgency === 'IMPORTANT' || emailUrgency === 'URGENT'));

    return matchesSearch && matchesUrgency;
  });

  // Global Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isEditing = ['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName || '');
      if (e.key === '?' && !isEditing) {
        e.preventDefault();
        setIsShortcutsOpen(prev => !prev);
      } else if (e.key === 'Escape') {
        setIsShortcutsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (bootLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  if (error || !user) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-red-200 dark:border-red-900 shadow-sm p-8 max-w-md text-center">
        <div className="w-12 h-12 bg-red-50 dark:bg-red-950/50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Something went wrong</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{error ?? 'Unable to load your account.'}</p>
        <button onClick={() => navigate('/login')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          Back to Login
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex overflow-hidden bg-gray-50 dark:bg-gray-900 transition-colors">
      <Sidebar
        user={user}
        activeTab={tab}
        unreadCount={unreadCount}
        onTabChange={handleTabChange}
        onLogout={handleLogout}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center gap-3 flex-shrink-0">
          <div className="flex-1 max-w-xl relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search in current page..."
              className="w-full pl-9 pr-8 py-2 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-700 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          {/* Urgency Filter Pills */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg border border-gray-200 dark:border-gray-600 text-xs">
            <button
              onClick={() => setUrgencyFilter('ALL')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                urgencyFilter === 'ALL'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-xs'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setUrgencyFilter('URGENT')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                urgencyFilter === 'URGENT'
                  ? 'bg-red-500 text-white shadow-xs'
                  : 'text-red-600 dark:text-red-400 hover:text-red-700'
              }`}
            >
              🔴 Urgent
            </button>
            <button
              onClick={() => setUrgencyFilter('IMPORTANT')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                urgencyFilter === 'IMPORTANT'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-amber-600 dark:text-amber-400 hover:text-amber-700'
              }`}
            >
              🟡 Important
            </button>
          </div>

          <button
            onClick={handleRefresh}
            title="Refresh inbox"
            className={`p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${loading ? 'animate-spin' : ''}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </header>

        {/* Scrollable email area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto py-4 px-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Pagination bar */}
              <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/60">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {search ? `${filtered.length} of ${emails.length} shown` : `Page ${pageNum}`}
                  {tab === 'unread' && ` · ${unreadCount} unread`}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handlePrev}
                    disabled={tokenStack.length === 0 || loading}
                    className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400 px-1">{pageNum}</span>
                  <button
                    onClick={handleNext}
                    disabled={!nextToken || loading}
                    className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Email rows / Skeleton */}
              {loading ? (
                <EmailSkeleton />
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700/60 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 font-medium">
                    {search ? `No results for "${search}"` : TAB_EMPTY[tab]}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filtered.map(email => (
                    <EmailCard
                      key={email.id}
                      email={email}
                      urgency={urgencyMap[email.id]}
                      onClick={() => navigate(`/email/${email.id}`, { state: { threadId: email.threadId } })}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Shortcuts Modal */}
      <ShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
    </div>
  );
};

export default Dashboard;
