import type { ErrorCode } from '@trader-sim/shared';

/** Throw anywhere in a handler; the error handler turns it into `{ error: { code, message } }`. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }
}

export const badRequest = (
  code: ErrorCode = 'VALIDATION_ERROR',
  message?: string,
  details?: unknown,
) => new AppError(400, code, message, details);
export const unauthorized = (code: ErrorCode = 'UNAUTHORIZED', message?: string) =>
  new AppError(401, code, message);
export const forbidden = (code: ErrorCode = 'FORBIDDEN', message?: string) =>
  new AppError(403, code, message);
export const notFound = (code: ErrorCode = 'NOT_FOUND', message?: string) =>
  new AppError(404, code, message);
export const conflict = (code: ErrorCode = 'CONFLICT', message?: string, details?: unknown) =>
  new AppError(409, code, message, details);
