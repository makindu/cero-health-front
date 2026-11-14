import { ApiError, type ApiResult, type ApiSource, type PageMeta } from './types';

/**
 * Les trois API n'ont PAS le même format de réponse. Chaque client déclare son normaliseur.
 *
 *  - envelopeNormalizer : enveloppe cible de la plateforme CERO { success, message, data, meta }
 *    (cahier des charges technique CERO PLATFORM, §10.2). Strict : une réponse hors contrat est une erreur.
 *  - adaptiveNormalizer : pour les backends dont le format n'est pas encore figé (CERO ID CORE) ou
 *    hétérogène (UZISHA Laravel 8 : tableaux bruts, paginateurs Laravel, { success, ... }).
 */

export interface NormalizerContext {
  source: ApiSource;
  status: number;
}

export type ResponseNormalizer = (body: unknown, context: NormalizerContext) => ApiResult<unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** Reconnaît les métadonnées de pagination Laravel (current_page, per_page, ...) ou camelCase. */
export function toPageMeta(value: unknown): PageMeta | null {
  if (!isRecord(value)) return null;
  const page = num(value.current_page) ?? num(value.page);
  const perPage = num(value.per_page) ?? num(value.perPage);
  const total = num(value.total);
  if (page === undefined || perPage === undefined || total === undefined) return null;
  const lastPage =
    num(value.last_page) ?? num(value.lastPage) ?? Math.max(1, Math.ceil(total / Math.max(perPage, 1)));
  return { page, perPage, total, lastPage };
}

function failure(body: Record<string, unknown>, context: NormalizerContext): ApiError {
  const message = typeof body.message === 'string' ? body.message : 'Request failed';
  const errors = isRecord(body.errors)
    ? (Object.fromEntries(
        Object.entries(body.errors).map(([k, v]) => [k, Array.isArray(v) ? v.map(String) : [String(v)]]),
      ) as Record<string, string[]>)
    : undefined;
  return new ApiError(errors ? 'validation' : 'unknown', message, {
    source: context.source,
    status: context.status,
    fieldErrors: errors,
  });
}

export const envelopeNormalizer: ResponseNormalizer = (body, context) => {
  if (!isRecord(body) || typeof body.success !== 'boolean') {
    throw new ApiError('unknown', 'Response does not follow the CERO envelope contract', {
      source: context.source,
      status: context.status,
    });
  }
  if (!body.success) throw failure(body, context);
  return {
    data: body.data,
    message: typeof body.message === 'string' ? body.message : undefined,
    meta: toPageMeta(body.meta),
  };
};

export const adaptiveNormalizer: ResponseNormalizer = (body, context) => {
  if (isRecord(body)) {
    if (body.success === false) throw failure(body, context);

    // Enveloppe { success: true, data, meta? }
    if (body.success === true && 'data' in body) {
      return {
        data: body.data,
        message: typeof body.message === 'string' ? body.message : undefined,
        meta: toPageMeta(body.meta) ?? toPageMeta(body),
      };
    }

    // Paginateur Laravel : { data: [...], current_page, per_page, total, last_page, ... }
    if (Array.isArray(body.data) && toPageMeta(body)) {
      return { data: body.data, meta: toPageMeta(body) };
    }
  }
  // Tableau brut, objet métier brut ou { success: true, user, ... } : renvoyé tel quel.
  return { data: body, meta: null };
};
