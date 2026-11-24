import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { installErrorInterceptor } from './interceptors/error-interceptor';
import { installRequestInterceptor } from './interceptors/request-interceptor';
import { isIdempotentCreate, keepKeyAfter, pendingKey, releaseKey, requestId } from './idempotency';
import type { ResponseNormalizer } from './normalizers';
import type { ApiResult, ApiSource } from './types';

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * Ne pas signaler la session comme expirée sur 401/419 pour cette requête
     * (ex. : un échec de connexion n'est pas une session expirée).
     */
    skipSessionEvents?: boolean;
  }
}

export interface ApiClientOptions {
  source: ApiSource;
  /** URL de base ; null = API non configurée (les requêtes échouent avec une erreur « config »). */
  baseURL: string | null;
  timeoutMs: number;
  normalize: ResponseNormalizer;
  headers?: () => Record<string, string | undefined>;
}

export interface ApiClient {
  readonly source: ApiSource;
  /** Instance Axios sous-jacente (tests, cas particuliers). Préférer les méthodes ci-dessous. */
  readonly raw: AxiosInstance;
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<ApiResult<T>>;
  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResult<T>>;
  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResult<T>>;
  patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResult<T>>;
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<ApiResult<T>>;
}

/**
 * Fabrique un client HTTP indépendant : sa propre URL, ses propres intercepteurs, sa propre
 * stratégie d'authentification et son propre normaliseur de réponses.
 * Les composants React ne l'utilisent jamais directement : ils passent par des services métier.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const { source, baseURL, timeoutMs, normalize, headers } = options;

  const instance = axios.create({
    baseURL: baseURL ?? undefined,
    timeout: timeoutMs,
    headers: { Accept: 'application/json' },
  });

  installRequestInterceptor(instance, { source, headers });
  installErrorInterceptor(instance, source);

  async function send<T>(config: AxiosRequestConfig): Promise<ApiResult<T>> {
    // Création sans doublon (HEALTH) : même demande sans réponse du serveur = même clé d'idempotence.
    const rid = source === 'health' && isIdempotentCreate(config.method, config.url) && !(config.headers as Record<string, unknown> | undefined)?.['Idempotency-Key']
      ? requestId(headers?.()['X-Enterprise-Id'] ?? '', config.url ?? '', config.data)
      : null;
    const withKey = rid ? { ...config, headers: { ...(config.headers as object | undefined), 'Idempotency-Key': pendingKey(rid) } } : config;
    let response;
    try {
      response = await instance.request<unknown>(withKey);
    } catch (error) {
      if (rid && !keepKeyAfter(error as { status?: number; code?: string })) releaseKey(rid);
      throw error;
    }
    if (rid) releaseKey(rid);
    return normalize(response.data, { source, status: response.status }) as ApiResult<T>;
  }

  return {
    source,
    raw: instance,
    get: (url, config) => send({ ...config, url, method: 'GET' }),
    post: (url, data, config) => send({ ...config, url, data, method: 'POST' }),
    put: (url, data, config) => send({ ...config, url, data, method: 'PUT' }),
    patch: (url, data, config) => send({ ...config, url, data, method: 'PATCH' }),
    delete: (url, config) => send({ ...config, url, method: 'DELETE' }),
  };
}
