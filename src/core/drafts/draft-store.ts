/**
 * Brouillons locaux : sauvegarde automatique de ce que l'utilisateur est en train de saisir, pour ne rien
 * perdre en cas de coupure de courant, de rechargement ou de fermeture involontaire (fonctionne hors ligne).
 * Stockage : localStorage de l'appareil ; chaque brouillon expire (7 jours par défaut).
 */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = 'cero.draft.v1.';
export const DRAFT_TTL_MS = 7 * 24 * 3600 * 1000;

function defaultStorage(): DraftStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function saveDraft(
  key: string,
  value: unknown,
  storage: DraftStorage | null = defaultStorage(),
  now: number = Date.now(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PREFIX + key, JSON.stringify({ at: now, value }));
    return true;
  } catch {
    return false; // stockage plein ou refusé : on continue sans brouillon
  }
}

export function loadDraft<T>(
  key: string,
  storage: DraftStorage | null = defaultStorage(),
  now: number = Date.now(),
  ttlMs: number = DRAFT_TTL_MS,
): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; value?: T };
    if (typeof parsed.at !== 'number' || now - parsed.at > ttlMs || parsed.value === undefined) {
      storage.removeItem(PREFIX + key);
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

export function clearDraft(key: string, storage: DraftStorage | null = defaultStorage()): void {
  try {
    storage?.removeItem(PREFIX + key);
  } catch {
    /* sans effet */
  }
}

/** Empreinte courte et stable d'une valeur (distingue le brouillon d'une fiche de celui d'une autre). */
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value) ?? '';
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}
