import React from 'react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: 'R', desc: 'Generate AI reply (when email thread open)' },
  { key: 'Ctrl + Enter', desc: 'Send email reply' },
  { key: 'E', desc: 'Focus reply editor textarea' },
  { key: 'Esc', desc: 'Close open modals / AI chat panel' },
  { key: '?', desc: 'Open this keyboard shortcuts cheat-sheet' },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">⌨️</span>
            <h3 className="font-semibold text-gray-900 dark:text-white">Keyboard Shortcuts</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-3">
          {SHORTCUTS.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-gray-600 dark:text-gray-300">{item.desc}</span>
              <kbd className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-xs font-mono font-semibold text-gray-800 dark:text-gray-200 shadow-sm">
                {item.key}
              </kbd>
            </div>
          ))}
        </div>
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Press <kbd className="font-mono">Esc</kbd> anytime to dismiss</p>
        </div>
      </div>
    </div>
  );
};
