import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { type User } from '../services/auth';
import { useTheme } from '../context/ThemeContext';
import { getInitials, getAvatarColorClass } from '../utils/avatar';
import { Search, Settings, History, LogOut, Sun, Moon } from 'lucide-react';

interface HeaderProps {
  user: User | null;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  showSearch?: boolean;
  customCenterContent?: React.ReactNode;
  rightActionContent?: React.ReactNode;
  onLogout: () => void;
  title?: string;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  searchQuery = '',
  onSearchChange,
  showSearch = false,
  customCenterContent,
  rightActionContent,
  onLogout,
  title = 'Email.ai',
}) => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [localSearch, setLocalSearch] = useState(searchQuery);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearchChange) {
      onSearchChange(localSearch);
    } else {
      navigate(`/dashboard?search=${encodeURIComponent(localSearch)}`);
    }
  };

  const userName = user?.name || 'My Account';
  const userInitial = getInitials(userName);
  const avatarClass = getAvatarColorClass(userName);

  return (
    <header className="h-16 px-6 py-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 bg-white dark:bg-surface-darkCard flex-shrink-0 z-30 select-none">
      {/* Brand Identity */}
      <div
        className="flex items-center gap-3 cursor-pointer flex-shrink-0"
        onClick={() => navigate('/dashboard')}
      >
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2 font-sans">
          <span>{title}</span>
        </h1>
      </div>

      {/* Center Content: Either Custom Center Content (e.g. Thread Subject) OR Search Bar OR empty */}
      <div className="flex-1 max-w-2xl mx-4 sm:mx-6 flex items-center justify-center min-w-0">
        {customCenterContent ? (
          customCenterContent
        ) : showSearch ? (
          <form onSubmit={handleSearchSubmit} className="w-full">
            <div className="flex items-center bg-slate-100 dark:bg-[#1C1D2A] border border-slate-200 dark:border-slate-700/60 rounded-xl px-4 py-2 focus-within:ring-2 focus-within:ring-brand-purple/20 focus-within:border-brand-purple/50 transition-all">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 mr-2.5 flex-shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search emails (from, subject, keywords)..."
                value={localSearch}
                onChange={(e) => {
                  setLocalSearch(e.target.value);
                  if (onSearchChange) onSearchChange(e.target.value);
                }}
                className="bg-transparent text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none w-full"
              />
              {localSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setLocalSearch('');
                    if (onSearchChange) onSearchChange('');
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs ml-1.5 p-0.5 rounded-full"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </form>
        ) : null}
      </div>

      {/* Right Area: Optional Action Content + Avatar with Popover Menu */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {rightActionContent}

        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
            title={userName}
            className="flex items-center gap-2 p-1 rounded-full hover:ring-2 hover:ring-brand-purple/30 transition-all focus:outline-none"
          >
            {user?.picture ? (
              <img
                src={user.picture}
                alt={userName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700"
              />
            ) : (
              <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold text-xs ring-1 ring-slate-200 dark:ring-slate-700 ${avatarClass}`}>
                {userInitial}
              </div>
            )}
          </button>

          {/* User Popover Menu */}
          {isUserMenuOpen && (
            <div className="absolute right-0 top-12 w-64 bg-white dark:bg-surface-darkCard rounded-2xl shadow-xl border border-slate-200/90 dark:border-slate-800 p-2 z-50 animate-fade-in">
              {/* User Identity info */}
              <div className="px-3 py-2 flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800/80 pb-3 mb-1">
                {user?.picture ? (
                  <img
                    src={user.picture}
                    alt={userName}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700 flex-shrink-0"
                  />
                ) : (
                  <div className={`w-9 h-9 rounded-full border flex items-center justify-center font-bold text-xs flex-shrink-0 ${avatarClass}`}>
                    {userInitial}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {userName}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                    {user?.email || 'Gmail Workspace'}
                  </p>
                </div>
              </div>

              {/* Theme Switch Toggle */}
              <button
                onClick={toggleTheme}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  {theme === 'dark' ? (
                    <Moon className="w-4 h-4 text-brand-purple" />
                  ) : (
                    <Sun className="w-4 h-4 text-amber-500" />
                  )}
                  <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                </span>
                <div
                  className={`w-8 h-4 rounded-full transition-colors relative flex items-center p-0.5 ${
                    theme === 'dark' ? 'bg-brand-purple' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-3 h-3 rounded-full bg-white transition-transform ${
                      theme === 'dark' ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </div>
              </button>

              {/* Settings link */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  navigate('/settings');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <Settings className="w-4 h-4 text-slate-400" />
                <span>Settings</span>
              </button>

              {/* History link */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  navigate('/history');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <History className="w-4 h-4 text-slate-400" />
                <span>History</span>
              </button>

              <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />

              {/* Logout button */}
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
