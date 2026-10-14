import { useTranslation } from 'react-i18next';
import { LEVELS } from '@/engine/achievements';
import { useLevel } from '@/store/selectors';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { cn } from '@/shared/lib/cn';

export function LevelProgress({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const level = useLevel();
  const nextLevel = LEVELS[level.index + 1];
  const label = t(`stats.levels.${level.level}`);
  const percent = Math.round(level.progress * 100);

  if (compact) {
    return (
      <div
        className="flex items-center gap-2"
        title={t('stats.xp', { xp: fmt.number(level.xp, 0) })}
      >
        <span className="text-xs font-semibold text-accent">{label}</span>
        <div
          role="progressbar"
          aria-label={t('stats.level')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={label}
          className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2"
        >
          <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-border bg-surface-2/50 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted">{t('stats.level')}</span>
        <span className="font-mono text-xs text-muted">
          {t('stats.xp', { xp: fmt.number(level.xp, 0) })}
        </span>
      </div>
      <p className="mt-1 text-lg font-bold text-accent">{label}</p>
      <div
        role="progressbar"
        aria-label={t('stats.level')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={label}
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={cn('h-full bg-accent transition-[width] duration-500')}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-muted">
        {nextLevel && level.nextLevelXp !== null
          ? t('stats.nextLevel', {
              xp: fmt.number(level.nextLevelXp - level.xp, 0),
              level: t(`stats.levels.${nextLevel.level}`),
            })
          : t('stats.maxLevel')}
      </p>
    </div>
  );
}
