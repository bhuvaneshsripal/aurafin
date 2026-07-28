import { Eye, EyeOff } from 'lucide-react';
import { useUiStore } from '../store/uiStore';

/**
 * Small floating "show/hide amounts" toggle, pinned to the bottom-right
 * corner on desktop/laptop layouts only. The original toggle in the Topbar
 * stays put on both desktop and mobile — this is just a second, quick-reach
 * copy for desktop, where the bottom-right corner is otherwise empty.
 */
export default function PrivacyFab() {
  const { privacyMode, togglePrivacy } = useUiStore();

  return (
    <button
      onClick={togglePrivacy}
      title={privacyMode ? 'Show amounts' : 'Hide amounts'}
      className="
        tap-scale hidden md:flex
        fixed bottom-4 right-4 z-30
        h-9 w-9 items-center justify-center rounded-full
        bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300
        border border-slate-200 dark:border-slate-700 shadow-md
        hover:bg-slate-50 dark:hover:bg-slate-700
      "
    >
      {privacyMode ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );
}
