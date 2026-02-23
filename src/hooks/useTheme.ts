import { useState, useEffect, useCallback } from 'react';

type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'research-journal-theme';

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(preference: ThemePreference) {
  const resolved = preference === 'system' ? getSystemTheme() : preference;
  document.documentElement.setAttribute('data-theme', resolved);
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    return (localStorage.getItem(STORAGE_KEY) as ThemePreference) || 'system';
  });

  useEffect(() => {
    applyTheme(preference);
  }, [preference]);

  // Listen for OS theme changes when in system mode
  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [preference]);

  const setTheme = useCallback((next: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, next);
    setPreference(next);
  }, []);

  const cycle = useCallback(() => {
    const order: ThemePreference[] = ['system', 'light', 'dark'];
    const idx = order.indexOf(preference);
    const next = order[(idx + 1) % order.length];
    setTheme(next);
  }, [preference, setTheme]);

  return { preference, setTheme, cycle };
}