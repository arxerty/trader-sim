/** Small structural validators for data coming from localStorage (never trust saves). */
export type UnknownRecord = Record<string, unknown>;

export const isRecord = (v: unknown): v is UnknownRecord =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export const isString = (v: unknown): v is string => typeof v === 'string';

export function optionalNumber(v: unknown): number | undefined {
  return isFiniteNumber(v) && v > 0 ? v : undefined;
}

/** Keeps only array items accepted by `parse`. Non-arrays become []. */
export function parseArray<T>(value: unknown, parse: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value) {
    const parsed = parse(item);
    if (parsed !== null) out.push(parsed);
  }
  return out;
}
