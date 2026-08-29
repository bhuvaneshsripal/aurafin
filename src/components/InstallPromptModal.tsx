import { Smartphone, Zap, Lock, MoreVertical, Download, X } from 'lucide-react';
import { useInstallPromptStore } from '../store/installPromptStore';

export default function InstallPromptModal() {
  const showManualPrompt = useInstallPromptStore((s) => s.showManualPrompt);
  const setShowManualPrompt = useInstallPromptStore((s) => s.setShowManualPrompt);

  if (!showManualPrompt) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 px-4 pb-6 sm:pb-4"
      onClick={() => setShowManualPrompt(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-6"
      >
        <button
          onClick={() => setShowManualPrompt(false)}
          className="icon-outline-green tap-scale absolute top-4 right-4 h-8 w-8 flex items-center justify-center"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-brand-600 text-white flex items-center justify-center font-luxury font-bold text-sm shrink-0">
            AU
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Install <span className="font-luxury">Aurafin</span>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-500">Add to your home screen</p>
          </div>
        </div>

        <div className="space-y-2.5 mb-5">
          <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
            <Smartphone size={15} className="text-slate-600 shrink-0" />
            Opens instantly — no browser, no tabs
          </div>
          <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
            <Zap size={15} className="text-slate-600 shrink-0" />
            Faster loads with offline caching
          </div>
          <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
            <Lock size={15} className="text-slate-600 shrink-0" />
            Same app, same data — nothing changes
          </div>
        </div>

        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2.5">
          To install, use your browser menu:
        </p>
        <div className="space-y-2.5 mb-5">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
              1
            </span>
            Tap the <MoreVertical size={14} className="text-slate-600 shrink-0" /> menu in your browser
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
              2
            </span>
            Tap <Download size={14} className="text-slate-600 shrink-0" /> Install app or{' '}
            <span className="font-medium text-slate-800 dark:text-slate-100">Add to Home Screen</span>
          </div>
        </div>

        <button
          onClick={() => setShowManualPrompt(false)}
          className="w-full text-center text-sm font-medium text-slate-600 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 py-1"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
