import React from 'react';
import { Sparkles, MessageSquare } from 'lucide-react';

export type RightPanelTab = 'generator' | 'chat' | null;

interface RightToolDockProps {
  activeTab: RightPanelTab;
  onToggleTab: (tab: 'generator' | 'chat') => void;
}

export const RightToolDock: React.FC<RightToolDockProps> = ({
  activeTab,
  onToggleTab,
}) => {
  return (
    <aside className="w-14 sm:w-16 flex-shrink-0 flex flex-col items-center py-4 gap-3 bg-white dark:bg-surface-darkCard border-l border-slate-200/80 dark:border-slate-800/80 select-none z-10">
      {/* AI Response Generator */}
      <button
        onClick={() => onToggleTab('generator')}
        title="AI Response Generator"
        aria-label="AI Response Generator"
        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all duration-150 border ${
          activeTab === 'generator'
            ? 'bg-purple-50 dark:bg-purple-950/60 text-brand-purple border-purple-300 dark:border-purple-600 shadow-2xs ring-2 ring-purple-500/10'
            : 'bg-white dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700/60 border-slate-200/90 dark:border-slate-700/80 shadow-2xs'
        }`}
      >
        <Sparkles className="w-4 h-4" />
      </button>

      {/* Chat with Email */}
      <button
        onClick={() => onToggleTab('chat')}
        title="Chat with Email"
        aria-label="Chat with Email"
        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all duration-150 border ${
          activeTab === 'chat'
            ? 'bg-purple-50 dark:bg-purple-950/60 text-brand-purple border-purple-300 dark:border-purple-600 shadow-2xs ring-2 ring-purple-500/10'
            : 'bg-white dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700/60 border-slate-200/90 dark:border-slate-700/80 shadow-2xs'
        }`}
      >
        <MessageSquare className="w-4 h-4" />
      </button>
    </aside>
  );
};
