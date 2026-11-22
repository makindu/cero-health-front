import { healthClient } from '@/core/api';
import { requestDesktop } from './chat-alerts';

/**
 * Notifications « Web Push » : l'appareil est réveillé même application fermée.
 * Le service worker (public/sw.js) affiche seulement l'expéditeur ; il ne montre rien si l'application est déjà sous les yeux.
 */
export const pushSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof globalThis.PushManager !== 'undefined' && typeof Notification !== 'undefined';

/** Clé publique du serveur (base64 « URL-safe ») → octets, au format attendu par le navigateur. */
export function keyToBytes(key: string): Uint8Array {
  const padded = (key + '='.repeat((4 - (key.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export interface PushConfig { enabled: boolean; publicKey: string | null }

export async function pushConfig(): Promise<PushConfig> {
  try {
    const res = await healthClient.get<{ enabled?: boolean; public_key?: string | null }>('/push/config');
    const d = (res.data ?? {}) as { enabled?: boolean; public_key?: string | null };
    return { enabled: d.enabled === true && Boolean(d.public_key), publicKey: d.public_key ?? null };
  } catch { return { enabled: false, publicKey: null }; }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try { return (await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()) ?? null; } catch { return null; }
}

export type EnableResult = 'ok' | 'denied' | 'unavailable' | 'failed';

/** Active les notifications sur CET appareil : autorisation du navigateur, service worker, abonnement, enregistrement côté serveur. */
export async function enablePush(): Promise<EnableResult> {
  if (!pushSupported()) return 'unavailable';
  const cfg = await pushConfig();
  if (!cfg.enabled || !cfg.publicKey) return 'unavailable';
  if (!(await requestDesktop())) return 'denied';
  try {
    const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(cfg.publicKey).buffer as ArrayBuffer }));
    await healthClient.post('/push/subscriptions', sub.toJSON());
    return 'ok';
  } catch { return 'failed'; }
}

/** Coupe les notifications sur cet appareil : désabonnement côté navigateur puis côté serveur. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  try { await healthClient.post('/push/unsubscribe', { endpoint: sub.endpoint }); } catch { /* le serveur nettoiera l'abonnement expiré */ }
  try { await sub.unsubscribe(); } catch { /* sans effet */ }
}

// --- Lien « ouvrir cette discussion » (clic sur une notification alors que l'application est fermée) ------------------
// La connexion redirige vers CERO ID puis revient : la partie « #chat=ID » de l'adresse serait perdue. On la met donc de côté
// (stockage de l'onglet, comme la session) dès le démarrage, et la messagerie la reprend une fois connecté.
const PENDING_KEY = 'cero-health.chat-pending';

/** À appeler au tout début : retient « #chat=ID » puis nettoie l'adresse. */
export function rememberChatLink(): void {
  try {
    const m = /^#chat=([^&]+)$/.exec(globalThis.location?.hash ?? '');
    if (!m) return;
    globalThis.sessionStorage?.setItem(PENDING_KEY, decodeURIComponent(m[1]));
    globalThis.history?.replaceState(null, '', globalThis.location.pathname + globalThis.location.search);
  } catch { /* stockage indisponible : le lien est simplement ignoré */ }
}

/** Rend la discussion à ouvrir (une seule fois) ou null. */
export function takeChatLink(): string | null {
  try {
    const v = globalThis.sessionStorage?.getItem(PENDING_KEY) ?? null;
    if (v !== null) globalThis.sessionStorage?.removeItem(PENDING_KEY);
    return v && v.length <= 64 ? v : null;
  } catch { return null; }
}

