import { memo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import {
  CandlestickSeries,
  CrosshairMode,
  LineStyle,
  TickMarkType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { formatChartTick, formatDateTime, type ChartTickKind } from '@/shared/lib/format';
import type { AssetId, Candle } from '@/types';
import { getAsset } from '@/engine/market';
import { liquidationPrice } from '@/engine/trading';
import { useMarketStore } from '@/store/marketStore';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useTheme } from '@/theme/useTheme';
import { chartOptionsFor, readChartPalette, seriesOptionsFor } from './chartTheme';

const VISIBLE_CANDLES = 90;

const TICK_KINDS: Record<TickMarkType, ChartTickKind> = {
  [TickMarkType.Year]: 'year',
  [TickMarkType.Month]: 'month',
  [TickMarkType.DayOfMonth]: 'day',
  [TickMarkType.Time]: 'time',
  [TickMarkType.TimeWithSeconds]: 'seconds',
};

const toBar = (c: Candle): CandlestickData<UTCTimestamp> => ({
  time: c.time as UTCTimestamp,
  open: c.open,
  high: c.high,
  low: c.low,
  close: c.close,
});

/**
 * Candlestick chart. Price updates bypass React entirely: the component
 * subscribes to the market store and pushes bars into the series, so ticks
 * never re-render it.
 */
export const CandleChart = memo(function CandleChart({ assetId }: { assetId: AssetId }) {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const decimals = getAsset(assetId)?.decimals ?? 2;

  // Create the chart once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const palette = readChartPalette();
    const chart = createChart(container, {
      autoSize: true,
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 4 },
      rightPriceScale: { scaleMargins: { top: 0.1, bottom: 0.1 } },
    });
    // applyOptions deep-merges; a spread here would wipe the nested options above.
    chart.applyOptions(chartOptionsFor(palette));
    const series = chart.addSeries(CandlestickSeries, seriesOptionsFor(palette));
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      linesRef.current = [];
    };
  }, []);

  // Load data for the selected asset and stream updates.
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    series.applyOptions({
      priceFormat: { type: 'price', precision: decimals, minMove: 10 ** -decimals },
    });

    const load = (candles: readonly Candle[]) => {
      series.setData(candles.map(toBar));
      const n = candles.length;
      chart
        .timeScale()
        .setVisibleLogicalRange({ from: Math.max(0, n - VISIBLE_CANDLES), to: n + 3 });
    };

    const initial = useMarketStore.getState();
    let lastCandles = initial.assets[assetId]?.candles ?? [];
    let lastStart = initial.startTime;
    load(lastCandles);

    return useMarketStore.subscribe((state) => {
      const candles = state.assets[assetId]?.candles;
      if (!candles || candles === lastCandles) return;
      const prevLast = lastCandles[lastCandles.length - 1];
      const nextLast = candles[candles.length - 1];
      if (
        state.startTime !== lastStart ||
        !prevLast ||
        !nextLast ||
        nextLast.time < prevLast.time
      ) {
        load(candles); // new session or inconsistent data
      } else {
        series.update(toBar(nextLast));
      }
      lastCandles = candles;
      lastStart = state.startTime;
    });
  }, [assetId, decimals]);

  // Re-colour on theme change (after ThemeProvider has updated <html data-theme>).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const palette = readChartPalette();
      chartRef.current?.applyOptions(chartOptionsFor(palette));
      seriesRef.current?.applyOptions(seriesOptionsFor(palette));
    });
    return () => cancelAnimationFrame(raf);
  }, [theme]);

  // Localised axis labels in the local time zone (the library default is UTC).
  useEffect(() => {
    const locale = i18n.resolvedLanguage ?? i18n.language;
    const seconds = (time: Time) => (typeof time === 'number' ? time : null);
    chartRef.current?.applyOptions({
      localization: {
        locale,
        timeFormatter: (time: Time) => {
          const s = seconds(time);
          return s === null ? '' : formatDateTime(s * 1000, locale);
        },
      },
      timeScale: {
        tickMarkFormatter: (time: Time, type: TickMarkType) => {
          const s = seconds(time);
          return s === null ? null : formatChartTick(s, locale, TICK_KINDS[type]);
        },
      },
    });
  }, [i18n.language, i18n.resolvedLanguage]);

  // Entry / SL / TP / liquidation / limit lines for the current asset.
  const positions = usePortfolioStore(
    useShallow((s) => s.account.positions.filter((p) => p.assetId === assetId)),
  );
  const orders = usePortfolioStore(
    useShallow((s) => s.account.orders.filter((o) => o.assetId === assetId)),
  );

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const series = seriesRef.current;
      if (!series) return;
      for (const line of linesRef.current) series.removePriceLine(line);
      const p = readChartPalette();
      const lines: IPriceLine[] = [];
      const add = (price: number, color: string, title: string, style = LineStyle.Dashed) =>
        lines.push(
          series.createPriceLine({
            price,
            color,
            title,
            lineWidth: 1,
            lineStyle: style,
            axisLabelVisible: true,
          }),
        );

      for (const pos of positions) {
        const sideLabel = t(`trade.${pos.side}`);
        add(
          pos.entryPrice,
          pos.side === 'long' ? p.up : p.down,
          `${sideLabel} x${pos.leverage}`,
          LineStyle.Solid,
        );
        add(
          liquidationPrice(pos.side, pos.entryPrice, pos.leverage),
          p.warning,
          t('trade.liquidationPrice'),
          LineStyle.Dotted,
        );
        if (pos.stopLoss !== undefined) add(pos.stopLoss, p.down, t('trade.stopLoss'));
        if (pos.takeProfit !== undefined) add(pos.takeProfit, p.up, t('trade.takeProfit'));
      }
      for (const order of orders) {
        add(
          order.limitPrice,
          p.accent,
          `${t('trade.limit')} ${t(`trade.${order.side}`)}`,
          LineStyle.LargeDashed,
        );
      }
      linesRef.current = lines;
    });
    return () => cancelAnimationFrame(raf);
  }, [positions, orders, theme, t]);

  // The canvas is absolutely positioned so its intrinsic size never stretches the grid cell.
  return (
    <div className="relative h-full min-h-[260px] w-full overflow-hidden">
      <div
        ref={containerRef}
        role="img"
        aria-label={t('common.chartLabel', { asset: t(`assets.${assetId}.name`) })}
        className="absolute inset-0"
      />
    </div>
  );
});
