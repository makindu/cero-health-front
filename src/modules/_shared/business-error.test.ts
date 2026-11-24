import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { ApiError, type ApiErrorKind } from '@/core/api/types';
import { describeBusinessError } from './business-error';

const t = ((k: string) => k) as unknown as TFunction;
const err = (kind: ApiErrorKind) => new ApiError(kind, 'x', { source: 'health' });

describe('describeBusinessError : causes techniques', () => {
  it('nomme la vraie cause', () => {
    expect(describeBusinessError(t, err('network'))).toBe('module.errNetwork');
    expect(describeBusinessError(t, err('timeout'))).toBe('module.errTimeout');
    expect(describeBusinessError(t, err('server'))).toBe('module.errServer');
    expect(describeBusinessError(t, err('rate_limited'))).toBe('module.errRateLimited');
    expect(describeBusinessError(t, err('forbidden'))).toBe('module.errForbidden');
  });
  it('montre la raison précise d’un refus de validation du serveur', () => {
    const e = new ApiError('validation', 'x', { source: 'health', status: 422, fieldErrors: { name: ['Un service porte déjà ce nom.'] } });
    expect(describeBusinessError(t, e)).toBe('Un service porte déjà ce nom.');
    expect(describeBusinessError(t, new ApiError('validation', 'x', { source: 'health', fieldErrors: {} }))).toBeNull();
  });
  it('laisse le message générique pour les autres erreurs', () => {
    expect(describeBusinessError(t, err('validation'))).toBeNull();
    expect(describeBusinessError(t, new Error('x'))).toBeNull();
  });
});
