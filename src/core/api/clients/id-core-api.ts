import { env } from '@/core/config/env';
import { createApiClient } from '../create-api-client';
import { adaptiveNormalizer } from '../normalizers';

/**
 * CERO ID CORE : identité, authentification et SSO de l'écosystème CERO.
 *
 * Le contrat réel (routes, format des réponses, jetons ou cookies) n'est pas encore connu :
 * le normaliseur « adaptatif » est provisoire et la stratégie d'authentification n'est pas enregistrée.
 * Rien n'est deviné ici — voir docs/CERO_ID_CORE_QUESTIONS.md.
 */
export const idCoreClient = createApiClient({
  source: 'id-core',
  baseURL: env.api.idCore,
  timeoutMs: env.apiTimeoutMs,
  normalize: adaptiveNormalizer,
});
