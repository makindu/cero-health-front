import { env } from '@/core/config/env';
import { createApiClient } from '../create-api-client';
import { envelopeNormalizer } from '../normalizers';

/**
 * CERO HEALTH API : nouvelles fonctionnalités médicales (domaine Health du monolithe modulaire).
 * Contrat cible : enveloppe { success, message, data, meta } (CDC technique CERO PLATFORM §10.2).
 *
 * Le mécanisme exact de transmission de l'établissement actif (en-tête, chemin, jeton) n'est pas
 * encore défini : aucun en-tête n'est envoyé tant qu'il n'est pas confirmé.
 */
export const healthClient = createApiClient({
  source: 'health',
  baseURL: env.api.health,
  timeoutMs: env.apiTimeoutMs,
  normalize: envelopeNormalizer,
});
