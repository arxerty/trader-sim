import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiError } from './client';

/** Translates API errors by their machine code (never by the server's English message). */
export function useApiErrorMessage(): (error: unknown) => string {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown) => {
      const code = isApiError(error) ? error.code : 'UNKNOWN';
      return t(`apiErrors.${code}`, { defaultValue: t('apiErrors.UNKNOWN') });
    },
    [t],
  );
}
