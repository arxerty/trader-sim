import { describe, expect, it } from 'vitest';
import type { Account, Leverage, OrderRequest } from '../types';
import { accountWith, CLOCK, makePosition, PRICES } from '../test/fixtures';
import { summarizeAccount } from './calc';
import {
  cancelOrder,
  closePosition,
  createAccount,
  isBankrupt,
  placeOrder,
  processTick,
  validateOrder,
} from './orders';

const long = (overrides: Partial<OrderRequest> = {}): OrderRequest => ({
  assetId: 'NOVA',
  side: 'long',
  type: 'market',
  margin: 1000,
  leverage: 5,
  ...overrides,
});

function open(account: Account, request: OrderRequest, prices: Record<string, number> = PRICES) {
  const result = placeOrder(account, request, prices, CLOCK);
  if (!result.ok) throw new Error(`expected success, got ${result.error}`);
  return result.value;
}

describe('validateOrder', () => {
  const account = createAccount();

  it.each([
    ['unknownAsset', long({ assetId: 'NOPE' })],
    ['invalidAmount', long({ margin: Number.NaN })],
    ['invalidAmount', long({ margin: 0 })],
    ['invalidAmount', long({ margin: -5 })],
    ['amountTooSmall', long({ margin: 5 })],
    ['invalidLeverage', long({ leverage: 3 as unknown as Leverage })],
    ['insufficientFunds', long({ margin: 10_000, leverage: 1 })],
    ['invalidLimitPrice', long({ type: 'limit', limitPrice: -1 })],
    ['invalidStopLoss', long({ stopLoss: 105 })],
    ['invalidTakeProfit', long({ takeProfit: 95 })],
    ['invalidStopLoss', long({ side: 'short', stopLoss: 95 })],
    ['invalidTakeProfit', long({ side: 'short', takeProfit: 105 })],
  ])('rejects with %s', (code, request) => {
    expect(validateOrder(account, request, PRICES)).toBe(code);
  });

  it('validates SL/TP against the limit price for limit orders', () => {
    expect(
      validateOrder(account, long({ type: 'limit', limitPrice: 90, stopLoss: 92 }), PRICES),
    ).toBe('invalidStopLoss');
    expect(
      validateOrder(
        account,
        long({ type: 'limit', limitPrice: 90, stopLoss: 85, takeProfit: 95 }),
        PRICES,
      ),
    ).toBeNull();
  });

  it('accepts a valid order', () => {
    expect(validateOrder(account, long({ stopLoss: 90, takeProfit: 120 }), PRICES)).toBeNull();
  });
});

describe('placeOrder (market)', () => {
  it('opens a position and charges the 0.1% fee', () => {
    const out = open(createAccount(), long());
    expect(out.kind).toBe('position');
    if (out.kind !== 'position') return;
    expect(out.position.quantity).toBe(50);
    expect(out.position.openFee).toBeCloseTo(5);
    expect(out.account.balance).toBeCloseTo(9995);
    expect(out.account.positions).toHaveLength(1);
  });

  it('generates unique ids', () => {
    const a = open(createAccount(), long());
    const b = open(a.account, long());
    expect(a.account.positions[0]?.id).not.toBe(b.account.positions[1]?.id);
  });

  it('does not mutate the input account', () => {
    const account = createAccount();
    const snapshot = JSON.stringify(account);
    open(account, long());
    expect(JSON.stringify(account)).toBe(snapshot);
  });
});

describe('closePosition', () => {
  it('realizes P&L net of open and close fees', () => {
    const opened = open(createAccount(), long());
    const id = opened.account.positions[0]!.id;
    const result = closePosition(opened.account, id, 110, CLOCK);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { account, trade } = result.value;
    // gross +500, close fee 50 * 110 * 0.001 = 5.5, open fee 5
    expect(account.balance).toBeCloseTo(10_489.5);
    expect(trade.pnl).toBeCloseTo(489.5);
    expect(trade.fees).toBeCloseTo(10.5);
    expect(trade.reason).toBe('manual');
    expect(account.positions).toHaveLength(0);
  });

  it('returns an error for a non-existent position and leaves the account untouched', () => {
    const account = createAccount();
    const result = closePosition(account, 'missing', 100, CLOCK);
    expect(result).toEqual({ ok: false, error: 'positionNotFound' });
  });

  it('closing twice fails the second time', () => {
    const opened = open(createAccount(), long());
    const id = opened.account.positions[0]!.id;
    const first = closePosition(opened.account, id, 100, CLOCK);
    if (!first.ok) throw new Error('first close failed');
    expect(closePosition(first.value.account, id, 100, CLOCK)).toEqual({
      ok: false,
      error: 'positionNotFound',
    });
  });

  it('rejects an invalid price', () => {
    const account = accountWith([makePosition()]);
    expect(closePosition(account, 'p-1', Number.NaN, CLOCK).ok).toBe(false);
  });
});

