import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { responseService, type ResponseHistoryItem } from '../services/responses';
import { authService, type User } from '../services/auth';
import { useTheme } from '../context/ThemeContext';

const History: React.FC = () => {
  const [history, setHistory] = useState<ResponseHistoryItem[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    Promise.all([
      authService.getMe(),
      responseService.getHistory(),
    ])
      .then(([userData, historyData]) => {
        setUser(userData);
        setHistory(historyData);
      })
      .catch(() => navigate('/login'))
      .finally(() => setLoading(false));
  }, [navigate]);

  return (
    <div className="h-screen flex overflow-hidden bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Sticky sidebar */}
      <aside className="w-60 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col flex-shrink-0 sticky top-0 h-screen">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Email AI</h2>
          </div>
          <button
            onClick={toggleTheme}
            title="Toggle theme"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          <Link
            to="/dashboard"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            Inbox
          </Link>
          <Link
            to="/history"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
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
        </nav>

        {user && (
          <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2">
            {user.picture
              ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full ring-2 ring-gray-100 dark:ring-gray-700" />
              : <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm">{user.name.charAt(0)}</div>
            }
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{user.name}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-8">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">Response History</h1>

          {loading ? (
            <div className="text-center py-20 text-gray-400">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-20 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
              No response history found.
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
              {history.map(item => (
                <div key={item.id} className="p-5 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-gray-900 dark:text-white text-sm">{item.sender}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{new Date(item.generated_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </div>
                  <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">{item.subject}</h4>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                      item.status === 'SENT'
                        ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300'
                        : item.status === 'EDITED'
                        ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300'
                        : 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300'
                    }`}>
                      {item.status}
                    </span>
                    {item.sent_at && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">Sent on: {new Date(item.sent_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default History;
