import type { AssetCategory, NewsSentiment } from '@/types';

export interface NewsTemplate {
  /** Translation key suffix: `news.templates.<id>`. */
  id: string;
  sentiment: NewsSentiment;
  categories: readonly AssetCategory[] | 'any';
  strength: readonly [number, number];
  duration: readonly [number, number];
  /** Integer placeholder used for plural forms (`{{count}}`). */
  count?: readonly [number, number];
  /** Percent placeholder (`{{percent}}`), value in percent units. */
  percent?: readonly [number, number];
}

const STOCKS: readonly AssetCategory[] = ['tech', 'auto', 'pharma'];
const COMMODITIES: readonly AssetCategory[] = ['energy', 'agri'];

export const NEWS_TEMPLATES: readonly NewsTemplate[] = [
  // positive
  {
    id: 'earningsBeat',
    sentiment: 'positive',
    categories: STOCKS,
    strength: [0.4, 0.9],
    duration: [15, 40],
    count: [2, 6],
  },
  {
    id: 'analystUpgrade',
    sentiment: 'positive',
    categories: 'any',
    strength: [0.2, 0.6],
    duration: [10, 25],
    count: [2, 11],
  },
  {
    id: 'productLaunch',
    sentiment: 'positive',
    categories: ['tech', 'auto'],
    strength: [0.3, 0.8],
    duration: [15, 35],
  },
  {
    id: 'drugApproval',
    sentiment: 'positive',
    categories: ['pharma'],
    strength: [0.6, 1],
    duration: [20, 45],
  },
  {
    id: 'supplyDisruption',
    sentiment: 'positive',
    categories: COMMODITIES,
    strength: [0.4, 0.9],
    duration: [15, 40],
  },
  {
    id: 'safeHaven',
    sentiment: 'positive',
    categories: ['metal', 'index'],
    strength: [0.3, 0.7],
    duration: [20, 40],
  },
  {
    id: 'adoption',
    sentiment: 'positive',
    categories: ['crypto'],
    strength: [0.5, 1],
    duration: [15, 35],
  },
  {
    id: 'rateCut',
    sentiment: 'positive',
    categories: ['index', 'crypto', 'tech'],
    strength: [0.3, 0.7],
    duration: [20, 50],
    percent: [0.25, 0.75],
  },
  // negative
  {
    id: 'earningsMiss',
    sentiment: 'negative',
    categories: STOCKS,
    strength: [0.4, 0.9],
    duration: [15, 40],
    percent: [3, 18],
  },
  {
    id: 'lawsuit',
    sentiment: 'negative',
    categories: STOCKS,
    strength: [0.3, 0.7],
    duration: [15, 35],
  },
  {
    id: 'recall',
    sentiment: 'negative',
    categories: ['auto'],
    strength: [0.4, 0.8],
    duration: [15, 35],
    count: [1200, 85000],
  },
  {
    id: 'exchangeHack',
    sentiment: 'negative',
    categories: ['crypto'],
    strength: [0.6, 1],
    duration: [15, 40],
  },
  {
    id: 'oversupply',
    sentiment: 'negative',
    categories: COMMODITIES,
    strength: [0.3, 0.8],
    duration: [20, 45],
  },
  {
    id: 'rateHike',
    sentiment: 'negative',
    categories: ['index', 'crypto', 'tech', 'metal'],
    strength: [0.3, 0.7],
    duration: [20, 50],
    percent: [0.25, 0.75],
  },
  {
    id: 'trialFailure',
    sentiment: 'negative',
    categories: ['pharma'],
    strength: [0.7, 1],
    duration: [20, 45],
  },
  {
    id: 'ceoExit',
    sentiment: 'negative',
    categories: ['tech', 'auto', 'pharma'],
    strength: [0.3, 0.6],
    duration: [10, 30],
  },
];

export function templatesFor(category: AssetCategory): NewsTemplate[] {
  return NEWS_TEMPLATES.filter((t) => t.categories === 'any' || t.categories.includes(category));
}
