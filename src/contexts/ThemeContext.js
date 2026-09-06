'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'projectnotes:theme';
const ThemeContext = createContext(null);

/** The three states a theme can be in. `system` follows prefers-color-scheme. */
export const THEMES = ['light', 'dark', 'system'];

/**
 * The theme lives in two external systems — localStorage and the OS colour
 * preference — not in React. `useSyncExternalStore` is the primitive for
 * exactly that: it reads the current value on every render and re-subscribes
 * instead of mirroring the value into state inside an effect.
 */
const store = {
  listeners: new Set(),

  subscribe(listener) {
    store.listeners.add(listener);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => listener();
    mq.addEventListener('change', onSystemChange);
    window.addEventListener('storage', onSystemChange);

    return () => {
      store.listeners.delete(listener);
      mq.removeEventListener('change', onSystemChange);
      window.removeEventListener('storage', onSystemChange);
    };
  },

  emit() {
    store.listeners.forEach((listener) => listener());
  },

  getSnapshot() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return THEMES.includes(stored) ? stored : 'system';
    } catch {
      return 'system';
    }
  },

  // The server has no preference to read, so it always renders the neutral
  // default; the inline bootstrap script in layout.js paints the real theme
  // before hydration, so there is no flash.
  getServerSnapshot() {
    return 'system';
  },

  set(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* private mode / blocked storage — the choice just won't persist */
    }
    store.emit();
  },
};

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

function resolve(theme) {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const theme = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const resolved = typeof window === 'undefined' ? 'dark' : resolve(theme);

  // Push the resolved theme out to the DOM and the browser chrome. This is a
  // write to an external system, which is what effects are for.
  useEffect(() => {
    applyTheme(theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0a0b12' : '#f6f7fb');
  }, [theme, resolved]);

  const setTheme = useCallback((next) => {
    store.set(THEMES.includes(next) ? next : 'system');
  }, []);

  const cycleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, resolved, setTheme, cycleTheme }),
    [theme, resolved, setTheme, cycleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
