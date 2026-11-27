import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiContext } from '@/core/api/api-context';
import { registerAuthStrategy, type AuthStrategy } from '@/core/api/auth-strategies';
import { sessionEvents } from '@/core/api/session-events';
import { env } from '@/core/config/env';
import { preferencesStore } from '@/core/preferences/preferences-store';
import { challengeFor, randomString } from './pkce';
import { toUiPermissions } from './permission-map';

/**
 * Connexion à CERO CEPATEC (Authorization Code + PKCE, client public).
 * Les jetons restent dans sessionStorage (effacés à la fermeture de l'onglet), jamais dans le code ni les journaux.
 */

type Status = 'loading' | 'anonymous' | 'authenticated';

interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface Facility {
  id: number;
  name: string;
  allowed: boolean;
  /** Raison du refus renvoyée par le serveur (abonnement, affectation…). */
  reason: string | null;
  /** Permissions déjà traduites en codes de l'interface. */
  permissions: string[];
}

export interface SessionUser {
  id: number;
  name: string;
  userName: string;
  avatar: string | null;
}

interface AuthValue {
  status: Status;
  user: SessionUser | null;
  facilities: Facility[];
  activeFacility: Facility | null;
  permissions: readonly string[];
  login: (returnTo?: string) => Promise<void>;
  completeLogin: (code: string, state: string) => Promise<string>;
  logout: () => Promise<void>;
  selectFacility: (id: number) => void;
}

const TOKEN_KEY = 'cero-health:tokens';
const PKCE_KEY = 'cero-health:pkce';
const FACILITY_KEY = 'cero-health:facility';
const SCOPES = 'openid profile email enterprises';

export const OAUTH_CALLBACK_PATH = '/auth/callback';
const redirectUri = () => `${window.location.origin}${OAUTH_CALLBACK_PATH}`;
const apiUrl = () => env.api.idCore ?? '';

function get(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}
function set(storage: Storage, key: string, value: string | null): void {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    /* stockage indisponible : la session ne survivra pas à un rechargement */
  }
}

let tokens: Tokens | null = (() => {
  const raw = get(window.sessionStorage, TOKEN_KEY);
  try {
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
})();

function setTokens(value: Tokens | null): void {
  tokens = value;
  set(window.sessionStorage, TOKEN_KEY, value ? JSON.stringify(value) : null);
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const response = await fetch(`${apiUrl()}/oauth/token`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: new URLSearchParams({ client_id: env.idCoreClientId ?? '', ...params }),
  });
  const body = (await response.json().catch(() => null)) as TokenResponse | null;
  if (!response.ok || !body?.access_token) throw new Error('Échec de l’authentification.');
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? '',
    expires_at: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
}

let refreshing: Promise<boolean> | null = null;
function refresh(): Promise<boolean> {
  if (!tokens?.refresh_token) return Promise.resolve(false);
  refreshing ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token })
    .then((fresh) => {
      setTokens(fresh);
      return true;
    })
    .catch(() => {
      setTokens(null);
      return false;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Appel authentifié vers CERO CEPATEC, avec un renouvellement automatique du jeton. */
async function coreFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  if (tokens && tokens.expires_at - Date.now() < 30_000) await refresh();
  const response = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(tokens ? { Authorization: `Bearer ${tokens.access_token}` } : {}) },
  });
  if (response.status === 401 && retry && (await refresh())) return coreFetch<T>(path, init, false);
  if (!response.ok) throw new Error(String(response.status));
  const body = (await response.json()) as { data: T };
  return body.data;
}

interface MeResponse {
  user: { id: number; user_name: string; full_name: string | null; avatar?: string | null };
  enterprises?: {
    id?: number;
    enterprise_id?: number;
    name?: string;
    access?: { allowed?: boolean; reason?: string | null; message?: string | null } | null;
    permissions?: string[];
  }[];
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(tokens ? 'loading' : 'anonymous');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [activeId, setActiveId] = useState<number | null>(() => {
    const raw = get(window.localStorage, FACILITY_KEY);
    return raw ? Number(raw) : null;
  });

  const loadMe = useCallback(async () => {
    const me = await coreFetch<MeResponse>('/api/v1/auth/me');
    setUser({
      id: me.user.id,
      name: me.user.full_name || me.user.user_name,
      userName: me.user.user_name,
      avatar: me.user.avatar ? (me.user.avatar.startsWith('http') ? me.user.avatar : `${apiUrl()}${me.user.avatar}`) : null,
    });
    setFacilities(
      (me.enterprises ?? []).map((e) => ({
        id: Number(e.id ?? e.enterprise_id ?? 0),
        name: e.name ?? '—',
        allowed: Boolean(e.access?.allowed),
        reason: e.access?.message ?? e.access?.reason ?? null,
        permissions: toUiPermissions(e.permissions ?? []),
      })),
    );
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    if (!tokens) return;
    loadMe().catch(() => {
      setTokens(null);
      setStatus('anonymous');
    });
  }, [loadMe]);

