import React from 'react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: 'R', desc: 'Generate AI reply (when email thread open)' },
  { key: 'Ctrl + Enter', desc: 'Send email reply draft' },
  { key: 'E', desc: 'Focus reply editor textarea' },
  { key: 'Esc', desc: 'Close open modals / AI chat panel' },
  { key: '?', desc: 'Open this keyboard shortcuts cheat-sheet' },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-4v-4m0 4h.01M4 12h16M4 8h16M4 16h12" />
              </svg>
            </div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base">Keyboard Shortcuts</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-xl active:scale-95 transition-all duration-150 ease-out hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-3.5">
          {SHORTCUTS.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between py-1">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{item.desc}</span>
              <kbd className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-800 dark:text-slate-200 shadow-[0_2px_0_rgba(0,0,0,0.06)]">
                {item.key}
              </kbd>
            </div>
          ))}
        </div>
        <div className="px-6 py-3.5 bg-slate-50/80 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 text-center">
          <p className="text-[11px] font-medium text-slate-400">
            Press <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300">Esc</kbd> anytime to dismiss
          </p>
        </div>
      </div>
    </div>
  );
};
