import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMarketStore } from '@/store/marketStore';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useSettingsStore } from '@/store/settingsStore';
import { OrderPanel } from './OrderPanel';
import { useOrderFormStore } from './orderFormStore';
import { buildOrderRequest, resetSubmitGuard } from './orderForm';

beforeEach(() => {
  useMarketStore.getState().reset(42);
  usePortfolioStore.getState().reset();
  useSettingsStore.getState().selectAsset('NOVA');
  useOrderFormStore.setState({
    type: 'market',
    amount: '1000',
    percent: null,
    leverage: 1,
    limitPrice: '',
    stopLoss: '',
    takeProfit: '',
    error: null,
  });
  resetSubmitGuard();
});

const positions = () => usePortfolioStore.getState().account.positions;

describe('<OrderPanel />', () => {
  it('opens a long position with the Buy button', async () => {
    const user = userEvent.setup();
    render(<OrderPanel />);
    await user.click(screen.getByRole('button', { name: /buy \/ long/i }));
    expect(positions()).toHaveLength(1);
    expect(positions()[0]).toMatchObject({
      side: 'long',
      margin: 1000,
      leverage: 1,
      assetId: 'NOVA',
    });
  });

  it('applies the selected leverage and opens a short', async () => {
    const user = userEvent.setup();
    render(<OrderPanel />);
    await user.click(screen.getByRole('radio', { name: 'x10' }));
    await user.click(screen.getByRole('button', { name: /sell \/ short/i }));
    expect(positions()[0]).toMatchObject({ side: 'short', leverage: 10 });
  });

  it('shows a translated error when funds are insufficient', async () => {
    const user = userEvent.setup();
    render(<OrderPanel />);
    const amount = screen.getByLabelText('Margin, USD');
    await user.clear(amount);
    await user.type(amount, '999999');
    await user.click(screen.getByRole('button', { name: /buy \/ long/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Insufficient free margin');
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    expect(positions()).toHaveLength(0);
  });

  it('rejects a stop-loss on the wrong side of the price', async () => {
    const user = userEvent.setup();
    render(<OrderPanel />);
    await user.type(screen.getByLabelText(/stop-loss/i), '999999');
    await user.click(screen.getByRole('button', { name: /buy \/ long/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/stop-loss must be below/i);
    expect(positions()).toHaveLength(0);
  });

  it('ignores a double click (only one position is opened)', async () => {
    const user = userEvent.setup();
    render(<OrderPanel />);
    await user.dblClick(screen.getByRole('button', { name: /buy \/ long/i }));
    expect(positions()).toHaveLength(1);
  });

  it('uses a percentage of free margin', async () => {
    const user = userEvent.setup();
    render(<OrderPanel />);
    await user.click(screen.getByRole('radio', { name: '50%' }));
    await user.click(screen.getByRole('button', { name: /buy \/ long/i }));
    expect(positions()[0]!.margin).toBeCloseTo(5000 / 1.001, 2);
  });
});

describe('buildOrderRequest', () => {
  const base = {
    type: 'market',
    amount: '100',
    percent: null,
    leverage: 2,
    limitPrice: '',
    stopLoss: '',
    takeProfit: '',
  } as const;

  it('parses decimals with commas and optional fields', () => {
    const r = buildOrderRequest({ ...base, amount: '150,5', stopLoss: '90' }, 'long', 'NOVA', 1000);
    expect(r).toEqual({
      ok: true,
      value: {
        assetId: 'NOVA',
        side: 'long',
        type: 'market',
        margin: 150.5,
        leverage: 2,
        stopLoss: 90,
      },
    });
  });

  it('reports invalid input', () => {
    expect(buildOrderRequest({ ...base, amount: 'abc' }, 'long', 'NOVA', 1000)).toEqual({
      ok: false,
      error: 'invalidAmount',
    });
    expect(buildOrderRequest({ ...base, type: 'limit' }, 'long', 'NOVA', 1000)).toEqual({
      ok: false,
      error: 'invalidLimitPrice',
    });
    expect(buildOrderRequest({ ...base, percent: 100 }, 'long', 'NOVA', 0)).toEqual({
      ok: false,
      error: 'invalidAmount',
    });
  });
});
