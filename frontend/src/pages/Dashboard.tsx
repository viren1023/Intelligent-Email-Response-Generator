import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService, type User } from '../services/auth';
import { emailService, type EmailMetadata } from '../services/email';

const Dashboard: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [emails, setEmails] = useState<EmailMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    authService.getMe()
      .then(u => {
        setUser(u);
        return emailService.getUnread();
      })
      .then(data => {
        setEmails(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        if (err.response?.status === 401) {
            navigate('/login');
        } else {
            alert('Failed to fetch emails. Check the console and backend logs.');
        }
        setLoading(false);
      });
  }, [navigate]);

  if (!user) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">Email AI</h2>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <Link to="/dashboard" className="flex items-center px-3 py-2 text-sm font-medium rounded-md bg-blue-50 text-blue-700">
            <svg className="mr-3 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
            Inbox
          </Link>
          <Link to="/history" className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
            <svg className="mr-3 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            History
          </Link>
          <Link to="/settings" className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
            <svg className="mr-3 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Settings
          </Link>
        </nav>
        <div className="p-4 border-t border-gray-200 flex items-center justify-between">
          <div className="flex items-center">
            {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full ring-2 ring-gray-100" /> : <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold">{user.name.charAt(0)}</div>}
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-700">{user.name}</p>
            </div>
          </div>
          <button onClick={() => authService.logout().then(() => navigate('/login'))} className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors px-2 py-1 rounded hover:bg-red-50">Logout</button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Unread Emails</h1>
            <p className="text-sm text-gray-500 mt-1">Select an email to view the conversation and generate an AI reply.</p>
          </div>
          <button 
            onClick={() => { setLoading(true); emailService.getUnread().then(setEmails).finally(() => setLoading(false)); }} 
            className="flex items-center text-sm font-medium bg-white border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors shadow-sm text-gray-700"
          >
            <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Refresh Inbox
          </button>
        </header>

        <div className="p-8 flex-1 overflow-auto bg-gray-50/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-500 font-medium">Fetching your unread emails...</p>
            </div>
          ) : emails.length === 0 ? (
            <div className="text-center py-24 bg-white rounded-xl border border-gray-200 shadow-sm max-w-2xl mx-auto">
              <div className="mx-auto w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Inbox Zero!</h3>
              <p className="mt-2 text-gray-500 max-w-sm mx-auto">You're all caught up. There are no new unread emails in your inbox right now.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100 max-w-5xl mx-auto overflow-hidden">
              {emails.map(email => (
                <div 
                  key={email.id} 
                  className="p-5 hover:bg-blue-50/50 cursor-pointer transition-colors group flex items-start gap-4" 
                  onClick={() => navigate(`/email/${email.id}`, { state: { threadId: email.threadId } })}
                >
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-gray-600 font-bold shadow-inner">
                      {(email.from.split('<')[0].replace(/"/g, '').trim() || '?').charAt(0).toUpperCase()}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-gray-900 truncate pr-4 text-base">
                        {email.from.split('<')[0].replace(/"/g, '').trim()}
                      </span>
                      <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                        {new Date(email.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at {new Date(email.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-gray-800 mb-1.5 truncate group-hover:text-blue-700 transition-colors">
                      {email.subject || '(No Subject)'}
                    </h4>
                    <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">
                      {email.snippet}
                    </p>
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

export default Dashboard;
