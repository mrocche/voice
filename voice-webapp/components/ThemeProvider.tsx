'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type AppTheme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
  /** Resolved to 'light' or 'dark' — never 'system' */
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => {},
  resolvedTheme: 'light',
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getStoredTheme(): AppTheme {
  if (typeof window === 'undefined') return 'system';
  const v = localStorage.getItem('voiceApp_canvasTheme');
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'system';
}

function systemIsDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(theme: AppTheme) {
  const dark = theme === 'dark' || (theme === 'system' && systemIsDark());
  document.documentElement.classList.toggle('dark', dark);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // Read from localStorage and apply on mount
  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    applyTheme(stored);
    setResolvedTheme(
      stored === 'dark' || (stored === 'system' && systemIsDark()) ? 'dark' : 'light'
    );
  }, []);

  // Watch system preference changes (relevant when theme === 'system')
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      // Re-read stored theme in case it changed
      const stored = getStoredTheme();
      applyTheme(stored);
      setResolvedTheme(
        stored === 'dark' || (stored === 'system' && mq.matches) ? 'dark' : 'light'
      );
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const setTheme = useCallback((t: AppTheme) => {
    localStorage.setItem('voiceApp_canvasTheme', t);
    setThemeState(t);
    applyTheme(t);
    setResolvedTheme(
      t === 'dark' || (t === 'system' && systemIsDark()) ? 'dark' : 'light'
    );
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
