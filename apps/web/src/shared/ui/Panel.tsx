import { useId, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface PanelProps {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** Card-like section with an optional heading – the basic layout block of the terminal. */
export function Panel({ title, actions, children, className, bodyClassName }: PanelProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className={cn('flex min-h-0 flex-col rounded border border-border bg-surface', className)}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          {title && (
            <h2 id={headingId} className="text-xs font-semibold uppercase tracking-wide text-muted">
              {title}
            </h2>
          )}
          {actions}
        </header>
      )}
      <div className={cn('min-h-0 flex-1', bodyClassName)}>{children}</div>
    </section>
  );
}