  const login = useCallback(async (returnTo = '/') => {
    const verifier = randomString(48);
    const state = randomString(24);
    set(window.sessionStorage, PKCE_KEY, JSON.stringify({ verifier, state, returnTo }));
    const params = new URLSearchParams({
      client_id: env.idCoreClientId ?? '',
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: SCOPES,
      state,
      code_challenge: await challengeFor(verifier),
      code_challenge_method: 'S256',
    });
    window.location.assign(`${apiUrl()}/oauth/authorize?${params.toString()}`);
  }, []);

  const completeLogin = useCallback(
    async (code: string, state: string) => {
      const raw = get(window.sessionStorage, PKCE_KEY);
      set(window.sessionStorage, PKCE_KEY, null);
      const pkce = raw ? (JSON.parse(raw) as { verifier: string; state: string; returnTo: string }) : null;
      if (!pkce || pkce.state !== state) throw new Error('Session de connexion invalide ou expirée. Recommencez.');
      setTokens(await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: pkce.verifier, redirect_uri: redirectUri() }));
      await loadMe();
      return pkce.returnTo || '/';
    },
    [loadMe],
  );

  /** Ferme la session locale : jeton révoqué côté serveur, puis effacé ici. N'ouvre pas de redirection. */
  const clearSession = useCallback(async () => {
    try {
      await coreFetch('/api/v1/auth/logout', { method: 'POST' }, false);
    } catch {
      /* jeton peut-être déjà expiré */
    }
    setTokens(null);
    setUser(null);
    setFacilities([]);
    setStatus('anonymous');
  }, []);

  /**
   * Déconnexion demandée par l'utilisateur : en plus du jeton, on ferme la session du portail CERO ID (déconnexion unique),
   * sinon un rafraîchissement relancerait la connexion et rouvrirait la session sans rien demander.
   */
  const logout = useCallback(async () => {
    await clearSession();
    const params = new URLSearchParams({ client_id: env.idCoreClientId ?? '', post_logout_redirect_uri: `${window.location.origin}/` });
    window.location.assign(`${apiUrl()}/oauth/logout?${params.toString()}`);
  }, [clearSession]);

  // Une réponse 401 de l'API de HEALTH = jeton refusé par CERO CEPATEC : session locale effacée, la connexion reprend (sans fermer le portail).
  useEffect(
    () =>
      sessionEvents.subscribe((event) => {
        if (event.type === 'unauthorized' && event.source === 'health') void clearSession();
      }),
    [clearSession],
  );

  const selectFacility = useCallback((id: number) => {
    // Synchrone, avant le rendu suivant : l'en-tête X-Enterprise-Id et les clés de cache changent en même temps,
    // sinon une requête partirait avec l'ancien établissement ou serait rangée sous l'ancienne clé.
    apiContext.set({ facilityId: String(id) });
    preferencesStore.set({ activeFacilityId: String(id) });
    setActiveId(id);
    set(window.localStorage, FACILITY_KEY, String(id));
  }, []);

  const activeFacility = useMemo(() => {
    const allowed = facilities.filter((f) => f.allowed);
    return allowed.find((f) => f.id === activeId) ?? allowed[0] ?? null;
  }, [facilities, activeId]);

  // L'API de HEALTH reçoit l'établissement actif dans X-Enterprise-Id.
  useEffect(() => {
    const id = activeFacility ? String(activeFacility.id) : null;
    apiContext.set({ facilityId: id });
    // Les clés de cache (queryKeys.scoped) lisent cette préférence : elle doit toujours suivre l'établissement actif.
    preferencesStore.set({ activeFacilityId: id });
  }, [activeFacility]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      facilities,
      activeFacility,
      permissions: activeFacility?.permissions ?? [],
      login,
      completeLogin,
      logout,
      selectFacility,
    }),
    [status, user, facilities, activeFacility, login, completeLogin, logout, selectFacility],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return ctx;
}

/** Jeton courant (jamais à journaliser). */
export function getAccessToken(): string | null {
  return tokens?.access_token ?? null;
}

/** Stratégie du client HTTP de HEALTH : jeton « Bearer » renouvelé avant son expiration. */
const healthAuth: AuthStrategy = {
  name: 'cero-bearer',
  async apply(config) {
    if (tokens && tokens.expires_at - Date.now() < 30_000) await refresh();
    if (tokens) config.headers.set('Authorization', `Bearer ${tokens.access_token}`);
  },
};
registerAuthStrategy('health', healthAuth);
