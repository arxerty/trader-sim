import type { Leverage } from '@/types';

export const STARTING_BALANCE = 10_000;
/** 0.1% of notional, charged on open and on close. */
export const FEE_RATE = 0.001;
export const LEVERAGES: readonly Leverage[] = [1, 2, 5, 10];
export const PERCENT_PRESETS = [25, 50, 100] as const;
export type PercentPreset = (typeof PERCENT_PRESETS)[number];
/** Position is liquidated when its remaining margin drops to 10% of the initial margin. */
export const MAINTENANCE_MARGIN_RATIO = 0.1;
export const MIN_ORDER_MARGIN = 10;
/** Below this equity with no open exposure the player is bankrupt. */
export const BANKRUPTCY_THRESHOLD = MIN_ORDER_MARGIN;
