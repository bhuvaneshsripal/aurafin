import { create } from 'zustand';

interface UiState {
  theme: 'light' | 'dark';
  privacyMode: boolean;
  toggleTheme: () => void;
  togglePrivacy: () => void;
  initTheme: () => void;
}

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: 'light',
  privacyMode: true,
  initTheme: () => {
    const stored = localStorage.getItem('aurafin-theme');
    const theme: 'light' | 'dark' = stored === 'dark' ? 'dark' : 'light';
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('aurafin-theme', next);
    set({ theme: next });
  },
  togglePrivacy: () => set((s) => ({ privacyMode: !s.privacyMode })),
}));
