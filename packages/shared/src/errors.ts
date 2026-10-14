/**
 * Machine-readable error codes. The API always answers errors with
 * `{ error: { code, message } }`; clients translate by `code`, never by `message`.
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'CSRF_INVALID',
  'INTERNAL_ERROR',
  // auth
  'EMAIL_TAKEN',
  'NICKNAME_TAKEN',
  'NICKNAME_INVALID',
  'NICKNAME_FORBIDDEN',
  'INVALID_CREDENTIALS',
  'TOKEN_INVALID',
  'TOKEN_EXPIRED',
  'PROVIDER_DISABLED',
  // runs
  'RUN_NOT_FOUND',
  'RUN_NOT_ACTIVE',
  'RUN_ALREADY_ACTIVE',
  'RUN_EXPIRED',
  'ACTIONS_INVALID',
  'ACTIONS_TOO_FAST',
  'ACTIONS_LIMIT',
  'DAILY_ALREADY_PLAYED',
  // social & sync
  'USER_NOT_FOUND',
  'CANNOT_FRIEND_SELF',
  'FRIEND_REQUEST_EXISTS',
  'ALREADY_FRIENDS',
  'VERSION_CONFLICT',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const err = (value as { error: unknown }).error;
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (ERROR_CODES as readonly string[]).includes((err as { code: string }).code)
  );
}
