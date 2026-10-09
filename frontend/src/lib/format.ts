/** Format an ISO timestamp for dense tables (UTC, compact). */
export function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace('.000Z', 'Z');
}

/** Locale-friendly date/time for meta lines. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatAed(fils: string | null | undefined): string {
  if (fils == null || fils === '') return '—';
  try {
    const value = BigInt(fils);
    const negative = value < 0n;
    const abs = negative ? -value : value;
    const whole = abs / 100n;
    const fraction = (abs % 100n).toString().padStart(2, '0');
    return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
  } catch {
    return '—';
  }
}
