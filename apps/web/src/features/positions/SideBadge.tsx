import { useTranslation } from 'react-i18next';
import type { Side } from '@/types';
import { cn } from '@/shared/lib/cn';

export function SideBadge({ side }: { side: Side }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
        side === 'long' ? 'bg-up/15 text-up' : 'bg-down/15 text-down',
      )}
    >
      {t(`trade.${side}`)}
    </span>
  );
}
