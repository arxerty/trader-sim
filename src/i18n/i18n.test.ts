import { describe, expect, it } from 'vitest';
import { ASSETS } from '@/engine/market';
import { NEWS_TEMPLATES } from '@/engine/news';
import { ACHIEVEMENTS, LEVELS } from '@/engine/achievements';
import { resolveLanguage, resources, SUPPORTED_LANGUAGES } from './index';

type Tree = { [key: string]: string | Tree };

/** True when `path` (or its plural `_other` form) exists in the tree. */
function has(tree: Tree, path: string): boolean {
  const parts = path.split('.');
  const last = parts.pop()!;
  let node: Tree | string | undefined = tree;
  for (const p of parts) node = typeof node === 'object' ? node[p] : undefined;
  return (
    typeof node === 'object' &&
    (typeof node[last] === 'string' || typeof node[`${last}_other`] === 'string')
  );
}

describe('locales', () => {
  // Key parity between locales is enforced by `npm run i18n:check`;
  // here we make sure every engine id referenced dynamically has a translation.
  it.each(SUPPORTED_LANGUAGES)('%s covers all dynamic keys', (lng) => {
    const tree = resources[lng].translation as unknown as Tree;
    const keys = [
      ...ASSETS.map((a) => `assets.${a.id}.name`),
      ...ASSETS.map((a) => `categories.${a.category}`),
      ...NEWS_TEMPLATES.map((t) => `news.templates.${t.id}`),
      ...ACHIEVEMENTS.flatMap((a) => [
        `achievements.items.${a.id}.title`,
        `achievements.items.${a.id}.description`,
      ]),
      ...LEVELS.map((l) => `stats.levels.${l.level}`),
      ...SUPPORTED_LANGUAGES.map((l) => `settings.languages.${l}`),
    ];
    const missing = keys.filter((k) => !has(tree, k));
    expect(missing).toEqual([]);
  });

  it('resolves browser languages with fallback', () => {
    expect(resolveLanguage('ru-RU')).toBe('ru');
    expect(resolveLanguage('zh-CN')).toBe('zh');
    expect(resolveLanguage('fr')).toBe('en');
    expect(resolveLanguage(undefined)).toBe('en');
  });
});
