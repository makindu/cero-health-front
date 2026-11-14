import { QueryClient } from '@tanstack/react-query';
import { isNonRetryable } from './errors';

/**
 * Cache serveur (TanStack Query).
 *
 * Sécurité multi-établissement : le cache doit être VIDÉ (queryClient.clear()) à la déconnexion et
 * au changement d'établissement actif, et toutes les clés de requête métier passent par
 * `queryKeys.scoped(facilityId, ...)` afin qu'aucune donnée d'un établissement ne puisse
 * être affichée dans le contexte d'un autre.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => !isNonRetryable(error) && failureCount < 2,
      },
      mutations: { retry: false },
    },
  });
}

export const queryKeys = {
  /** Clé de requête rattachée à un établissement : ['facility', <id>, ...parts]. */
  scoped: (facilityId: string | null, ...parts: readonly unknown[]) =>
    ['facility', facilityId ?? 'none', ...parts] as const,
};
