import { StrictMode, type ReactNode } from 'react';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ErrorBoundary } from './ErrorBoundary';

/** Global providers. i18n is initialised in main.tsx before the first render. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <ErrorBoundary>
        <ThemeProvider>{children}</ThemeProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}
