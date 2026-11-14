import type { TFunction } from 'i18next';
import { ApiError, type ApiErrorKind } from '@/core/api/types';

type Params = Record<string, string | number>;

/**
 * Refus d'une règle métier locale (patient introuvable, créneau pris, transition interdite…).
 * `message` est une CLÉ de traduction (espace « common », section « business ») : l'interface affiche le texte traduit.
 */
export class BusinessRuleError extends ApiError {
  readonly params: Params;
  constructor(key: string, params: Params = {}, kind: ApiErrorKind = 'validation') {
    super(kind, key, { source: 'health', status: kind === 'conflict' ? 409 : 422, code: 'business_rule' });
    this.name = 'BusinessRuleError';
    this.params = params;
  }
}

/** Texte à montrer à l'utilisateur pour un refus métier ou de permission locale ; null pour toute autre erreur. */
export function describeBusinessError(t: TFunction, error: unknown): string | null {
  if (error instanceof BusinessRuleError) return t(`business.${error.message}`, error.params);
  if (error instanceof ApiError && error.code === 'local_forbidden') return error.message;
  if (error instanceof ApiError && error.code === 'local_unsupported') return error.message;
  return null;
}
