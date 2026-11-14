import type { AxiosInstance } from 'axios';
import { toApiError } from '../errors';
import { sessionEvents } from '../session-events';
import type { ApiSource } from '../types';

/**
 * Convertit toute erreur en ApiError normalisée et signale les sessions expirées.
 * Rien n'est écrit dans la console : ni en-têtes, ni jetons, ni corps de requête.
 */
export function installErrorInterceptor(instance: AxiosInstance, source: ApiSource): void {
  instance.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      const apiError = toApiError(error, source);
      const skip = (error as { config?: { skipSessionEvents?: boolean } })?.config?.skipSessionEvents;
      if (!skip) {
        if (apiError.kind === 'unauthorized') sessionEvents.emit({ type: 'unauthorized', source });
        if (apiError.kind === 'csrf') sessionEvents.emit({ type: 'csrf-expired', source });
      }
      return Promise.reject(apiError);
    },
  );
}
