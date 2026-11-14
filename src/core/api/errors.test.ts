import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { isNonRetryable, toApiError } from './errors';

function httpError(status: number, data: unknown = {}, headers: Record<string, string> = {}) {
  const response = { status, data, headers, statusText: '', config: { headers: new AxiosHeaders() } };
  return new AxiosError('fail', 'ERR_BAD_REQUEST', undefined, undefined, response as AxiosResponse);
}

describe('toApiError', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [419, 'csrf'],
    [422, 'validation'],
    [429, 'rate_limited'],
    [500, 'server'],
  ])('HTTP %i → %s', (status, kind) => {
    expect(toApiError(httpError(status), 'health').kind).toBe(kind);
  });
  it('extrait erreurs de champs et identifiant de requête', () => {
    const error = toApiError(
      httpError(422, { message: 'x', errors: { name: ['requis'] } }, { 'x-request-id': 'abc' }),
      'health',
    );
    expect(error.fieldErrors).toEqual({ name: ['requis'] });
    expect(error.requestId).toBe('abc');
  });
  it('distingue réseau et délai dépassé', () => {
    expect(toApiError(new AxiosError('x', 'ERR_NETWORK'), 'uzisha').kind).toBe('network');
    expect(toApiError(new AxiosError('x', 'ECONNABORTED'), 'uzisha').kind).toBe('timeout');
  });
  it('ne réessaie pas les erreurs client', () => {
    expect(isNonRetryable(toApiError(httpError(403), 'health'))).toBe(true);
    expect(isNonRetryable(toApiError(httpError(500), 'health'))).toBe(false);
  });
});
