import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { applyTheme, getStoredTheme, type Theme } from '../lib/theme';
import { useEffect, useId, useState } from 'react';
import './AppShell.css';

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/payments', label: 'Payments' },
  { to: '/import', label: 'Import CSV' },
  { to: '/reconciliation', label: 'Reconciliation' },
  { to: '/investigations', label: 'Investigations' },
] as const;

export function AppShell() {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());
  const navId = useId();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'));
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="shell__nav" aria-label="Primary">
        <div className="shell__brand">
          <p className="shell__brand-mark" id={`${navId}-brand`}>
            ReconcileOps
          </p>
          <p className="shell__brand-sub">AED reconciliation</p>
        </div>
        <nav className="shell__links" aria-labelledby={`${navId}-brand`}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              className={({ isActive }) =>
                isActive ? 'shell__link shell__link--active' : 'shell__link'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="shell__footer">
          <p className="shell__actor">
            <span className="shell__actor-name">{user?.displayName}</span>
            <span className="shell__actor-role">{user?.role}</span>
          </p>
          <button
            type="button"
            className="shell__ghost"
            onClick={toggleTheme}
            aria-pressed={theme === 'dark'}
            aria-label={
              theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'
            }
          >
            {theme === 'light' ? 'Dark theme' : 'Light theme'}
          </button>
          <button type="button" className="shell__ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main id="main-content" className="shell__main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
