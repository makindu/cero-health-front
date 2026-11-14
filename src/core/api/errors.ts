import axios from 'axios';
import { ApiError, type ApiErrorKind, type ApiSource } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function kindFromStatus(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 419) return 'csrf'; // session / jeton CSRF expiré (Laravel)
  if (status === 422) return 'validation';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'unknown';
}

function extractFieldErrors(body: unknown): Record<string, string[]> | undefined {
  if (!isRecord(body) || !isRecord(body.errors)) return undefined;
  const result: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(body.errors)) {
    if (Array.isArray(messages)) {
      result[field] = messages.filter((m): m is string => typeof m === 'string');
    } else if (typeof messages === 'string') {
      result[field] = [messages];
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Message technique de l'API (pour le support) ; l'interface affiche un message traduit selon `kind`. */
function extractMessage(body: unknown, fallback: string): string {
  if (isRecord(body) && typeof body.message === 'string' && body.message.trim()) {
    return body.message;
  }
  return fallback;
}

function extractCode(body: unknown): string | undefined {
  if (isRecord(body) && typeof body.code === 'string') return body.code;
  return undefined;
}

/** Convertit n'importe quelle erreur (Axios ou autre) en ApiError normalisée. */
export function toApiError(error: unknown, source: ApiSource): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isAxiosError(error)) {
    const response = error.response;
    if (!response) {
      const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
      return new ApiError(timedOut ? 'timeout' : 'network', error.message, { source });
    }
    const headers = response.headers as Record<string, unknown> | undefined;
    const requestId =
      typeof headers?.['x-request-id'] === 'string' ? headers['x-request-id'] : undefined;
    return new ApiError(
      kindFromStatus(response.status),
      extractMessage(response.data, error.message),
      {
        source,
        status: response.status,
        code: extractCode(response.data),
        fieldErrors: extractFieldErrors(response.data),
        requestId,
      },
    );
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return new ApiError('unknown', message, { source });
}

/** Erreurs pour lesquelles réessayer ne sert à rien. */
export function isNonRetryable(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    ['config', 'unauthorized', 'forbidden', 'not_found', 'csrf', 'validation', 'conflict'].includes(
      error.kind,
    )
  );
}
