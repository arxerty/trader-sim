import { isApiErrorBody, type AuthResponse, type ErrorCode } from '@trader-sim/shared';
import { useAuthStore } from '@/store/authStore';

/** Base URL of the API. In dev and in Docker the web server proxies `/api` to the backend. */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

/** Client-side codes in addition to the server's `ErrorCode`s. */
export type ClientErrorCode = ErrorCode | 'NETWORK' | 'UNKNOWN';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Attach the access token (default true). */
  auth?: boolean;
  signal?: AbortSignal;
  /** Internal: prevents refresh loops. */
  retried?: boolean;
}

async function rawRequest(path: string, opts: RequestOptions): Promise<Response> {
  const url = new URL(`${API_URL}${path}`, window.location.origin);
  for (const [k, v] of Object.entries(opts.query ?? {}))
    if (v !== undefined) url.searchParams.set(k, String(v));
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const token = useAuthStore.getState().accessToken;
  if (opts.auth !== false && token) headers.authorization = `Bearer ${token}`;
  const csrf = readCookie('ts_csrf');
  if (csrf) headers['x-csrf-token'] = csrf;
  try {
    return await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: 'include',
      signal: opts.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK', 'Network request failed');
  }
}

async function toError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  if (isApiErrorBody(body))
    return new ApiError(res.status, body.error.code, body.error.message, body.error.details);
  return new ApiError(res.status, res.status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN', res.statusText);
}

/* ---------------------------------------------------------------- refresh */

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchanges the httpOnly refresh cookie for a new access token. Concurrent
 * 401s share one refresh request (single flight), so tokens rotate once.
 */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const csrfBefore = readCookie('ts_csrf');
      let res = await rawRequest('/auth/refresh', { method: 'POST', auth: false });
      if (res.status === 401) {
        // Another tab may have rotated the cookie a moment ago – retry once with the new one.
        await new Promise((r) => setTimeout(r, 300));
        if (readCookie('ts_csrf') !== csrfBefore) {
          res = await rawRequest('/auth/refresh', { method: 'POST', auth: false });
        }
      }
      if (!res.ok) {
        useAuthStore.getState().setGuest();
        return false;
      }
      const data = (await res.json()) as AuthResponse;
      useAuthStore.getState().setSession(data.accessToken, data.user);
      return true;
    } catch {
      // Offline: keep an existing session, otherwise continue as guest.
      if (useAuthStore.getState().status === 'unknown') useAuthStore.getState().setGuest();
      return false;
    } finally {
      queueMicrotask(() => {
        refreshInFlight = null;
      });
    }
  })();
  return refreshInFlight;
}

/** Typed JSON request with automatic token refresh on 401. */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await rawRequest(path, opts);
  if (
    res.status === 401 &&
    opts.auth !== false &&
    !opts.retried &&
    useAuthStore.getState().accessToken
  ) {
    if (await refreshSession()) return api<T>(path, { ...opts, retried: true });
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
