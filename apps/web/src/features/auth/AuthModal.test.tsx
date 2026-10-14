import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Me } from '@trader-sim/shared';
import { useAuthStore } from '@/store/authStore';
import { useProgressStore } from '@/store/progressStore';
import { useUiStore } from '@/store/uiStore';
import { mockApi, renderWithQuery } from '@/test/render';
import { AuthModal } from './AuthModal';

const me: Me = {
  id: 'u1',
  email: 'trader@example.test',
  emailVerified: false,
  nickname: 'Trader_1',
  avatar: null,
  locale: 'en',
  theme: 'system',
  hideFromLeaderboard: false,
  createdAt: '2026-10-14T00:00:00.000Z',
};

beforeEach(() => {
  useAuthStore.getState().setGuest();
  useProgressStore.getState().resetProgress();
});
afterEach(() => {
  vi.unstubAllGlobals();
  useUiStore.getState().closeAuth();
});

describe('<AuthModal />', () => {
  it('validates the login form on the client before calling the API', async () => {
    const { calls } = mockApi({ 'GET /auth/providers': { body: { providers: [] } } });
    const user = userEvent.setup();
    useUiStore.getState().openAuth('login');
    renderWithQuery(<AuthModal />);

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid e-mail')).toBeInTheDocument();
    expect(screen.getByText('Required field')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/auth/login')).toHaveLength(0);
  });

  it('signs in, stores the session in memory and closes', async () => {
    const { calls } = mockApi({
      'GET /auth/providers': { body: { providers: ['github'] } },
      'POST /auth/login': { body: { accessToken: 'jwt-token', user: me } },
    });
    const user = userEvent.setup();
    useUiStore.getState().openAuth('login');
    renderWithQuery(<AuthModal />);

    expect(await screen.findByRole('link', { name: 'Continue with GitHub' })).toHaveAttribute(
      'href',
      '/api/auth/oauth/github/start',
    );
    await user.type(screen.getByLabelText('E-mail'), 'trader@example.test');
    await user.type(screen.getByLabelText('Password'), 'correct-horse-1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(useAuthStore.getState().accessToken).toBe('jwt-token');
    expect(calls.find((c) => c.path === '/auth/login')?.body).toEqual({
      email: 'trader@example.test',
      password: 'correct-horse-1',
    });
    expect(useUiStore.getState().auth).toBeNull();
    expect(localStorage.getItem('jwt-token')).toBeNull();
  });

  it('shows translated server errors by code', async () => {
    mockApi({
      'GET /auth/providers': { body: { providers: [] } },
      'POST /auth/login': {
        status: 401,
        body: { error: { code: 'INVALID_CREDENTIALS', message: 'whatever the server says' } },
      },
    });
    const user = userEvent.setup();
    useUiStore.getState().openAuth('login');
    renderWithQuery(<AuthModal />);
    await user.type(screen.getByLabelText('E-mail'), 'a@b.test');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong e-mail or password');
    expect(screen.queryByText('whatever the server says')).not.toBeInTheDocument();
  });

  it('registers and offers to link local guest progress', async () => {
    useProgressStore.setState({ xp: 120, unlocked: { firstTrade: 1, firstProfit: 2 } });
    const { calls } = mockApi({
      'POST /auth/register': { status: 201, body: { accessToken: 't', user: me } },
    });
    const user = userEvent.setup();
    useUiStore.getState().openAuth('register');
    renderWithQuery(<AuthModal />);

    await user.type(screen.getByLabelText('E-mail'), 'trader@example.test');
    await user.type(screen.getByLabelText('Nickname'), 'x!');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getAllByText(/Latin letters, digits and _/)).not.toHaveLength(0);
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Nickname'));
    await user.type(screen.getByLabelText('Nickname'), 'Trader_1');
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'correct-horse-1');
    expect(screen.getByRole('checkbox', { name: /120 XP and 2 achievements/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(calls.find((c) => c.path === '/auth/register')?.body).toMatchObject({
      nickname: 'Trader_1',
      guestProgress: { xp: 120, achievements: ['firstTrade', 'firstProfit'] },
    });
  });
});
