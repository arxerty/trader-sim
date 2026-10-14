import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '@/i18n';

interface State {
  error: Error | null;
}

/** Last-resort UI for render errors (hooks are unavailable here, so i18n is used directly). */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg p-6 text-center text-text"
      >
        <h1 className="text-xl font-bold">{i18n.t('errors.boundaryTitle')}</h1>
        <p className="max-w-md text-sm text-muted">{i18n.t('errors.boundaryBody')}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-contrast"
        >
          {i18n.t('errors.reload')}
        </button>
      </div>
    );
  }
}
