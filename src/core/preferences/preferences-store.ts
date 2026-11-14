import { useSyncExternalStore } from 'react';

/**
 * Préférences d'interface de l'utilisateur (langue, thème, densité, établissement actif...).
 *
 * - Stockage local temporaire (localStorage), conçu pour être synchronisé plus tard avec CERO ID CORE.
 * - Ne contient JAMAIS de donnée médicale, de token ni d'identifiant personnel.
 * - `activeFacilityId` n'est qu'une préférence d'affichage : l'API revérifie toujours que
 *   l'utilisateur a bien accès à l'établissement demandé.
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';

export interface NotificationPreferences {
  inApp: boolean;
  sound: boolean;
}

export interface Preferences {
  version: 1;
  /** null = détection automatique (navigateur). */
  language: string | null;
  theme: ThemeMode;
  density: Density;
  sidebarCollapsed: boolean;
  activeFacilityId: string | null;
  notifications: NotificationPreferences;
}

export const PREFERENCES_STORAGE_KEY = 'cero-health:preferences';

export const DEFAULT_PREFERENCES: Preferences = {
  version: 1,
  language: null,
  theme: 'system',
  density: 'comfortable',
  sidebarCollapsed: false,
  activeFacilityId: null,
  notifications: { inApp: true, sound: false },
};

const THEMES: readonly ThemeMode[] = ['light', 'dark', 'system'];
const DENSITIES: readonly Density[] = ['comfortable', 'compact'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Valide chaque champ : une valeur absente ou invalide retombe sur la valeur par défaut. */
export function sanitizePreferences(raw: unknown): Preferences {
  if (!isRecord(raw)) return { ...DEFAULT_PREFERENCES };
  const notifications = isRecord(raw.notifications) ? raw.notifications : {};
  return {
    version: 1,
    language:
      typeof raw.language === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(raw.language)
        ? raw.language
        : DEFAULT_PREFERENCES.language,
    theme: THEMES.includes(raw.theme as ThemeMode)
      ? (raw.theme as ThemeMode)
      : DEFAULT_PREFERENCES.theme,
    density: DENSITIES.includes(raw.density as Density)
      ? (raw.density as Density)
      : DEFAULT_PREFERENCES.density,
    sidebarCollapsed:
      typeof raw.sidebarCollapsed === 'boolean'
        ? raw.sidebarCollapsed
        : DEFAULT_PREFERENCES.sidebarCollapsed,
    activeFacilityId:
      typeof raw.activeFacilityId === 'string' && raw.activeFacilityId.length > 0
        ? raw.activeFacilityId
        : DEFAULT_PREFERENCES.activeFacilityId,
    notifications: {
      inApp:
        typeof notifications.inApp === 'boolean'
          ? notifications.inApp
          : DEFAULT_PREFERENCES.notifications.inApp,
      sound:
        typeof notifications.sound === 'boolean'
          ? notifications.sound
          : DEFAULT_PREFERENCES.notifications.sound,
    },
  };
}

function readFromStorage(): Preferences {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    return sanitizePreferences(raw ? JSON.parse(raw) : null);
  } catch {
    // Stockage indisponible (navigation privée, quota...) ou JSON corrompu.
    return { ...DEFAULT_PREFERENCES };
  }
}

function writeToStorage(value: Preferences): void {
  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Les préférences restent valables pour la session en mémoire.
  }
}

type Listener = () => void;

let state: Preferences = readFromStorage();
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export const preferencesStore = {
  getSnapshot: (): Preferences => state,

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  set(patch: Partial<Omit<Preferences, 'version'>>): void {
    state = sanitizePreferences({ ...state, ...patch });
    writeToStorage(state);
    emit();
  },

  /** Relit le stockage (autre onglet, tests). */
  reload(): void {
    state = readFromStorage();
    emit();
  },

  reset(): void {
    state = { ...DEFAULT_PREFERENCES };
    writeToStorage(state);
    emit();
  },
};

// Synchronisation entre onglets.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === PREFERENCES_STORAGE_KEY) preferencesStore.reload();
  });
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    preferencesStore.subscribe,
    preferencesStore.getSnapshot,
    preferencesStore.getSnapshot,
  );
}
