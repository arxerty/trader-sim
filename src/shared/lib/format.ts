/**
 * Locale-aware formatting via Intl. Formatters are cached because creating
 * Intl objects is expensive and prices are re-rendered every tick.
 */
const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `n|${locale}|${JSON.stringify(options)}`;
  let f = cache.get(key) as Intl.NumberFormat | undefined;
  if (!f) {
    f = new Intl.NumberFormat(locale, options);
    cache.set(key, f);
  }
  return f;
}

function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `d|${locale}|${JSON.stringify(options)}`;
  let f = cache.get(key) as Intl.DateTimeFormat | undefined;
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    cache.set(key, f);
  }
  return f;
}

const safe = (value: number): number => (Number.isFinite(value) ? value : 0);

export function formatCurrency(
  value: number,
  locale: string,
  currency = 'USD',
  maximumFractionDigits = 2,
): string {
  return numberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: Math.min(2, maximumFractionDigits),
    maximumFractionDigits,
  }).format(safe(value));
}

/** Currency with an explicit sign, for P&L values. */
export function formatSignedCurrency(value: number, locale: string, currency = 'USD'): string {
  return numberFormat(locale, {
    style: 'currency',
    currency,
    signDisplay: 'exceptZero',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe(value));
}

export function formatNumber(value: number, locale: string, decimals = 2): string {
  return numberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe(value));
}

/** Compact quantities, e.g. 0.0213 or 1,234.5 – significant digits matter more than fixed decimals. */
export function formatQuantity(value: number, locale: string): string {
  return numberFormat(locale, { maximumSignificantDigits: 6 }).format(safe(value));
}

/** `value` is a fraction: 0.125 -> "12.5%". */
export function formatPercent(value: number, locale: string, signed = false, decimals = 2): string {
  return numberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(safe(value));
}

export function formatTime(unixSeconds: number, locale: string): string {
  return dateFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(
    new Date(unixSeconds * 1000),
  );
}

export type ChartTickKind = 'year' | 'month' | 'day' | 'time' | 'seconds';

const TICK_OPTIONS: Record<ChartTickKind, Intl.DateTimeFormatOptions> = {
  year: { year: 'numeric' },
  month: { month: 'short' },
  day: { day: 'numeric', month: 'short' },
  time: { hour: '2-digit', minute: '2-digit' },
  seconds: { hour: '2-digit', minute: '2-digit', second: '2-digit' },
};

/** Axis labels for charts, in the user's time zone (same as news / history times). */
export function formatChartTick(unixSeconds: number, locale: string, kind: ChartTickKind): string {
  return dateFormat(locale, TICK_OPTIONS[kind]).format(new Date(unixSeconds * 1000));
}

export function formatDateTime(epochMs: number, locale: string): string {
  return dateFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(epochMs));
}
