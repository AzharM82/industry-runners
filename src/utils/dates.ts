/**
 * Local-date helpers.
 *
 * `new Date().toISOString().split('T')[0]` yields the UTC date, which is
 * already "tomorrow" every evening in US time zones (after 5 PM PT / 8 PM ET).
 * That made the admin Daily Report open on a day with no data and stamped
 * Investment Tracker buys with the wrong date. Always use these instead.
 */

/** YYYY-MM-DD for the given Date in the browser's local time zone. */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today's date (local time zone) as YYYY-MM-DD. */
export function todayLocal(): string {
  return toLocalDateStr(new Date());
}

/**
 * Parse a YYYY-MM-DD string as a LOCAL calendar date.
 * (`new Date('2026-09-07')` parses as UTC midnight, which displays as the
 * previous evening in US time zones.)
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
