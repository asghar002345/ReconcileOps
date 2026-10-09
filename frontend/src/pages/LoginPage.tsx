import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { applyTheme, getStoredTheme } from '../lib/theme';
import './LoginPage.css';

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState('analyst@demo.reconcileops.local');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in');
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

      <form className="login__form" onSubmit={onSubmit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {error ? <p className="login__error">{error}</p> : null}
        <button type="submit" disabled={submitting || loading}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="login__hint">
          Demo: analyst@demo.reconcileops.local / Password123!
        </p>
      </form>
    </div>
  );
}
