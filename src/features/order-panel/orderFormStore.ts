import { create } from 'zustand';
import type { Leverage, OrderType, TradeErrorCode } from '@/types';
import type { PercentPreset } from '@/engine/trading';

/**
 * Draft of the order form. Lives in a store (not component state) so hotkeys
 * can submit it even when the panel is not mounted (e.g. on mobile).
 */
export interface OrderFormState {
  type: OrderType;
  amount: string;
  /** When set, the margin is computed from free margin at submit time. */
  percent: PercentPreset | null;
  leverage: Leverage;
  limitPrice: string;
  stopLoss: string;
  takeProfit: string;
  error: TradeErrorCode | null;
  patch: (patch: Partial<Omit<OrderFormState, 'patch' | 'resetProtection'>>) => void;
  resetProtection: () => void;
}

export const useOrderFormStore = create<OrderFormState>()((set) => ({
  type: 'market',
  amount: '1000',
  percent: null,
  leverage: 1,
  limitPrice: '',
  stopLoss: '',
  takeProfit: '',
  error: null,
  patch: (patch) => set({ error: null, ...patch }),
  resetProtection: () => set({ stopLoss: '', takeProfit: '', limitPrice: '' }),
}));
