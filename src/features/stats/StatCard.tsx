import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export function StatCard({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  tone?: 'up' | 'down' | 'muted' | null;
  className?: string;
}) {
  return (
    <div className={cn('rounded border border-border bg-surface-2/50 px-3 py-2', className)}>
      <dt className="truncate text-[11px] text-muted">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 font-mono text-sm font-semibold tabular-nums',
          tone === 'up' && 'text-up',
          tone === 'down' && 'text-down',
          tone === 'muted' && 'text-muted',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
