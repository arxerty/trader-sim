import { useTranslation } from 'react-i18next';
import { STARTING_BALANCE } from '@trader-sim/engine';
import { useAccountSummary } from '@/store/selectors';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { cn } from '@/shared/lib/cn';
import { safeDiv } from '@trader-sim/engine';

/** Compact equity / P&L / free margin strip for the header. */
export function AccountSummaryBar({ className }: { className?: string }) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const s = useAccountSummary();
  const totalReturn = safeDiv(s.equity - STARTING_BALANCE, STARTING_BALANCE);

  return (
    <dl className={cn('flex items-center gap-4 text-xs', className)}>
      <div>
        <dt className="text-muted">{t('stats.equity')}</dt>
        <dd className="font-mono text-sm font-semibold tabular-nums">
          {fmt.currency(s.equity)}{' '}
          <span
            className={cn('text-[11px] font-normal', totalReturn >= 0 ? 'text-up' : 'text-down')}
          >
            {fmt.percent(totalReturn, true)}
          </span>
        </dd>
      </div>
      <div className="hidden sm:block">
        <dt className="text-muted">{t('stats.unrealizedPnl')}</dt>
        <dd
          className={cn(
            'font-mono text-sm font-semibold tabular-nums',
            s.unrealizedPnl > 0 && 'text-up',
            s.unrealizedPnl < 0 && 'text-down',
          )}
        >
          {fmt.signedCurrency(s.unrealizedPnl)}
        </dd>
      </div>
      <div className="hidden md:block">
        <dt className="text-muted">{t('stats.freeMargin')}</dt>
        <dd className="font-mono text-sm font-semibold tabular-nums">
          {fmt.currency(s.freeMargin)}
        </dd>
      </div>
    </dl>
  );
}
