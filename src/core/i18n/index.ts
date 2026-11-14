import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { preferencesStore } from '@/core/preferences/preferences-store';

/**
 * Internationalisation (i18next + react-i18next).
 *
 * Les traductions sont découvertes automatiquement : src/locales/<langue>/<espace-de-noms>.json.
 * Ajouter une langue = ajouter un dossier (avec un common.json contenant "meta"), sans toucher au code.
 * La langue par défaut est le français ; le choix de l'utilisateur est mémorisé (préférences).
 */

type Bundle = Record<string, unknown>;

const modules = import.meta.glob<Bundle>('../../locales/*/*.json', {
  eager: true,
  import: 'default',
});

const resources: Record<string, Record<string, Bundle>> = {};
for (const [path, bundle] of Object.entries(modules)) {
  const match = /locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
  if (!match) continue;
  const [, language, namespace] = match as unknown as [string, string, string];
  (resources[language] ??= {})[namespace] = bundle;
}

export const DEFAULT_LANGUAGE = 'fr';

export interface LanguageInfo {
  code: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
}

export const availableLanguages: LanguageInfo[] = Object.entries(resources)
  .map(([code, namespaces]) => {
    const meta = (namespaces.common?.meta ?? {}) as { nativeName?: string; direction?: string };
    return {
      code,
      nativeName: meta.nativeName ?? code,
      direction: (meta.direction === 'rtl' ? 'rtl' : 'ltr') as 'ltr' | 'rtl',
    };
  })
  .sort((a, b) =>
    a.code === DEFAULT_LANGUAGE ? -1 : b.code === DEFAULT_LANGUAGE ? 1 : a.code.localeCompare(b.code),
  );

const supportedCodes = new Set(availableLanguages.map((language) => language.code));

function toSupported(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  if (supportedCodes.has(candidate)) return candidate;
  const base = candidate.split('-')[0]?.toLowerCase();
  return base && supportedCodes.has(base) ? base : null;
}

/** Préférence enregistrée > langue du navigateur > français. */
export function detectLanguage(): string {
  const stored = toSupported(preferencesStore.getSnapshot().language);
  if (stored) return stored;
  const browser = typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : [];
  for (const candidate of browser) {
    const supported = toSupported(candidate);
    if (supported) return supported;
  }
  return DEFAULT_LANGUAGE;
}

function syncDocument(language: string): void {
  const info = availableLanguages.find((item) => item.code === language);
  document.documentElement.lang = language;
  document.documentElement.dir = info?.direction ?? 'ltr';
}

let initialised: Promise<void> | null = null;

export function initI18n(): Promise<void> {
  initialised ??= i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: detectLanguage(),
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: Object.keys(resources),
      defaultNS: 'common',
      fallbackNS: 'common',
      ns: Object.keys(resources[DEFAULT_LANGUAGE] ?? {}),
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
    .then(() => {
      syncDocument(i18n.language);
      i18n.on('languageChanged', syncDocument);
    });
  return initialised;
}

/** Change la langue sans rechargement et mémorise le choix. */
export async function setLanguage(code: string): Promise<void> {
  const supported = toSupported(code);
  if (!supported) return;
  preferencesStore.set({ language: supported });
  await i18n.changeLanguage(supported);
}

export { i18n };
