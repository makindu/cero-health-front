import type { ConversationSummary } from './messaging-rules';

/**
 * Alertes de la messagerie : son, notification du navigateur, compteur dans le titre de l'onglet.
 * Rien ne passe par un serveur ici : tout part de la liste des conversations déjà relue (signal temps réel ou actualisation).
 * La notification ne montre jamais le texte du message (écran verrouillé, partage d'écran) : seulement l'expéditeur.
 */
const KEY = 'cero-health.chat-alerts';

export interface AlertPrefs { sound: boolean; desktop: boolean }
const DEFAULTS: AlertPrefs = { sound: true, desktop: false };

export function loadPrefs(): AlertPrefs {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as Partial<AlertPrefs> | null;
    if (raw && typeof raw === 'object') return { sound: raw.sound !== false, desktop: raw.desktop === true };
  } catch { /* stockage indisponible : réglages par défaut */ }
  return DEFAULTS;
}
export function savePrefs(p: AlertPrefs): void {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(p)); } catch { /* sans effet */ }
}

/**
 * Messages arrivés depuis la dernière lecture de la liste : le dernier message est d'un AUTRE et son identifiant a changé.
 * `seen` est null au premier chargement : on mémorise l'état sans alerter (pas de sonnerie à l'ouverture de la page).
 */
export function incoming(seen: Readonly<Record<string, string>> | null, list: readonly ConversationSummary[], meId: string): { fresh: ConversationSummary[]; seen: Record<string, string> } {
  const next: Record<string, string> = {};
  for (const s of list) if (s.last) next[s.conversation.id] = s.last.id;
  if (seen === null) return { fresh: [], seen: next };
  const fresh = list.filter((s) => s.last && s.last.senderId !== meId && s.unread > 0 && seen[s.conversation.id] !== s.last.id);
  return { fresh, seen: next };
}

/** Texte du compteur dans le titre de l'onglet : « (3) Titre ». */
export function titleWithCount(title: string, count: number): string {
  const base = title.replace(/^\(\d+\+?\)\s*/, '');
  return count > 0 ? `(${count > 99 ? '99+' : count}) ${base}` : base;
}

let audio: AudioContext | undefined;
/** Les navigateurs n'autorisent le son qu'après un geste de l'utilisateur : on prépare l'audio au premier clic ou à la première touche. */
export function unlockAudio(): void {
  try {
    const Ctor = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audio ??= new Ctor();
    if (audio.state === 'suspended') void audio.resume();
  } catch { /* audio indisponible */ }
}

/** Deux notes douces (sol puis do), sans fichier à charger. */
export function playChime(): void {
  try {
    unlockAudio();
    const ctx = audio;
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    [[784, 0], [1047, 0.18]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq as number;
      const start = t0 + (delay as number);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  } catch { /* sans effet */ }
}

export const desktopSupported = (): boolean => typeof Notification !== 'undefined';
export const desktopGranted = (): boolean => desktopSupported() && Notification.permission === 'granted';
export const desktopDenied = (): boolean => desktopSupported() && Notification.permission === 'denied';

/** Demande l'autorisation au navigateur (à appeler depuis un clic) ; vrai si elle est accordée. */
export async function requestDesktop(): Promise<boolean> {
  if (!desktopSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try { return (await Notification.requestPermission()) === 'granted'; } catch { return false; }
}

export function notifyDesktop(input: { tag: string; title: string; body: string; onClick: () => void }): void {
  if (!desktopGranted()) return;
  try {
    // « renotify » : un nouveau message d'une discussion déjà notifiée doit de nouveau s'afficher (sinon Windows le remplace en silence).
    const n = new Notification(input.title, { tag: input.tag, body: input.body, renotify: true } as NotificationOptions);
    n.onclick = () => { try { globalThis.focus(); } catch { /* sans effet */ } input.onClick(); n.close(); };
  } catch { /* certains navigateurs mobiles exigent un service worker : pas d'alerte, sans erreur */ }
}
