export const EPSILON = 1e-9;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Division that never returns NaN/Infinity. */
export function safeDiv(numerator: number, denominator: number, fallback = 0): number {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    Math.abs(denominator) < EPSILON
  ) {
    return fallback;
  }
  return numerator / denominator;
}

/** Rounds to a number of decimals, avoiding binary float noise in money values. */
export function roundTo(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Parses user input like "1 234,5" or "1234.5". Returns null when not a number. */
export function parseDecimal(input: string): number | null {
  const normalized = input.replace(/\s/g, '').replace(',', '.');
  if (normalized === '') return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
