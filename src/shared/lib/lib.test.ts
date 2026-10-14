import { describe, expect, it } from 'vitest';
import { formatCurrency, formatPercent, formatSignedCurrency } from './format';
import { clamp, parseDecimal, roundTo, safeDiv } from './math';
import { EventBus } from './eventBus';

describe('format', () => {
  it('formats currency per locale', () => {
    expect(formatCurrency(1234.5, 'en')).toBe('$1,234.50');
    expect(formatCurrency(1234.5, 'de')).toMatch(/^1\.234,50\s\$$/);
    expect(formatCurrency(Number.NaN, 'en')).toBe('$0.00');
  });

  it('formats signed values and percentages', () => {
    expect(formatSignedCurrency(12.3, 'en')).toBe('+$12.30');
    expect(formatSignedCurrency(-12.3, 'en')).toBe('-$12.30');
    expect(formatPercent(0.1234, 'en', true)).toBe('+12.34%');
    expect(formatPercent(0.5, 'ru', false, 0)).toMatch(/^50\s%$/);
  });
});

describe('math', () => {
  it('safeDiv never returns NaN or Infinity', () => {
    expect(safeDiv(1, 0)).toBe(0);
    expect(safeDiv(1, 0, -1)).toBe(-1);
    expect(safeDiv(Number.NaN, 2)).toBe(0);
    expect(safeDiv(6, 3)).toBe(2);
  });

  it('parses user decimals with comma or dot', () => {
    expect(parseDecimal('1 234,5')).toBe(1234.5);
    expect(parseDecimal('12.5')).toBe(12.5);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
  });

  it('clamps and rounds', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(roundTo(1.005, 2)).toBe(1.01);
  });
});

describe('EventBus', () => {
  it('isolates failing listeners and supports unsubscribe', () => {
    const bus = new EventBus<number>();
    const received: number[] = [];
    const errors = console.error;
    console.error = () => undefined;
    bus.subscribe(() => {
      throw new Error('boom');
    });
    const off = bus.subscribe((n) => received.push(n));
    bus.emit(1);
    off();
    bus.emit(2);
    console.error = errors;
    expect(received).toEqual([1]);
  });
});
