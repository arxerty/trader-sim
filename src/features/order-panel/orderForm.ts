import type { AssetId, OrderRequest, PendingOrder, Position, Result, Side } from '@/types';
import { marginForPercent, summarizeAccount } from '@/engine/trading';
import { parseDecimal } from '@/shared/lib/math';
import { getPrices } from '@/store/marketStore';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useSettingsStore } from '@/store/settingsStore';
import { submitOrder } from '@/store/game';
import { useOrderFormStore, type OrderFormState } from './orderFormStore';

type FormValues = Pick<
  OrderFormState,
  'type' | 'amount' | 'percent' | 'leverage' | 'limitPrice' | 'stopLoss' | 'takeProfit'
>;

/** Converts raw form strings into a typed request. Pure – unit-testable. */
export function buildOrderRequest(
  form: FormValues,
  side: Side,
  assetId: AssetId,
  freeMargin: number,
): Result<OrderRequest> {
  const margin =
    form.percent !== null
      ? marginForPercent(freeMargin, form.percent, form.leverage)
      : parseDecimal(form.amount);
  if (margin === null || !Number.isFinite(margin) || margin <= 0)
    return { ok: false, error: 'invalidAmount' };

  const request: OrderRequest = { assetId, side, type: form.type, margin, leverage: form.leverage };

  if (form.type === 'limit') {
    const limit = parseDecimal(form.limitPrice);
    if (limit === null || limit <= 0) return { ok: false, error: 'invalidLimitPrice' };
    request.limitPrice = limit;
  }
  if (form.stopLoss.trim() !== '') {
    const sl = parseDecimal(form.stopLoss);
    if (sl === null || sl <= 0) return { ok: false, error: 'invalidStopLoss' };
    request.stopLoss = sl;
  }
  if (form.takeProfit.trim() !== '') {
    const tp = parseDecimal(form.takeProfit);
    if (tp === null || tp <= 0) return { ok: false, error: 'invalidTakeProfit' };
    request.takeProfit = tp;
  }
  return { ok: true, value: request };
}

const SUBMIT_COOLDOWN_MS = 250;
let lastSubmitAt = 0;

/**
 * Submits the current draft for the selected asset. Used by the Buy/Sell
 * buttons and by the B/S hotkeys. Repeated calls within the cooldown are ignored.
 */
export function submitOrderForm(side: Side, now = Date.now()): Result<Position | PendingOrder> {
  if (now - lastSubmitAt < SUBMIT_COOLDOWN_MS) return { ok: false, error: 'duplicateAction' };
  lastSubmitAt = now;

  const form = useOrderFormStore.getState();
  const assetId = useSettingsStore.getState().selectedAssetId;
  const { freeMargin } = summarizeAccount(usePortfolioStore.getState().account, getPrices());

  const built = buildOrderRequest(form, side, assetId, freeMargin);
  const result = built.ok ? submitOrder(built.value) : built;
  if (result.ok) {
    form.resetProtection();
    form.patch({ error: null });
  } else {
    form.patch({ error: result.error });
  }
  return result;
}

/** Test helper: resets the double-submit guard. */
export function resetSubmitGuard(): void {
  lastSubmitAt = 0;
}
