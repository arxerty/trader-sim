import type { Account, Position } from '../types';
import { createAccount } from '../trading';

export const PRICES = { NOVA: 100, BTCX: 40_000 } as const;
export const CLOCK = { tick: 1, time: 1_700_000_000 };

export function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 'p-1',
    assetId: 'NOVA',
    side: 'long',
    entryPrice: 100,
    quantity: 50,
    leverage: 5,
    margin: 1000,
    openFee: 5,
    openedTick: 0,
    openedAt: 0,
    ...overrides,
  };
}

export function accountWith(positions: Position[], balance = 10_000): Account {
  return { ...createAccount(balance), positions, seq: positions.length };
}
