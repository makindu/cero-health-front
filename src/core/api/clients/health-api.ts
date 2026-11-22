import { env } from '@/core/config/env';
import { apiContext } from '../api-context';
import { createApiClient } from '../create-api-client';
import { resourceNormalizer } from '../normalizers';

/**
 * CERO HEALTH API : nouvelles fonctionnalités médicales (domaine Health du monolithe modulaire).
 * Contrat cible : enveloppe { success, message, data, meta } (CDC technique CERO PLATFORM §10.2).
 *
 * Authentification : jeton CERO CEPATEC (stratégie « health » enregistrée par la session, voir core/auth/cero-id.tsx).
 * Établissement actif : en-tête X-Enterprise-Id, revérifié par le serveur à chaque requête.
 */
export const healthClient = createApiClient({
  source: 'health',
  baseURL: env.api.health,
  timeoutMs: env.apiTimeoutMs,
  normalize: resourceNormalizer,
  // Établissement actif : INDICATION envoyée au serveur, qui revérifie toujours l'accès et les droits (X-Enterprise-Id).
  headers: () => ({ 'X-Enterprise-Id': apiContext.get().facilityId ?? undefined }),
});
