const THEME_KEY = 'reconcileops.theme';

export type Theme = 'light' | 'dark';

export function getStoredTheme(): Theme {
  const value = localStorage.getItem(THEME_KEY);
  return value === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  // Drop transitions for this frame so text and surfaces change together.
  // Otherwise a 140ms color tween passes through contrast that fails WCAG.
  root.classList.add('theme-switching');
  root.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  window.setTimeout(() => {
    root.classList.remove('theme-switching');
  }, 0);
}
