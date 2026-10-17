
import { ERROR_CODES, type ErrorCode } from './constants.js';
import type { OperationErrorInfo } from './types.js';

/** Base error carrying a stable code and optional structured diagnostics. */
export class ZeroBotForgeError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  public constructor(
    message: string,
    code: ErrorCode = ERROR_CODES.INTERNAL_ERROR,
    details?: unknown,
    cause?: unknown,
  ) {
    super(message);
    if (cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        configurable: true,
        enumerable: false,
        value: cause,
        writable: true,
      });
    }

    this.name = new.target.name;
    this.code = code;
    this.details = details;

    // Preserve instanceof behavior in environments that transpile classes.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends ZeroBotForgeError {
  public constructor(
    message: string,
    details?: unknown,
    cause?: unknown,
  ) {
    super(
      message,
      ERROR_CODES.VALIDATION_FAILED,
      details,
      cause,
    );
  }
}

export class ProjectFormatError extends ZeroBotForgeError {
  public constructor(
    message: string,
    code: ErrorCode,
    details?: unknown,
    cause?: unknown,
  ) {
    super(message, code, details, cause);
  }
}

/**
 * Convert an unknown thrown value into the shared, serializable error contract.
 * Do not expose stack traces to the renderer as normal operation data.
 */
export function toOperationErrorInfo(
  error: unknown,
): OperationErrorInfo {
  if (error instanceof ZeroBotForgeError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details === undefined
        ? {}
        : { details: error.details }),
    };
  }

  if (error instanceof Error) {
    return {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: error.message,
    };
  }

  return {
    code: ERROR_CODES.INTERNAL_ERROR,
    message: 'An unexpected non-Error value was thrown.',
    details: error,
  };
}
