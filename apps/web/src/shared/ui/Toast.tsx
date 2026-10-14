import { memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';
import { useToastStore, type ToastItem, type ToastVariant } from './toastStore';

const ACCENTS: Record<ToastVariant, string> = {
  info: 'border-l-accent',
  success: 'border-l-up',
  up: 'border-l-up',
  error: 'border-l-down',
  down: 'border-l-down',
  warning: 'border-l-warning',
};

const ToastView = memo(function ToastView({ item }: { item: ToastItem }) {
  const { t } = useTranslation();
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (item.duration <= 0) return;
    const timer = window.setTimeout(() => dismiss(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [item.id, item.duration, dismiss]);

  return (
    <li
      role={item.variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex w-full animate-toast-in items-start gap-3 rounded border border-l-4 border-border bg-surface px-3 py-2.5 shadow-lg',
        ACCENTS[item.variant],
      )}
    >
      {item.icon && (
        <span aria-hidden="true" className="mt-0.5 text-lg leading-none">
          {item.icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">{item.title}</p>
        {item.description && <p className="mt-0.5 text-xs text-muted">{item.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label={t('common.dismiss')}
        className="rounded p-0.5 text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </li>
  );
});

/** Renders the toast stack; mount once near the app root. */
export function Toaster() {
  const { t } = useTranslation();
  const toasts = useToastStore((s) => s.toasts);
  return (
    <section
      aria-label={t('common.notifications')}
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 top-3 z-[60] sm:inset-x-auto sm:bottom-12 sm:right-4 sm:top-auto sm:w-80"
    >
      <ol className="flex flex-col gap-2">
        {toasts.map((item) => (
          <ToastView key={item.id} item={item} />
        ))}
      </ol>
    </section>
  );
}
