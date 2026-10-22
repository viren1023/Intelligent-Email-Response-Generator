import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { type User } from '../services/auth';
import { type InboxTab } from '../services/email';
import {
  PenLine,
  Inbox,
  Send,
  Settings,
  History,
  LogOut,
  MailCheck,
  Mail,
  FileText,
} from 'lucide-react';

interface SidebarProps {
  user?: User | null;
  activeTab?: InboxTab | null;
  activePage: 'dashboard' | 'history' | 'settings' | 'email';
  unreadCount?: number;
  onTabChange?: (tab: InboxTab) => void;
  onOpenCompose: () => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab = 'primary',
  activePage,
  unreadCount = 0,
  onTabChange,
  onOpenCompose,
  onLogout,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);
    }, 120);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 160);
  };

  const handleTabClick = (tab: InboxTab) => {
    if (activePage === 'dashboard' && onTabChange) {
      onTabChange(tab);
    } else {
      navigate(`/dashboard?tab=${tab}`);
    }
  };

  const navItems = [
    { id: 'primary' as InboxTab, label: 'Inbox', icon: Inbox, count: unreadCount },
    { id: 'sent' as InboxTab, label: 'Sent', icon: Send },
    { id: 'drafts' as InboxTab, label: 'Drafts', icon: FileText },
    { id: 'unread' as InboxTab, label: 'Unread', icon: MailCheck },
    { id: 'all' as InboxTab, label: 'All Mail', icon: Mail },
  ];

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`group flex flex-col flex-shrink-0 bg-slate-50/80 dark:bg-surface-darkCard border-r border-slate-200 dark:border-slate-800/80 h-full select-none transition-[width,box-shadow] duration-500 ease-[cubic-bezier(0.2,0,0,1)] z-20 ${
        isHovered ? 'w-60 shadow-xl' : 'w-[68px]'
      } overflow-x-hidden`}
    >
      {/* Compose Mail Button */}
      <div className="p-3">
        <button
          onClick={onOpenCompose}
          title="Compose mail"
          className={`flex items-center justify-center rounded-xl bg-charcoal hover:bg-[#3B3F4E] text-white font-medium text-xs sm:text-sm transition-all duration-400 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.97] shadow-sm ${
            isHovered ? 'w-full py-2.5 px-4 gap-2' : 'w-10 h-10 aspect-square mx-auto p-0'
          }`}
        >
          <PenLine className="w-4 h-4 text-slate-200 flex-shrink-0" />
          <span
            className={`whitespace-nowrap transition-all duration-400 ease-[cubic-bezier(0.2,0,0,1)] overflow-hidden ${
              isHovered ? 'opacity-100 max-w-[120px]' : 'opacity-0 max-w-0 pointer-events-none'
            }`}
          >
            Compose mail
          </span>
        </button>
      </div>

      {/* Primary Navigation Folders */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1.5">
        <div
          className={`text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 py-1 transition-opacity duration-300 ease-in-out ${
            isHovered ? 'opacity-100' : 'opacity-0 h-1 overflow-hidden'
          }`}
        >
          Mailboxes
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === 'dashboard' && activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              title={item.label}
              className={`flex items-center rounded-xl text-xs sm:text-sm font-medium transition-all duration-400 ease-[cubic-bezier(0.2,0,0,1)] ${
                isHovered
                  ? 'w-full px-3.5 py-2.5 justify-start'
                  : 'w-10 h-10 aspect-square mx-auto justify-center p-0'
              } ${
                isActive
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              {/* Centered Square Icon with directly anchored badge dot */}
              <div className="relative flex-shrink-0 flex items-center justify-center">
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? 'text-brand-purple' : 'text-slate-500 dark:text-slate-400'
                  }`}
                />
                {item.count !== undefined && item.count > 0 && !isHovered && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-brand-purple ring-2 ring-white dark:ring-surface-darkCard" />
                )}
              </div>

              <span
                className={`whitespace-nowrap transition-all duration-400 ease-[cubic-bezier(0.2,0,0,1)] overflow-hidden ml-3 ${
                  isHovered ? 'opacity-100 max-w-[100px]' : 'opacity-0 max-w-0 pointer-events-none'
                }`}
              >
                {item.label}
              </span>

              {/* Unread number badge when expanded */}
              {item.count !== undefined && item.count > 0 && isHovered && (
                <span className="ml-auto text-[11px] font-bold text-brand-purple bg-purple-50 dark:bg-purple-950/60 border border-purple-200/60 dark:border-purple-800/60 px-2 py-0.5 rounded-full transition-opacity duration-300">
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Auxiliary Links */}
      <div className="p-2 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5">
        <Link
          to="/history"
          title="History"
          className={`flex items-center rounded-xl text-xs font-medium transition-all duration-400 ease-[cubic-bezier(0.2,0,0,1)] ${
            isHovered
              ? 'w-full px-3.5 py-2.5 justify-start gap-3'
              : 'w-10 h-10 aspect-square mx-auto justify-center p-0'
          } ${
            activePage === 'history'
              ? 'text-brand-purple font-semibold bg-purple-50 dark:bg-purple-950/40'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <History className="w-4 h-4 flex-shrink-0" />
          <span
            className={`whitespace-nowrap transition-all duration-400 ease-[cubic-bezier(0.2,0,0,1)] overflow-hidden ${
              isHovered ? 'opacity-100 max-w-[100px]' : 'opacity-0 max-w-0 pointer-events-none'
            }`}
          >
            History
          </span>
        </Link>

        <Link
          to="/settings"
          title="Settings"
          className={`flex items-center rounded-xl text-xs font-medium transition-all duration-400 ease-[cubic-bezier(0.2,0,0,1)] ${
            isHovered
              ? 'w-full px-3.5 py-2.5 justify-start gap-3'
              : 'w-10 h-10 aspect-square mx-auto justify-center p-0'
          } ${
            activePage === 'settings'
              ? 'text-brand-purple font-semibold bg-purple-50 dark:bg-purple-950/40'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          <span
            className={`whitespace-nowrap transition-all duration-400 ease-[cubic-bezier(0.2,0,0,1)] overflow-hidden ${
              isHovered ? 'opacity-100 max-w-[100px]' : 'opacity-0 max-w-0 pointer-events-none'
            }`}
          >
            Settings
          </span>
        </Link>

        <button
          onClick={onLogout}
          title="Logout"
          className={`flex items-center rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors ${
            isHovered
              ? 'w-full px-3.5 py-2.5 justify-start gap-3'
              : 'w-10 h-10 aspect-square mx-auto justify-center p-0'
          }`}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span
            className={`whitespace-nowrap transition-all duration-400 ease-[cubic-bezier(0.2,0,0,1)] overflow-hidden ${
              isHovered ? 'opacity-100 max-w-[100px]' : 'opacity-0 max-w-0 pointer-events-none'
            }`}
          >
            Logout
          </span>
        </button>
      </div>
    </aside>
  );
};
