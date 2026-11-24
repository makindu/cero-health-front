import type { AxiosInstance } from 'axios';
import { markReachable, markUnreachable } from '@/core/connectivity/connectivity';
import { toApiError } from '../errors';
import { sessionEvents } from '../session-events';
import type { ApiSource } from '../types';

/**
 * Convertit toute erreur en ApiError normalisée et signale les sessions expirées.
 * Rien n'est écrit dans la console : ni en-têtes, ni jetons, ni corps de requête.
 */
export function installErrorInterceptor(instance: AxiosInstance, source: ApiSource): void {
  instance.interceptors.response.use(
    (response) => {
      markReachable(source); // le serveur a répondu : la connexion fonctionne
      return response;
    },
    (error: unknown) => {
      const apiError = toApiError(error, source);
      // aucune réponse du serveur = injoignable ; toute autre erreur (401, 422, 500…) prouve que le serveur répond
      if (apiError.kind === 'network') markUnreachable(source);
      else if (apiError.status !== undefined) markReachable(source);
      const skip = (error as { config?: { skipSessionEvents?: boolean } })?.config?.skipSessionEvents;
      if (!skip) {
        if (apiError.kind === 'unauthorized') sessionEvents.emit({ type: 'unauthorized', source });
        if (apiError.kind === 'csrf') sessionEvents.emit({ type: 'csrf-expired', source });
      }
      return Promise.reject(apiError);
    },
  );
}
