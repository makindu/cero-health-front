import { fingerprint } from '@/core/drafts/draft-store';

/**
 * Création sans doublon : une demande de création garde la MÊME clé d'idempotence tant que le serveur n'a pas répondu
 * (double clic, nouvel essai après une coupure, rechargement de la page). Dès qu'il répond, la clé est oubliée : la demande
 * suivante est une vraie nouvelle création. Seules les routes de création du serveur qui acceptent la clé sont concernées.
 */
const CREATE_PATHS = /^\/?(patients|appointments|appointments\/walk-in|triage-entries|consultations|prescriptions|lab-orders|admissions)$/;
const PREFIX = 'cero.idem.v1.';
/** Au-delà, un nouvel essai repart avec une nouvelle clé (le serveur garde les siennes 2 jours). */
export const PENDING_TTL_MS = 10 * 60 * 1000;

export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memory = new Map<string, string>();
const memoryStorage: KeyStorage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
};

function defaultStorage(): KeyStorage {
  try {
    return globalThis.sessionStorage ?? memoryStorage;
  } catch {
    return memoryStorage;
  }
}

export function isIdempotentCreate(method: string | undefined, url: string | undefined): boolean {
  return (method ?? 'get').toLowerCase() === 'post' && CREATE_PATHS.test((url ?? '').split('?')[0] ?? '');
}

function newKey(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return c?.randomUUID ? c.randomUUID() : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Empreinte de la demande : établissement + chemin + contenu (longueur et deux empreintes pour éviter les collisions). */
export function requestId(scope: string, url: string, data: unknown): string {
  const text = `${scope}|${url}|${JSON.stringify(data) ?? ''}`;
  return `${fingerprint(text)}${fingerprint([...text].reverse().join(''))}${text.length.toString(36)}`;
}

/** Clé à envoyer : celle d'une demande identique encore sans réponse, sinon une nouvelle. */
export function pendingKey(id: string, storage: KeyStorage = defaultStorage(), now: number = Date.now()): string {
  try {
    const raw = storage.getItem(PREFIX + id);
    if (raw) {
      const saved = JSON.parse(raw) as { k?: string; at?: number };
      if (typeof saved.k === 'string' && typeof saved.at === 'number' && now - saved.at <= PENDING_TTL_MS) return saved.k;
    }
  } catch {
    /* clé illisible : on en crée une nouvelle */
  }
  const key = newKey();
  try {
    storage.setItem(PREFIX + id, JSON.stringify({ k: key, at: now }));
  } catch {
    /* stockage plein ou refusé : la clé reste valable pour cet envoi */
  }
  return key;
}

/** Le serveur a répondu : la demande suivante sera une nouvelle création. */
export function releaseKey(id: string, storage: KeyStorage = defaultStorage()): void {
  try {
    storage.removeItem(PREFIX + id);
  } catch {
    /* sans effet */
  }
}

/** Faut-il garder la clé après cette erreur ? Oui sans réponse du serveur, ou s'il traite encore la même clé. */
export function keepKeyAfter(error: { status?: number; code?: string } | null | undefined): boolean {
  if (!error || error.status === undefined) return true;
  return error.code === 'health.idempotency.in_progress';
}
