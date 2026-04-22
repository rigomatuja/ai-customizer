/**
 * Standard error response shape for all API endpoints.
 * Shape: { error: string, code: string, details?: unknown }
 *
 * - `error`: human-readable message safe to show the user
 * - `code`: machine-readable kebab-case identifier for i18n / branching
 * - `details`: optional structured extras (validation issues, IDs, etc.)
 */
export interface ApiErrorBody {
  error: string
  code: string
  details?: unknown
}

export function apiError(message: string, code: string, details?: unknown): ApiErrorBody {
  return details === undefined ? { error: message, code } : { error: message, code, details }
}
