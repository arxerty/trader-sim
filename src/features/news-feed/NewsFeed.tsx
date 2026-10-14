import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { NewsEvent } from '@/types';
import { getAsset } from '@/engine/market';
import { useMarketStore } from '@/store/marketStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { cn } from '@/shared/lib/cn';
import { impactLevel, newsHeadline } from './newsText';

const NewsItem = memo(function NewsItem({ news }: { news: NewsEvent }) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const selectAsset = useSettingsStore((s) => s.selectAsset);
  const positive = news.sentiment === 'positive';
  const active = news.remaining > 0;

  return (
    <li className="px-3 py-2.5">
      <article className="flex gap-2.5">
        <span
          aria-hidden="true"
          className={cn('mt-0.5 text-sm leading-none', positive ? 'text-up' : 'text-down')}
        >
          {positive ? '▲' : '▼'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug">{newsHeadline(t, fmt, news)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
            <time className="font-mono">{fmt.time(news.time)}</time>
            <button
              type="button"
              onClick={() => selectAsset(news.assetId)}
              className="rounded bg-surface-2 px-1.5 py-0.5 font-semibold text-text hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {getAsset(news.assetId)?.symbol ?? news.assetId}
            </button>
            <span className={cn('font-semibold', positive ? 'text-up' : 'text-down')}>
              {t(positive ? 'news.positive' : 'news.negative')}
            </span>
            <span className={cn(active && 'text-warning')}>
              {t('news.impact', { level: t(`news.impactLevels.${impactLevel(news.strength)}`) })}
            </span>
          </div>
        </div>
      </article>
    </li>
  );
});

export function NewsFeed() {
  const { t } = useTranslation();
  // newsLog keeps its reference between ticks unless a news item is published.
  const newsLog = useMarketStore((s) => s.newsLog);

  if (newsLog.length === 0) {
    return <p className="p-6 text-center text-sm text-muted">{t('news.empty')}</p>;
  }
  return (
    <ul className="divide-y divide-border/60" aria-live="polite" aria-relevant="additions">
      {newsLog.map((n) => (
        <NewsItem key={n.id} news={n} />
      ))}
    </ul>
  );
}
