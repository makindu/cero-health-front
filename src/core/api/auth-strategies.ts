import axios, { type InternalAxiosRequestConfig } from 'axios';
import type { ApiSource } from './types';

/**
 * Stratégie d'authentification d'un client HTTP.
 * Chaque backend a la sienne : on ne suppose JAMAIS qu'un même jeton est accepté par toutes les API.
 * La stratégie réellement utilisée par CERO ID CORE sera enregistrée en phase 2, une fois son contrat confirmé
 * (voir docs/CERO_ID_CORE_QUESTIONS.md).
 */
export interface AuthStrategy {
  readonly name: string;
  apply(config: InternalAxiosRequestConfig): void | Promise<void>;
}

/** Aucune authentification (valeur par défaut tant qu'aucune stratégie n'est enregistrée). */
export const noAuth: AuthStrategy = { name: 'none', apply: () => undefined };

/**
 * Jeton « Bearer ». Le jeton doit être fourni par une fonction (mémoire du module d'authentification),
 * jamais copié dans le code, les logs ou la console.
 */
export function bearerTokenAuth(getToken: () => string | null): AuthStrategy {
  return {
    name: 'bearer',
    apply(config) {
      const token = getToken();
      if (token) config.headers.set('Authorization', `Bearer ${token}`);
    },
  };
}

export interface CookieSessionOptions {
  /** URL (absolue) d'initialisation du cookie CSRF, ex. celle de Laravel Sanctum. À confirmer. */
  csrfCookieUrl?: string;
}

/**
 * Session par cookies sécurisés + protection CSRF (SPA hébergée sur le même domaine principal
 * que l'API, cas décrit par le cahier des charges technique CERO PLATFORM §5.3).
 */
export function cookieSessionAuth(options: CookieSessionOptions = {}): AuthStrategy {
  let csrfReady = false;
  return {
    name: 'cookie-session',
    async apply(config) {
      config.withCredentials = true;
      config.withXSRFToken = true;
      const method = (config.method ?? 'get').toLowerCase();
      const mutating = method !== 'get' && method !== 'head' && method !== 'options';
      if (mutating && options.csrfCookieUrl && !csrfReady) {
        await axios.get(options.csrfCookieUrl, { withCredentials: true });
        csrfReady = true;
      }
    },
  };
}

const registry = new Map<ApiSource, AuthStrategy>();

/** Enregistre la stratégie d'un backend (appelé par le module d'authentification). */
export function registerAuthStrategy(source: ApiSource, strategy: AuthStrategy): void {
  registry.set(source, strategy);
}

export function getAuthStrategy(source: ApiSource): AuthStrategy {
  return registry.get(source) ?? noAuth;
}

export function resetAuthStrategies(): void {
  registry.clear();
}
