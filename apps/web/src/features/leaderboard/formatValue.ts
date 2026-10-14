import type { LeaderboardType } from '@trader-sim/shared';
import type { Formatters } from '@/shared/hooks/useFormatters';

/** Each leaderboard type is shown in its natural unit. */
export function formatLeaderboardValue(
  type: LeaderboardType,
  value: number,
  fmt: Formatters,
): string {
  switch (type) {
    case 'equity':
      return fmt.currency(value);
    case 'roi':
      return fmt.percent(value, true);
    case 'bestTrade':
      return fmt.signedCurrency(value);
    case 'streak':
      return fmt.number(value, 0);
    case 'risk':
      return fmt.number(value, 2);
  }
}
