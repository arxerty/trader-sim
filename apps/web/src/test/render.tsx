import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

export function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

export interface MockRoute {
  status?: number;
  body?: unknown;
}

export type MockHandler = (url: URL, init: RequestInit) => MockRoute | Promise<MockRoute>;

/**
 * Replaces `fetch` with a router keyed by "METHOD /path" (path without the /api prefix).
 * Unknown routes answer 404 in the API error format.
 */
export function mockApi(routes: Record<string, MockHandler | MockRoute>) {
  const calls: Array<{ method: string; path: string; body: unknown; url: URL }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const path = url.pathname.replace(/^\/api/, '');
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ method, path, body, url });
    const route = routes[`${method} ${path}`];
    const res = typeof route === 'function' ? await route(url, init) : route;
    if (!res) {
      return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'no mock' } }), {
        status: 404,
      });
    }
    return new Response(res.body === undefined ? null : JSON.stringify(res.body), {
      status: res.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}
