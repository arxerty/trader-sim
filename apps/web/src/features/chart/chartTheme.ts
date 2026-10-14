import {
  ColorType,
  type DeepPartial,
  type ChartOptions,
  type CandlestickSeriesPartialOptions,
} from 'lightweight-charts';
import { readCssColor } from '@/theme/themes';

export interface ChartPalette {
  background: string;
  text: string;
  grid: string;
  border: string;
  up: string;
  down: string;
  accent: string;
  warning: string;
  fontFamily: string;
}

/** Reads the current theme tokens from CSS variables. */
export function readChartPalette(): ChartPalette {
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim();
  return {
    background: readCssColor('--color-surface'),
    text: readCssColor('--color-muted'),
    grid: readCssColor('--chart-grid'),
    border: readCssColor('--color-border'),
    up: readCssColor('--color-up'),
    down: readCssColor('--color-down'),
    accent: readCssColor('--color-accent'),
    warning: readCssColor('--color-warning'),
    fontFamily: font || 'sans-serif',
  };
}

export function chartOptionsFor(p: ChartPalette): DeepPartial<ChartOptions> {
  return {
    layout: {
      background: { type: ColorType.Solid, color: p.background },
      textColor: p.text,
      fontFamily: p.fontFamily,
    },
    grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
    rightPriceScale: { borderColor: p.border },
    timeScale: { borderColor: p.border },
    crosshair: {
      vertLine: { labelBackgroundColor: p.accent },
      horzLine: { labelBackgroundColor: p.accent },
    },
  };
}

export function seriesOptionsFor(p: ChartPalette): CandlestickSeriesPartialOptions {
  return {
    upColor: p.up,
    downColor: p.down,
    borderUpColor: p.up,
    borderDownColor: p.down,
    wickUpColor: p.up,
    wickDownColor: p.down,
  };
}
