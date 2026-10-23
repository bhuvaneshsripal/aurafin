import { create } from 'zustand';

// Base values these scales are relative to — matches the static values that
// used to live directly in index.css (html font-size, and the .app-scale
// zoom on the content column). Font defaults to 90%, screen defaults to 100%.
const BASE_FONT_PX = 17;
const DEFAULT_FONT_SCALE = 0.9;
const DEFAULT_SCREEN_SCALE = 1;

const FONT_STEP = 0.05;
const FONT_MIN = 0.85;
const FONT_MAX = 1.3;

const SCREEN_STEP = 0.05;
const SCREEN_MIN = 0.75;
const SCREEN_MAX = 1.15;

const FONT_KEY = 'aurafin-font-scale';
const SCREEN_KEY = 'aurafin-screen-scale';

const EYE_SHOW_KEY = 'aurafin-floating-eye';
const EYE_POS_KEY = 'aurafin-floating-eye-pos';

function readEyePos(): { x: number; y: number } | null {
  try {
    const p = JSON.parse(localStorage.getItem(EYE_POS_KEY) ?? 'null');
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// Round to avoid floating point noise like 0.9500000000000001 after repeated
// +/- taps.
function round(value: number) {
  return Math.round(value * 100) / 100;
}

function applyFontScale(scale: number) {
  document.documentElement.style.fontSize = `${BASE_FONT_PX * scale}px`;
}

function applyScreenScale(scale: number) {
  document.documentElement.style.setProperty('--app-zoom', String(scale));
}

interface DisplaySettingsState {
  fontScale: number;
  screenScale: number;
  /** Show the floating (draggable) eye button on screen. */
  floatingEye: boolean;
  /** Where the floating eye was left (px from top-left); null = default corner. */
  eyePos: { x: number; y: number } | null;
  setFloatingEye: (on: boolean) => void;
  setEyePos: (pos: { x: number; y: number } | null) => void;
  init: () => void;
  increaseFont: () => void;
  decreaseFont: () => void;
  resetFont: () => void;
  increaseScreen: () => void;
  decreaseScreen: () => void;
  resetScreen: () => void;
}

export const useDisplaySettingsStore = create<DisplaySettingsState>((set, get) => ({
  fontScale: DEFAULT_FONT_SCALE,
  screenScale: DEFAULT_SCREEN_SCALE,
  floatingEye: localStorage.getItem(EYE_SHOW_KEY) !== 'false',
  eyePos: readEyePos(),
  setFloatingEye: (on) => {
    try { localStorage.setItem(EYE_SHOW_KEY, String(on)); } catch { /* best-effort */ }
    set({ floatingEye: on });
  },
  setEyePos: (pos) => {
    try {
      if (pos) localStorage.setItem(EYE_POS_KEY, JSON.stringify(pos));
      else localStorage.removeItem(EYE_POS_KEY);
    } catch { /* best-effort */ }
    set({ eyePos: pos });
  },

  init: () => {
    const storedFont = parseFloat(localStorage.getItem(FONT_KEY) ?? '');
    const fontScale = clamp(
      Number.isFinite(storedFont) ? storedFont : DEFAULT_FONT_SCALE,
      FONT_MIN,
      FONT_MAX
    );
    const storedScreen = parseFloat(localStorage.getItem(SCREEN_KEY) ?? '');
    const screenScale = clamp(
      Number.isFinite(storedScreen) ? storedScreen : DEFAULT_SCREEN_SCALE,
      SCREEN_MIN,
      SCREEN_MAX
    );
    applyFontScale(fontScale);
    applyScreenScale(screenScale);
    set({ fontScale, screenScale });
  },

  increaseFont: () => {
    const next = round(clamp(get().fontScale + FONT_STEP, FONT_MIN, FONT_MAX));
    applyFontScale(next);
    localStorage.setItem(FONT_KEY, String(next));
    set({ fontScale: next });
  },
  decreaseFont: () => {
    const next = round(clamp(get().fontScale - FONT_STEP, FONT_MIN, FONT_MAX));
    applyFontScale(next);
    localStorage.setItem(FONT_KEY, String(next));
    set({ fontScale: next });
  },
  resetFont: () => {
    applyFontScale(DEFAULT_FONT_SCALE);
    localStorage.setItem(FONT_KEY, String(DEFAULT_FONT_SCALE));
    set({ fontScale: DEFAULT_FONT_SCALE });
  },

  increaseScreen: () => {
    const next = round(clamp(get().screenScale + SCREEN_STEP, SCREEN_MIN, SCREEN_MAX));
    applyScreenScale(next);
    localStorage.setItem(SCREEN_KEY, String(next));
    set({ screenScale: next });
  },
  decreaseScreen: () => {
    const next = round(clamp(get().screenScale - SCREEN_STEP, SCREEN_MIN, SCREEN_MAX));
    applyScreenScale(next);
    localStorage.setItem(SCREEN_KEY, String(next));
    set({ screenScale: next });
  },
  resetScreen: () => {
    applyScreenScale(DEFAULT_SCREEN_SCALE);
    localStorage.setItem(SCREEN_KEY, String(DEFAULT_SCREEN_SCALE));
    set({ screenScale: DEFAULT_SCREEN_SCALE });
  },
}));

export const FONT_MIN_SCALE = FONT_MIN;
export const FONT_MAX_SCALE = FONT_MAX;
export const SCREEN_MIN_SCALE = SCREEN_MIN;
export const SCREEN_MAX_SCALE = SCREEN_MAX;
