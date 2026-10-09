import { useEffect, useId, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { applyTheme, getStoredTheme } from '../lib/theme';
import { safeInternalPath } from '../lib/safeRedirect';
import { userFacingError } from '../lib/userFacingError';
import './LoginPage.css';

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const location = useLocation();
  const errorId = useId();
  const [email, setEmail] = useState('analyst@demo.reconcileops.local');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fromState = (location.state as { from?: unknown } | null)?.from;
  const redirectTo = safeInternalPath(fromState, '/');

  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  if (!loading && user) {
    return <Navigate to={redirectTo} replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Email and password are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(trimmedEmail, password);
    } catch (err) {
      setError(userFacingError(err, 'Unable to sign in'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login">
      <section className="login__hero">
        <p className="login__brand">ReconcileOps</p>
        <h1>Payment evidence, exact AED math, human review.</h1>
        <p className="login__lead">
          Sign in to import settlement files and inspect workspace payments.
        </p>
      </section>

      <form className="login__form" onSubmit={onSubmit} noValidate>
        <label htmlFor="login-email">
          Email
          <input
            id="login-email"
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </label>
        <label htmlFor="login-password">
          Password
          <input
            id="login-password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </label>
        {error ? (
          <p id={errorId} className="login__error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={submitting || loading}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="login__hint">
          Demo workspace sign-in:{' '}
          <span className="tabular">analyst@demo.reconcileops.local</span> /{' '}
          <span className="tabular">Password123!</span>
        </p>
      </form>
    </div>
  );
}
