const TOKEN_KEY = 'reconcileops.accessToken';

/**
 * Session-scoped token storage. Prefer sessionStorage over localStorage so
 * closing the browser/tab clears the JWT. Migrates any legacy localStorage value once.
 * Long-term hardening still requires HttpOnly cookie sessions on the backend.
 */
export function readAccessToken(): string | null {
  const fromSession = sessionStorage.getItem(TOKEN_KEY);
  if (fromSession) return fromSession;

  const legacy = localStorage.getItem(TOKEN_KEY);
  if (legacy) {
    sessionStorage.setItem(TOKEN_KEY, legacy);
    localStorage.removeItem(TOKEN_KEY);
    return legacy;
  }
  return null;
}

export function writeAccessToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  localStorage.removeItem(TOKEN_KEY);
}

export function clearAccessToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
}
