import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatQuantity,
  formatSignedCurrency,
  formatTime,
} from '@/shared/lib/format';

/** Intl formatters bound to the active UI language. */
export function useFormatters() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  return useMemo(
    () => ({
      locale,
      currency: (v: number, maxDigits = 2) => formatCurrency(v, locale, 'USD', maxDigits),
      signedCurrency: (v: number) => formatSignedCurrency(v, locale),
      number: (v: number, decimals = 2) => formatNumber(v, locale, decimals),
      quantity: (v: number) => formatQuantity(v, locale),
      percent: (fraction: number, signed = false, decimals = 2) =>
        formatPercent(fraction, locale, signed, decimals),
      time: (unixSeconds: number) => formatTime(unixSeconds, locale),
      dateTime: (epochMs: number) => formatDateTime(epochMs, locale),
    }),
    [locale],
  );
}

export type Formatters = ReturnType<typeof useFormatters>;
