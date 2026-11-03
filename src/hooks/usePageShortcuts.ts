import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** Keyboard shortcuts that jump straight to a main page (desktop):
 *    Ctrl/Cmd + O      Overview
 *    Alt + W           Wealth (assets)
 *    Ctrl/Cmd + P      Performance (profit & loss)
 *    Ctrl + Q          Settings (on Mac, Cmd+Q quits the browser and can't be used)
 *
 *  Wealth uses Alt+W, not Ctrl+W: browsers keep Ctrl+W for "Close tab" and
 *  never hand it to the page, so a site can't use it. Ctrl+O ("Open file") and
 *  Ctrl+P ("Print") can be taken over by the page, so those work as asked.
 *
 *  Skipped while a dialog is open, or when `enabled` is false (e.g. onboarding). */
export function usePageShortcuts(enabled: boolean) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.shiftKey) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
      let to: string | null = null;
      if (mod && e.code === 'KeyO') to = '/';
      else if (mod && e.code === 'KeyP') to = '/wealth/performance';
      else if (mod && e.code === 'KeyQ') to = '/settings?tab=basic';
      else if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyW') to = '/wealth?tab=assets';
      if (!to) return;
      e.preventDefault();
      navigate(to);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, navigate]);
}
