import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ACHIEVEMENTS, type AchievementDefinition } from '@/engine/achievements';
import { useProgressStore } from '@/store/progressStore';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { cn } from '@/shared/lib/cn';
import { achievementDescriptionParams } from './achievementText';

const AchievementCard = memo(function AchievementCard({
  def,
  unlockedAt,
}: {
  def: AchievementDefinition;
  unlockedAt: number | undefined;
}) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const unlocked = unlockedAt !== undefined;
  return (
    <li
      className={cn(
        'flex gap-3 rounded border p-3 transition-colors',
        unlocked ? 'border-accent/40 bg-accent/5' : 'border-border bg-surface-2/40 opacity-70',
      )}
    >
      <span aria-hidden="true" className={cn('text-2xl leading-none', !unlocked && 'grayscale')}>
        {def.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-sm font-semibold">
            {t(`achievements.items.${def.id}.title`)}
          </h3>
          <span className="shrink-0 font-mono text-[11px] text-accent">
            {t('achievements.xpReward', { xp: def.xp })}
          </span>
        </div>
        <p className="text-xs text-muted">
          {t(
            `achievements.items.${def.id}.description`,
            achievementDescriptionParams(def, (v) => fmt.currency(v, 0)),
          )}
        </p>
        <p className="mt-1 text-[11px] text-muted">
          {unlocked
            ? t('achievements.unlockedAt', { date: fmt.dateTime(unlockedAt) })
            : t('achievements.locked')}
        </p>
      </div>
    </li>
  );
});

export function AchievementsPanel() {
  const { t } = useTranslation();
  const unlocked = useProgressStore((s) => s.unlocked);
  const count = Object.keys(unlocked).length;
  return (
    <div className="p-3">
      <p className="mb-3 text-xs text-muted">
        {t('achievements.progress', { unlocked: count, total: ACHIEVEMENTS.length })}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {ACHIEVEMENTS.map((def) => (
          <AchievementCard key={def.id} def={def} unlockedAt={unlocked[def.id]} />
        ))}
      </ul>
    </div>
  );
}
