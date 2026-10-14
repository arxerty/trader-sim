import type { TFunction } from 'i18next';
import type { NewsEvent } from '@/types';
import type { Formatters } from '@/shared/hooks/useFormatters';

export type ImpactLevel = 'low' | 'medium' | 'high';

export function impactLevel(strength: number): ImpactLevel {
  if (strength < 0.45) return 'low';
  if (strength < 0.75) return 'medium';
  return 'high';
}

/** Localised headline: template + asset name + plural count + Intl-formatted percent. */
export function newsHeadline(
  t: TFunction,
  fmt: Pick<Formatters, 'percent'>,
  news: NewsEvent,
): string {
  const options: Record<string, string | number> = { asset: t(`assets.${news.assetId}.name`) };
  if (news.params.count !== undefined) options.count = news.params.count;
  if (news.params.percent !== undefined)
    options.percent = fmt.percent(news.params.percent / 100, false, 2);
  return t(`news.templates.${news.templateId}`, options);
}