describe('processTick', () => {
  it('triggers stop-loss', () => {
    const account = accountWith([makePosition({ stopLoss: 95 })]);
    const { account: next, events } = processTick(account, { NOVA: 94 }, CLOCK);
    expect(next.positions).toHaveLength(0);
    expect(events[0]).toMatchObject({ type: 'positionClosed', trade: { reason: 'stopLoss' } });
  });

  it('triggers take-profit', () => {
    const account = accountWith([makePosition({ side: 'short', takeProfit: 90 })]);
    const { events } = processTick(account, { NOVA: 89 }, CLOCK);
    expect(events[0]).toMatchObject({ type: 'positionClosed', trade: { reason: 'takeProfit' } });
  });

  it('liquidates and caps the loss at the margin', () => {
    const position = makePosition({ leverage: 10, margin: 1000, quantity: 100, openFee: 10 });
    const { account, events } = processTick(accountWith([position], 9990), { NOVA: 50 }, CLOCK);
    expect(events[0]).toMatchObject({ type: 'positionClosed', trade: { reason: 'liquidation' } });
    expect(account.balance).toBeCloseTo(8990);
    if (events[0]?.type === 'positionClosed') expect(events[0].trade.pnl).toBeCloseTo(-1010);
  });

  it('liquidation takes priority over stop-loss on a gap', () => {
    const position = makePosition({ leverage: 10, quantity: 100, stopLoss: 95 });
    const { events } = processTick(accountWith([position]), { NOVA: 80 }, CLOCK);
    expect(events[0]).toMatchObject({ trade: { reason: 'liquidation' } });
  });

  it('never lets the balance go negative', () => {
    const position = makePosition({ leverage: 10, margin: 1000, quantity: 100 });
    const { account } = processTick(accountWith([position], 100), { NOVA: 1 }, CLOCK);
    expect(account.balance).toBe(0);
  });

  it('leaves positions alone when nothing triggers', () => {
    const account = accountWith([makePosition({ stopLoss: 90, takeProfit: 120 })]);
    const result = processTick(account, { NOVA: 101 }, CLOCK);
    expect(result.events).toHaveLength(0);
    expect(result.account).toBe(account);
  });
});

describe('limit orders', () => {
  it('reserves margin, fills when the price is reached and charges the fee then', () => {
    const placed = open(createAccount(), long({ type: 'limit', limitPrice: 95 }));
    expect(placed.kind).toBe('order');
    expect(placed.account.balance).toBe(10_000);
    expect(summarizeAccount(placed.account, PRICES).usedMargin).toBeCloseTo(1005);

    const notYet = processTick(placed.account, { NOVA: 96 }, CLOCK);
    expect(notYet.account.orders).toHaveLength(1);

    const filled = processTick(placed.account, { NOVA: 95 }, CLOCK);
    expect(filled.account.orders).toHaveLength(0);
    expect(filled.account.positions[0]?.entryPrice).toBe(95);
    expect(filled.account.balance).toBeCloseTo(9995);
    expect(filled.events[0]?.type).toBe('orderFilled');
  });

  it('short limit fills when price rises to the limit', () => {
    const placed = open(createAccount(), long({ side: 'short', type: 'limit', limitPrice: 105 }));
    expect(processTick(placed.account, { NOVA: 104 }, CLOCK).account.orders).toHaveLength(1);
    expect(processTick(placed.account, { NOVA: 106 }, CLOCK).account.positions).toHaveLength(1);
  });

  it('cancels an order and handles unknown ids', () => {
    const placed = open(createAccount(), long({ type: 'limit', limitPrice: 95 }));
    const id = placed.account.orders[0]!.id;
    const cancelled = cancelOrder(placed.account, id);
    expect(cancelled.ok && cancelled.value.account.orders).toHaveLength(0);
    expect(cancelOrder(placed.account, 'nope')).toEqual({ ok: false, error: 'orderNotFound' });
  });
});

describe('isBankrupt', () => {
  it('is bankrupt with no exposure and less than the minimum order', () => {
    expect(isBankrupt(createAccount(5), {})).toBe(true);
    expect(isBankrupt(createAccount(10_000), {})).toBe(false);
  });

  it('is not bankrupt while a position can still recover', () => {
    expect(isBankrupt(accountWith([makePosition()], 5), { NOVA: 100 })).toBe(false);
  });
});
