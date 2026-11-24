import { useSyncExternalStore } from 'react';

/** Serveurs que l'application contacte (mêmes noms que les clients API). */
export type ServerName = 'health' | 'id-core' | 'uzisha';

export interface ConnectionStatus {
  /** Le navigateur se dit hors ligne : l'ordinateur n'a plus de réseau (Wi-Fi coupé, câble débranché, mode avion). */
  readonly browserOffline: boolean;
  /** Serveurs qui n'ont pas répondu du tout (éteints, injoignables, mauvaise adresse). */
  readonly down: readonly ServerName[];
}

/**
 * État de la connexion de CET appareil. Deux sources :
 *  - le navigateur (événements « online » / « offline ») ;
 *  - les appels réels : aucune réponse d'un serveur = ce serveur est injoignable ; toute réponse = il est joignable.
 * Ne contient aucune donnée : uniquement des indicateurs.
 */
const OK: ConnectionStatus = { browserOffline: false, down: [] };
let status: ConnectionStatus = {
  browserOffline: typeof navigator !== 'undefined' && navigator.onLine === false,
  down: [],
};
const listeners = new Set<() => void>();
const reconnectListeners = new Set<() => void>();

const isOk = (s: ConnectionStatus) => !s.browserOffline && s.down.length === 0;

function update(next: ConnectionStatus): void {
  if (next.browserOffline === status.browserOffline && next.down.join() === status.down.join()) return;
  const wasOk = isOk(status);
  status = next;
  listeners.forEach((l) => l());
  if (!wasOk && isOk(next)) reconnectListeners.forEach((l) => l());
}

export function getStatus(): ConnectionStatus {
  return status;
}

export function isOnline(): boolean {
  return isOk(status);
}

/** Force l'état : `true` efface tout (réseau et serveurs), `false` déclare le navigateur hors ligne. */
export function setOnline(next: boolean): void {
  update(next ? OK : { browserOffline: true, down: status.down });
}

/**
 * Un serveur a répondu. Cela prouve que CE serveur marche, SAUF si le navigateur se dit hors ligne : un serveur local
 * (développement) répond même sans réseau, et le bandeau doit rester affiché jusqu'au vrai retour (événement « online »).
 */
export function markReachable(server?: ServerName): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  update({ browserOffline: false, down: server ? status.down.filter((s) => s !== server) : [] });
}

/** Un serveur n'a pas répondu du tout. */
export function markUnreachable(server?: ServerName): void {
  if (!server) return update({ browserOffline: true, down: status.down });
  if (status.down.includes(server)) return;
  update({ browserOffline: status.browserOffline, down: [...status.down, server].sort() });
}

/** Appelé une fois à chaque retour complet de la connexion (tout était en panne, plus rien ne l'est). */
export function onReconnect(cb: () => void): () => void {
  reconnectListeners.add(cb);
  return () => reconnectListeners.delete(cb);
}

export function useConnectionStatus(): ConnectionStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
    () => OK,
  );
}

/**
 * Les données de HEALTH sont-elles injoignables ? Oui si l'ordinateur n'a plus de réseau ou si le serveur HEALTH ne répond pas.
 * Une panne d'un autre serveur (identité, UZISHA) ne concerne pas les écrans en chargement : ils attendent leur réponse normalement.
 */
export function dataUnavailable(s: ConnectionStatus): boolean {
  return s.browserOffline || s.down.includes('health');
}

export function useDataUnavailable(): boolean {
  return dataUnavailable(useConnectionStatus());
}

export function useOnline(): boolean {
  return isOk(useConnectionStatus());
}

/** Branche les événements du navigateur ; renvoie la fonction qui les retire. */
export function watchBrowserConnection(target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): () => void {
  const up = () => update({ browserOffline: false, down: status.down });
  const down = () => update({ browserOffline: true, down: status.down });
  target.addEventListener('online', up);
  target.addEventListener('offline', down);
  return () => {
    target.removeEventListener('online', up);
    target.removeEventListener('offline', down);
  };
}
