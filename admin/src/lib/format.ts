/**
 * Numbers, said the way a person would say them.
 *
 * Shared by the page and by the alert email, so a warning and the row it came
 * from cannot describe the same figure two different ways.
 */

export function human(value: number, unit: string): string {
  if (unit === 'bytes') return bytes(value);
  if (unit === 'days') return `${value.toFixed(1)} days`;
  return `${Math.round(value).toLocaleString()} ${unit}`;
}

export function bytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function count(n: number): string {
  return Math.round(n).toLocaleString();
}

/** "3 days ago", for the last-run line. Coarse on purpose: this is a daily job. */
export function ago(iso: string, now = Date.now()): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return 'never';
  const hours = ms / 3_600_000;
  if (hours < 1) return 'less than an hour ago';
  if (hours < 24) return `${Math.round(hours)} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
