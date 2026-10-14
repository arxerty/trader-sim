import type { Candle } from '@/types';

export const TICKS_PER_CANDLE = 5;
export const CANDLE_SECONDS = 60;
export const SECONDS_PER_TICK = CANDLE_SECONDS / TICKS_PER_CANDLE;
export const MAX_CANDLES = 400;

/** Virtual time (seconds) of the candle a tick belongs to. */
export function candleTimeForTick(startTime: number, tick: number): number {
  return startTime + Math.floor(tick / TICKS_PER_CANDLE) * CANDLE_SECONDS;
}

export function tickTime(startTime: number, tick: number): number {
  return startTime + tick * SECONDS_PER_TICK;
}

/**
 * Feeds a price into the candle series. Updates the last candle when it
 * belongs to the same time bucket, otherwise opens a new candle at the
 * previous close (no gaps). Returns a new array; input is not mutated.
 */
export function applyPriceToCandles(
  candles: readonly Candle[],
  price: number,
  time: number,
  maxCandles = MAX_CANDLES,
): Candle[] {
  const last = candles[candles.length - 1];
  if (last && last.time === time) {
    const updated: Candle = {
      time,
      open: last.open,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price,
    };
    const next = candles.slice(0, -1);
    next.push(updated);
    return next;
  }
  if (last && time < last.time) {
    // Out-of-order data is ignored – charts require strictly increasing time.
    return candles.slice();
  }
  const open = last ? last.close : price;
  const next = candles.slice(Math.max(0, candles.length - maxCandles + 1));
  next.push({
    time,
    open,
    high: Math.max(open, price),
    low: Math.min(open, price),
    close: price,
  });
  return next;
}
