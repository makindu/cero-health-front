import { z } from 'zod';

/**
 * Configuration publique du frontend (variables VITE_*).
 * Ne contient AUCUN secret : tout ce qui est préfixé VITE_ est visible dans le navigateur.
 * Une valeur invalide ne bloque pas l'application : elle est ignorée (avertissement sans la valeur).
 */

const optionalUrl = z
  .string()
  .trim()
  .transform((value) => value.replace(/\/+$/, ''))
  .pipe(z.string().url())
  .optional();

const booleanFlag = z.enum(['true', 'false']).optional();

const schema = z.object({
  VITE_APP_NAME: z.string().trim().min(1).optional(),
  VITE_APP_CODE: z.string().trim().min(1).optional(),
  VITE_ID_CORE_API_URL: optionalUrl,
  VITE_ID_CORE_CLIENT_ID: z.string().trim().min(1).optional(),
  VITE_UZISHA_API_URL: optionalUrl,
  VITE_HEALTH_API_URL: optionalUrl,
  VITE_API_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).optional(),
  VITE_PREVIEW_MODE: booleanFlag,
  VITE_LOCAL_MODE: booleanFlag,
  VITE_ENABLE_DESIGN_SYSTEM: booleanFlag,
});

export interface AppEnv {
  appName: string;
  /** Code de l'application dans le registre CERO ID. */
  appCode: string;
  apiTimeoutMs: number;
  /** URL de base de chaque API ; null = non configurée. */
  api: { idCore: string | null; uzisha: string | null; health: string | null };
  /** Interface sans connexion, permissions non appliquées (développement / démonstration). */
  previewMode: boolean;
  /** Mode local : données persistantes sur CET appareil (IndexedDB), aucune requête vers les API. */
  localMode: boolean;
  /** Identifiant (public) du client OAuth de HEALTH dans CERO CEPATEC ; null = connexion non configurée. */
  idCoreClientId: string | null;
  /** Connexion réelle via CERO CEPATEC (adresse de l'API + identifiant du client, hors mode local). */
  ssoEnabled: boolean;
  designSystemEnabled: boolean;
  isDev: boolean;
}

type RawEnv = Record<string, unknown>;

export function parseEnv(raw: RawEnv, isDev: boolean): AppEnv {
  // Chaque clé est validée séparément : une clé invalide n'invalide pas les autres.
  const valid: Record<string, unknown> = {};
  const invalidKeys: string[] = [];
  for (const key of Object.keys(schema.shape) as (keyof typeof schema.shape)[]) {
    const value = raw[key];
    if (value === undefined || value === '') continue;
    const result = schema.shape[key].safeParse(value);
    if (result.success) valid[key] = result.data;
    else invalidKeys.push(key);
  }
  if (invalidKeys.length > 0) {
    // On ne journalise jamais les valeurs, seulement les noms des variables invalides.
    console.warn(`[config] Variables d'environnement invalides (ignorées) : ${invalidKeys.join(', ')}`);
  }

  const get = <T>(key: string): T | undefined => valid[key] as T | undefined;

  const idCoreUrl = get<string>('VITE_ID_CORE_API_URL') ?? null;
  const clientId = get<string>('VITE_ID_CORE_CLIENT_ID') ?? null;
  const localMode = get<string>('VITE_LOCAL_MODE') === 'true';

  return {
    appName: get<string>('VITE_APP_NAME') ?? 'CERO HEALTH',
    appCode: get<string>('VITE_APP_CODE') ?? 'cero-health',
    apiTimeoutMs: get<number>('VITE_API_TIMEOUT_MS') ?? 20000,
    api: {
      idCore: get<string>('VITE_ID_CORE_API_URL') ?? null,
      uzisha: get<string>('VITE_UZISHA_API_URL') ?? null,
      health: get<string>('VITE_HEALTH_API_URL') ?? null,
    },
    previewMode: get<string>('VITE_PREVIEW_MODE') === 'true',
    localMode,
    idCoreClientId: clientId,
    ssoEnabled: !localMode && Boolean(idCoreUrl && clientId),
    designSystemEnabled: get<string>('VITE_ENABLE_DESIGN_SYSTEM')
      ? get<string>('VITE_ENABLE_DESIGN_SYSTEM') === 'true'
      : isDev,
    isDev,
  };
}

export const env: AppEnv = parseEnv(
  import.meta.env as unknown as RawEnv,
  import.meta.env.DEV,
);
