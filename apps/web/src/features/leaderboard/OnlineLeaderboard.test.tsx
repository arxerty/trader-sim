import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LeaderboardPage, LeaderboardRow } from '@trader-sim/shared';
import i18n from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { mockApi, renderWithQuery } from '@/test/render';
import { OnlineLeaderboard } from './OnlineLeaderboard';

const row = (rank: number, nickname: string, value: number): LeaderboardRow => ({
  rank,
  nickname,
  avatar: null,
  level: 'pro',
  value,
  runId: `r${rank}`,
  achievedAt: '2026-10-14T00:00:00.000Z',
});

const page = (
  items: LeaderboardRow[],
  nextCursor: string | null,
  period = 'all',
): LeaderboardPage => ({
  type: 'equity',
  period: period as LeaderboardPage['period'],
  periodKey: period,
  items,
  nextCursor,
});

beforeEach(() => useAuthStore.getState().setGuest());
afterEach(async () => {
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage('en'));
});

describe('<OnlineLeaderboard />', () => {
  it('loads pages with a cursor and switches period tabs', async () => {
    const { calls } = mockApi({
      'GET /leaderboards/equity': (url) => {
        const period = url.searchParams.get('period');
        if (period === 'week') return { body: page([row(1, 'WeekKing', 15_000)], null, 'week') };
        return url.searchParams.get('cursor') === 'c2'
          ? { body: page([row(3, 'Carol', 11_000)], null) }
          : { body: page([row(1, 'Alice', 20_000), row(2, 'Bob', 12_500)], 'c2') };
      },
    });
    const user = userEvent.setup();
    renderWithQuery(<OnlineLeaderboard />);

    expect(await screen.findByRole('button', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByText('$20,000.00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    expect(await screen.findByRole('button', { name: 'Carol' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.searchParams.get('cursor') === 'c2')).toBe(true);

    await user.click(screen.getByRole('tab', { name: 'Week' }));
    expect(screen.getByRole('tab', { name: 'Week' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('button', { name: 'WeekKing' })).toBeInTheDocument();
  });

  it('asks guests to sign in for the friends board instead of calling the API', async () => {
    const { calls } = mockApi({ 'GET /leaderboards/equity': { body: page([], null) } });
    const user = userEvent.setup();
    renderWithQuery(<OnlineLeaderboard />);
    await user.click(screen.getByRole('tab', { name: 'Friends' }));
    expect(screen.getByText('Sign in to compete with friends')).toBeInTheDocument();
    expect(calls.some((c) => c.url.searchParams.get('period') === 'friends')).toBe(false);
  });

  it('shows empty and error states with retry', async () => {
    let fail = true;
    mockApi({
      'GET /leaderboards/equity': () =>
        fail
          ? { status: 503, body: { error: { code: 'INTERNAL_ERROR', message: 'down' } } }
          : { body: page([], null) },
    });
    const user = userEvent.setup();
    renderWithQuery(<OnlineLeaderboard />);
    expect(await screen.findByText('Server error. Please try later')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No results yet')).toBeInTheDocument();
  });

  it('formats values per metric and translates the screen on language switch', async () => {
    mockApi({
      'GET /leaderboards/equity': { body: page([row(1, 'Alice', 20_000)], null) },
      'GET /leaderboards/roi': { body: { ...page([row(1, 'Alice', 0.25)], null), type: 'roi' } },
    });
    const user = userEvent.setup();
    renderWithQuery(<OnlineLeaderboard />);
    await screen.findByRole('button', { name: 'Alice' });
    await user.selectOptions(screen.getByLabelText('Metric'), 'roi');
    expect(await screen.findByText('+25.00%')).toBeInTheDocument();

    await act(() => i18n.changeLanguage('ru'));
    expect(screen.getByRole('tab', { name: 'Глобальный' })).toBeInTheDocument();
    expect(screen.getByLabelText('Метрика')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Игрок')).toBeInTheDocument();

    await act(() => i18n.changeLanguage('de'));
    expect(screen.getByRole('tab', { name: 'Woche' })).toBeInTheDocument();
  });
});
