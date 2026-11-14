import type { AxiosInstance } from 'axios';
import { getAuthStrategy } from '../auth-strategies';
import { ApiError, type ApiSource } from '../types';

export interface RequestInterceptorOptions {
  source: ApiSource;
  /** En-têtes propres au backend, évalués à chaque requête (valeurs vides ignorées). */
  headers?: () => Record<string, string | undefined>;
}

/**
 * Prépare chaque requête : refuse si l'API n'est pas configurée, ajoute les en-têtes
 * propres au backend, puis applique la stratégie d'authentification de CE backend.
 */
export function installRequestInterceptor(
  instance: AxiosInstance,
  { source, headers }: RequestInterceptorOptions,
): void {
  instance.interceptors.request.use(async (config) => {
    if (!config.baseURL) {
      throw new ApiError('config', `API "${source}" is not configured (missing base URL).`, {
        source,
      });
    }
    for (const [name, value] of Object.entries(headers?.() ?? {})) {
      if (value) config.headers.set(name, value);
    }
    await getAuthStrategy(source).apply(config);
    return config;
  });
}
