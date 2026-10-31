/**
 * Typed errors for the integrations module.
 *
 * The codes are deliberately coarse: the admin layer maps them to user-facing
 * messages, while `retryable` drives the conservative backoff policy.
 */
export type IntegrationErrorCode =
  | "invalid_url"
  | "blocked_host"
  | "blocked_address"
  | "unsupported_scheme"
  | "unsupported_content_type"
  | "response_too_large"
  | "timeout"
  | "http_error"
  | "too_many_redirects"
  | "rate_limited"
  | "parse_failure"
  | "missing_required_data"
  | "configuration_invalid"
  | "concurrent_sync";

export interface IntegrationErrorOptions {
  retryable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class IntegrationError extends Error {
  readonly code: IntegrationErrorCode;
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: IntegrationErrorCode, message: string, options: IntegrationErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "IntegrationError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

export function isIntegrationError(value: unknown): value is IntegrationError {
  return value instanceof IntegrationError;
}
