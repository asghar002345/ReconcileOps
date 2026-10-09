const THEME_KEY = 'reconcileops.theme';

export type Theme = 'light' | 'dark';

export function getStoredTheme(): Theme {
  const value = localStorage.getItem(THEME_KEY);
  return value === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}
