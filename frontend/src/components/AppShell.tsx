import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { applyTheme, getStoredTheme, type Theme } from '../lib/theme';
import { useEffect, useState } from 'react';
import './AppShell.css';

export function AppShell() {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <div className="shell">
      <aside className="shell__nav" aria-label="Primary">
        <div className="shell__brand">
          <p className="shell__brand-mark">ReconcileOps</p>
          <p className="shell__brand-sub">AED reconciliation</p>
        </div>
        <nav className="shell__links">
          <NavLink to="/" end>
            Overview
          </NavLink>
          <NavLink to="/payments">Payments</NavLink>
          <NavLink to="/import">Import CSV</NavLink>
          <NavLink to="/reconciliation">Reconciliation</NavLink>
          <NavLink to="/investigations">Investigations</NavLink>
        </nav>
        <div className="shell__footer">
          <p className="shell__actor">
            {user?.displayName}
            <span>{user?.role}</span>
          </p>
          <button
            type="button"
            className="shell__ghost"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            {theme === 'light' ? 'Dark theme' : 'Light theme'}
          </button>
          <button type="button" className="shell__ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}
