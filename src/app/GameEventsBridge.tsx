import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getAsset } from '@/engine/market';
import { getAchievement } from '@/engine/achievements';
import { gameEvents, type GameEvent } from '@/store/game';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useSettingsStore } from '@/store/settingsStore';
import { consumeCorruptedSaves } from '@/store/persistence/safeStorage';
import { sound } from '@/shared/audio/sound';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { toast } from '@/shared/ui';
import { newsHeadline } from '@/features/news-feed';
import { achievementDescriptionParams } from '@/features/achievements';

/** Translates game events into toasts and sounds. Renders nothing. */
export function GameEventsBridge() {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const volume = useSettingsStore((s) => s.volume);

  useEffect(() => {
    sound.configure(soundEnabled, volume);
  }, [soundEnabled, volume]);

  useEffect(() => {
    if (consumeCorruptedSaves().length > 0) {
      toast.show({
        title: t('errors.corruptedSave'),
        variant: 'warning',
        icon: '⚠️',
        duration: 8000,
      });
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const assetName = (id: string) => t(`assets.${id}.name`);
    const price = (id: string, value: number) => fmt.currency(value, getAsset(id)?.decimals ?? 2);

    const handle = (event: GameEvent) => {
      switch (event.type) {
        case 'positionOpened':
        case 'orderFilled': {
          const p = event.position;
          sound.play(p.side === 'long' ? 'buy' : 'sell');
          toast.show({
            title:
              event.type === 'orderFilled'
                ? t('toasts.orderFilled')
                : t('toasts.positionOpened', {
                    side: t(`trade.${p.side}`),
                    asset: getAsset(p.assetId)?.symbol,
                  }),
            description:
              event.type === 'orderFilled'
                ? t('toasts.orderBody', {
                    side: t(`trade.${p.side}`),
                    asset: assetName(p.assetId),
                    price: price(p.assetId, p.entryPrice),
                  })
                : t('toasts.positionOpenedBody', {
                    margin: fmt.currency(p.margin),
                    leverage: p.leverage,
                    price: price(p.assetId, p.entryPrice),
                  }),
            variant: p.side === 'long' ? 'up' : 'down',
            duration: 2500,
          });
          break;
        }
        case 'orderPlaced':
          sound.play('click');
          toast.show({
            title: t('toasts.orderPlaced'),
            description: t('toasts.orderBody', {
              side: t(`trade.${event.order.side}`),
              asset: assetName(event.order.assetId),
              price: price(event.order.assetId, event.order.limitPrice),
            }),
            duration: 2500,
          });
          break;
        case 'orderCancelled':
          sound.play('click');
          toast.show({ title: t('toasts.orderCancelled'), duration: 2000 });
          break;
        case 'positionClosed': {
          const tr = event.trade;
          const symbol = getAsset(tr.assetId)?.symbol ?? tr.assetId;
          if (tr.reason === 'liquidation') {
            sound.play('liquidation');
            toast.show({
              title: t('toasts.liquidation', { asset: symbol }),
              description: t('toasts.liquidationBody', { amount: fmt.currency(tr.margin) }),
              variant: 'error',
              icon: '💥',
              duration: 6000,
            });
            break;
          }
          sound.play(tr.pnl >= 0 ? 'profit' : 'loss');
          const titleKey =
            tr.reason === 'stopLoss'
              ? 'toasts.stopLoss'
              : tr.reason === 'takeProfit'
                ? 'toasts.takeProfit'
                : 'toasts.positionClosed';
          toast.show({
            title: t(titleKey, { asset: symbol }),
            description: t('toasts.pnlBody', { pnl: fmt.signedCurrency(tr.pnl) }),
            variant: tr.pnl >= 0 ? 'up' : 'down',
            duration: 3500,
          });
          break;
        }
        case 'news': {
          // Only interrupt the player for news about assets they hold or are watching.
          const { selectedAssetId } = useSettingsStore.getState();
          const held = usePortfolioStore
            .getState()
            .account.positions.some((p) => p.assetId === event.news.assetId);
          if (!held && selectedAssetId !== event.news.assetId) break;
          sound.play('news');
          toast.show({
            title: t('toasts.news', { asset: getAsset(event.news.assetId)?.symbol }),
            description: newsHeadline(t, fmt, event.news),
            variant: event.news.sentiment === 'positive' ? 'up' : 'down',
            icon: '📰',
            duration: 5000,
          });
          break;
        }
        case 'achievement': {
          const def = getAchievement(event.id);
          if (!def) break;
          sound.play('achievement');
          toast.show({
            title: t('toasts.achievement'),
            description: `${t(`achievements.items.${def.id}.title`)}: ${t(
              `achievements.items.${def.id}.description`,
              achievementDescriptionParams(def, (v) => fmt.currency(v, 0)),
            )}`,
            variant: 'success',
            icon: def.icon,
            duration: 5000,
          });
          break;
        }
        case 'levelUp':
          sound.play('achievement');
          toast.show({
            title: t('toasts.levelUp', { level: t(`stats.levels.${event.level}`) }),
            variant: 'success',
            icon: '⭐',
            duration: 6000,
          });
          break;
        case 'bankrupt':
          sound.play('liquidation');
          toast.show({ title: t('toasts.bankrupt'), variant: 'error', icon: '☠️', duration: 6000 });
          break;
      }
    };
    return gameEvents.subscribe(handle);
  }, [t, fmt]);

  return null;
}
