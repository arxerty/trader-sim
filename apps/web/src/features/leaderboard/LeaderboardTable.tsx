import { useTranslation } from 'react-i18next';
import { useProgressStore } from '@/store/progressStore';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { cn } from '@/shared/lib/cn';
import { tableClass, tdClass, thClass } from '@/features/positions';

const MEDALS = ['🥇', '🥈', '🥉'];

export function LeaderboardTable() {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const entries = useProgressStore((s) => s.leaderboard);

  if (entries.length === 0) {
    return <p className="p-6 text-center text-sm text-muted">{t('leaderboard.empty')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className={tableClass}>
        <thead>
          <tr>
            <th scope="col" className={cn(thClass, '!text-left')}>
              {t('leaderboard.rank')}
            </th>
            <th scope="col" className={cn(thClass, '!text-left')}>
              {t('leaderboard.date')}
            </th>
            <th scope="col" className={thClass}>
              {t('leaderboard.finalEquity')}
            </th>
            <th scope="col" className={thClass}>
              {t('leaderboard.return')}
            </th>
            <th scope="col" className={thClass}>
              {t('leaderboard.trades')}
            </th>
            <th scope="col" className={thClass}>
              {t('leaderboard.winRate')}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={e.id} className="border-t border-border/60 hover:bg-surface-2/50">
              <th scope="row" className={cn(tdClass, '!text-left')}>
                <span aria-hidden="true">{MEDALS[i] ?? ''} </span>
                {i + 1}
              </th>
              <td className={cn(tdClass, '!text-left text-muted')}>{fmt.dateTime(e.date)}</td>
              <td className={cn(tdClass, 'font-mono font-semibold')}>
                {fmt.currency(e.finalEquity)}
                {e.bankrupt && (
                  <span className="ml-1.5 rounded bg-down/15 px-1 text-[10px] font-normal text-down">
                    {t('leaderboard.bankrupt')}
                  </span>
                )}
              </td>
              <td className={cn(tdClass, 'font-mono', e.returnPct >= 0 ? 'text-up' : 'text-down')}>
                {fmt.percent(e.returnPct, true)}
              </td>
              <td className={tdClass}>{fmt.number(e.trades, 0)}</td>
              <td className={tdClass}>{fmt.percent(e.winRate, false, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
