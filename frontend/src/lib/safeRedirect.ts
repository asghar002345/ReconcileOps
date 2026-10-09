/**
 * Returns a same-origin relative path suitable for post-login navigation.
 * Rejects protocol-relative URLs, absolute URLs, and other open-redirect shapes.
 */
export function safeInternalPath(
  candidate: unknown,
  fallback = '/',
): string {
  if (typeof candidate !== 'string' || candidate.trim() === '') {
    return fallback;
  }
  const path = candidate.trim();
  if (!path.startsWith('/')) return fallback;
  if (path.startsWith('//')) return fallback;
  if (path.includes('://')) return fallback;
  if (path.includes('\\')) return fallback;
  return path;
}
