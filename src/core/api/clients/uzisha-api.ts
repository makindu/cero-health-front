import { env } from '@/core/config/env';
import { apiContext } from '../api-context';
import { createApiClient } from '../create-api-client';
import { adaptiveNormalizer } from '../normalizers';

/**
 * CERO UZISHA (Laravel 8) : uniquement pour les fonctionnalités réellement réutilisées
 * (voir docs/UZISHA_REUSE_MATRIX.md). Les réponses y sont hétérogènes (tableaux bruts,
 * paginateurs Laravel, { success, ... }) d'où le normaliseur adaptatif.
 *
 * `X-Enterprise-Id` : en-tête lu par UsersController::show dans les archives UZISHA.
 * Son acceptation par la politique CORS et la correspondance établissement HEALTH = entreprise UZISHA
 * restent à confirmer.
 */
export const uzishaClient = createApiClient({
  source: 'uzisha',
  baseURL: env.api.uzisha,
  timeoutMs: env.apiTimeoutMs,
  normalize: adaptiveNormalizer,
  headers: () => ({ 'X-Enterprise-Id': apiContext.get().facilityId ?? undefined }),
});
