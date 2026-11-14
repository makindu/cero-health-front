/** Les trois backends avec lesquels CERO HEALTH communique. */
export type ApiSource = 'id-core' | 'uzisha' | 'health';

export type ApiErrorKind =
  | 'config'
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'csrf'
  | 'validation'
  | 'conflict'
  | 'rate_limited'
  | 'server'
  | 'unknown';

export interface ApiErrorDetails {
  source: ApiSource;
  status?: number;
  /** Code applicatif renvoyé par l'API, s'il existe. */
  code?: string;
  /** Erreurs de validation par champ (format Laravel : { champ: [messages] }). */
  fieldErrors?: Record<string, string[]>;
  /** Identifiant de requête (en-tête x-request-id) à communiquer au support. */
  requestId?: string;
}

/**
 * Erreur normalisée, identique quel que soit le backend.
 * Ne contient jamais d'en-têtes, de token ni de corps de requête.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly source: ApiSource;
  readonly status?: number;
  readonly code?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly requestId?: string;

  constructor(kind: ApiErrorKind, message: string, details: ApiErrorDetails) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.source = details.source;
    this.status = details.status;
    this.code = details.code;
    this.fieldErrors = details.fieldErrors;
    this.requestId = details.requestId;
  }
}

export interface PageMeta {
  page: number;
  perPage: number;
  total: number;
  lastPage: number;
}

/** Résultat normalisé d'un appel, quel que soit le format de réponse du backend. */
export interface ApiResult<T> {
  data: T;
  message?: string;
  meta?: PageMeta | null;
}
