import { ApiError } from '../api/client';

/** Map API failures to short, actionable copy without leaking internals. */
export function userFacingError(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401:
        return 'Your session expired. Sign in again.';
      case 403:
        return 'You do not have permission for this action.';
      case 404:
        return 'That resource was not found.';
      case 409:
        return err.message || 'This record changed. Refresh and try again.';
      case 422:
        return err.message || 'Check the form values and try again.';
      case 429:
        return 'Too many requests. Wait a moment and try again.';
      case 408:
        return 'The operation timed out. Try again.';
      default:
        if (err.status >= 500) {
          return 'The server had a problem. Try again shortly.';
        }
        return err.message || fallback;
    }
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'You appear to be offline. Check your connection and try again.';
  }
  return fallback;
}
