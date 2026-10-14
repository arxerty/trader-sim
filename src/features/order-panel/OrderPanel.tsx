import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Leverage, OrderType, Side } from '@/types';
import { LEVERAGES, MIN_ORDER_MARGIN, PERCENT_PRESETS, type PercentPreset } from '@/engine/trading';
import { useSettingsStore } from '@/store/settingsStore';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { cn } from '@/shared/lib/cn';
import { Button, Segmented } from '@/shared/ui';
import { useOrderFormStore } from './orderFormStore';
import { submitOrderForm } from './orderForm';
import { OrderPreview } from './OrderPreview';

function Field({
  label,
  hint,
  children,
  id,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
  id?: string;
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={fieldId}
        className="flex items-baseline justify-between text-xs font-medium text-muted"
      >
        <span>{label}</span>
        {hint && <span className="text-[10px] font-normal opacity-80">{hint}</span>}
      </label>
      {children(fieldId)}
    </div>
  );
}

const inputClass =
  'h-9 w-full rounded border border-border bg-surface-2 px-2.5 font-mono text-sm tabular-nums text-text placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent aria-[invalid=true]:border-down';

export function OrderPanel() {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const assetId = useSettingsStore((s) => s.selectedAssetId);
  const bankrupt = usePortfolioStore((s) => s.bankrupt);
  const form = useOrderFormStore();
  const errorId = useId();

  const submit = (side: Side) => submitOrderForm(side);

  const errorText = form.error
    ? t(`errors.${form.error}`, { min: fmt.currency(MIN_ORDER_MARGIN) })
    : null;
  const amountInvalid =
    form.error === 'invalidAmount' ||
    form.error === 'amountTooSmall' ||
    form.error === 'insufficientFunds';

  return (
    <form
      className="flex flex-col gap-3 p-3"
      aria-describedby={errorText ? errorId : undefined}
      onSubmit={(e) => e.preventDefault()}
      noValidate
    >
      <Segmented<OrderType>
        label={t('trade.orderType')}
        value={form.type}
        onChange={(type) => form.patch({ type })}
        options={[
          { value: 'market', label: t('trade.market') },
          { value: 'limit', label: t('trade.limit') },
        ]}
      />

      {form.type === 'limit' && (
        <Field label={t('trade.limitPrice')}>
          {(id) => (
            <input
              id={id}
              className={inputClass}
              inputMode="decimal"
              autoComplete="off"
              value={form.limitPrice}
              aria-invalid={form.error === 'invalidLimitPrice'}
              onChange={(e) => form.patch({ limitPrice: e.target.value })}
            />
          )}
        </Field>
      )}

      <Field label={t('trade.amountUsd')}>
        {(id) => (
          <input
            id={id}
            className={inputClass}
            inputMode="decimal"
            autoComplete="off"
            value={form.percent !== null ? '' : form.amount}
            placeholder={
              form.percent !== null ? fmt.percent(form.percent / 100, false, 0) : undefined
            }
            aria-invalid={amountInvalid}
            onChange={(e) => form.patch({ amount: e.target.value, percent: null })}
          />
        )}
      </Field>

      <Segmented<PercentPreset>
        label={t('trade.shareOfFreeMargin')}
        size="sm"
        value={form.percent}
        onChange={(percent) => form.patch({ percent })}
        options={PERCENT_PRESETS.map((p) => ({ value: p, label: fmt.percent(p / 100, false, 0) }))}
      />

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted" aria-hidden="true">
          {t('trade.leverage')}
        </span>
        <Segmented<Leverage>
          label={t('trade.leverage')}
          size="sm"
          value={form.leverage}
          onChange={(leverage) => form.patch({ leverage })}
          options={LEVERAGES.map((l) => ({
            value: l,
            label: t('trade.leverageValue', { value: l }),
          }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label={t('trade.stopLoss')} hint={t('trade.optional')}>
          {(id) => (
            <input
              id={id}
              className={inputClass}
              inputMode="decimal"
              autoComplete="off"
              value={form.stopLoss}
              aria-invalid={form.error === 'invalidStopLoss'}
              onChange={(e) => form.patch({ stopLoss: e.target.value })}
            />
          )}
        </Field>
        <Field label={t('trade.takeProfit')} hint={t('trade.optional')}>
          {(id) => (
            <input
              id={id}
              className={inputClass}
              inputMode="decimal"
              autoComplete="off"
              value={form.takeProfit}
              aria-invalid={form.error === 'invalidTakeProfit'}
              onChange={(e) => form.patch({ takeProfit: e.target.value })}
            />
          )}
        </Field>
      </div>

      <OrderPreview assetId={assetId} />

      <p
        id={errorId}
        role="alert"
        className={cn('min-h-[1rem] text-xs text-down', !errorText && 'sr-only')}
      >
        {errorText}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="up"
          size="lg"
          disabled={bankrupt}
          onClick={() => submit('long')}
          aria-keyshortcuts="B"
        >
          <span>{t('trade.buyLong')}</span>
          <kbd className="hidden rounded bg-black/20 px-1 text-[10px] font-normal sm:inline">B</kbd>
        </Button>
        <Button
          variant="down"
          size="lg"
          disabled={bankrupt}
          onClick={() => submit('short')}
          aria-keyshortcuts="S"
        >
          <span>{t('trade.sellShort')}</span>
          <kbd className="hidden rounded bg-black/20 px-1 text-[10px] font-normal sm:inline">S</kbd>
        </Button>
      </div>
    </form>
  );
}
