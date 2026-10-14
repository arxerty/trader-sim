/**
 * Period keys for leaderboards, all in UTC so every player shares the same day/week/season.
 *  - day:    2026-10-14
 *  - week:   2026-W42 (ISO-8601 week)
 *  - season: 2026-10  (calendar month)
 */
const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function seasonKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday decides the ISO year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(week)}`;
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function seasonBounds(key: string): { startsAt: Date; endsAt: Date } {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return { startsAt: new Date(Date.UTC(y, m - 1, 1)), endsAt: new Date(Date.UTC(y, m, 1)) };
}
