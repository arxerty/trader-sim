import type { AchievementDefinition } from '@trader-sim/engine';

/** Description params: `count` drives plural forms, `amount`/`value` are plain placeholders. */
export function achievementDescriptionParams(
  def: AchievementDefinition,
  currency: (value: number) => string,
): Record<string, string | number> {
  return def.goal === undefined
    ? {}
    : { count: def.goal, value: def.goal, amount: currency(def.goal) };
}
