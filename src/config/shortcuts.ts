/** Keyboard shortcuts shown in Settings > Shortcuts. The keys themselves are
 *  wired up in components/GlobalSearch, components/QuickAddMenu,
 *  components/NotificationBell and hooks/usePageShortcuts. If you change a key
 *  there, change it here too so the list stays true. */
export interface ShortcutItem {
  label: string;
  description: string;
  /** Key caps, in order, e.g. ['Ctrl', 'K']. */
  keys: string[];
}

/** Short key text used in hover tooltips, e.g. "Search Aurafin (Ctrl+K)". */
export const SHORTCUT_HINT = {
  search: 'Ctrl+K',
  addAsset: 'Ctrl+A',
  notifications: 'Alt+N',
  privacy: 'Ctrl+M',
} as const;

/** Sidebar page -> key, so each sidebar item can show it on hover. */
export const PAGE_SHORTCUT_BY_PATH: Record<string, string> = {
  '/': 'Ctrl+O',
  '/wealth': 'Alt+W',
  '/wealth/performance': 'Ctrl+P',
  '/settings': 'Ctrl+Q',
};

export const SHORTCUT_GROUPS: { title: string; items: ShortcutItem[] }[] = [
  {
    title: 'Go to a page',
    items: [
      { label: 'Overview', description: 'Your net worth dashboard.', keys: ['Ctrl', 'O'] },
      { label: 'Wealth', description: 'Your assets and liabilities.', keys: ['Alt', 'W'] },
      { label: 'Performance', description: 'Profit & loss of your investments.', keys: ['Ctrl', 'P'] },
      { label: 'Settings', description: 'Your account and preferences.', keys: ['Ctrl', 'Q'] },
    ],
  },
  {
    title: 'Quick actions',
    items: [
      { label: 'Search', description: 'Search Aurafin. Press again to close it.', keys: ['Ctrl', 'K'] },
      { label: 'Add asset', description: 'Open the Add Asset page.', keys: ['Ctrl', 'A'] },
      { label: 'Notifications', description: 'Open or close the notifications panel.', keys: ['Alt', 'N'] },
      { label: 'Hide / show amounts', description: 'Switch the eye on or off to hide your numbers.', keys: ['Ctrl', 'M'] },
      { label: 'Close pop-up', description: 'Close search, notifications or any open dialog.', keys: ['Esc'] },
    ],
  },
];
