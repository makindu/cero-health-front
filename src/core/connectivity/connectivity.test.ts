import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataUnavailable, getStatus, isOnline, markReachable, markUnreachable, onReconnect, setOnline, watchBrowserConnection } from './connectivity';

afterEach(() => {
  vi.unstubAllGlobals();
  setOnline(true);
});

describe('connectivity', () => {
  it('les écrans en chargement affichent « connexion indisponible » seulement si les données de HEALTH sont injoignables', () => {
    expect(dataUnavailable({ browserOffline: false, down: [] })).toBe(false);
    expect(dataUnavailable({ browserOffline: true, down: [] })).toBe(true);
    expect(dataUnavailable({ browserOffline: false, down: ['health'] })).toBe(true);
    expect(dataUnavailable({ browserOffline: false, down: ['uzisha', 'id-core'] })).toBe(false);
  });

  it('nomme le serveur qui ne répond pas et le retire quand il répond', () => {
    markUnreachable('uzisha');
    expect(isOnline()).toBe(false);
    expect(getStatus().down).toEqual(['uzisha']);
    markReachable('uzisha');
    expect(isOnline()).toBe(true);
  });

  it('un serveur qui répond ne masque pas un autre serveur en panne', () => {
    markUnreachable('health');
    markUnreachable('id-core');
    markReachable('health');
    expect(getStatus().down).toEqual(['id-core']);
    expect(isOnline()).toBe(false);
    markReachable('id-core');
    expect(isOnline()).toBe(true);
  });

  it('annonce le retour une seule fois, quand tout fonctionne de nouveau', () => {
    let calls = 0;
    const off = onReconnect(() => (calls += 1));
    markReachable('health');
    expect(calls).toBe(0);
    markUnreachable('health');
    markUnreachable('uzisha');
    markReachable('health');
    expect(calls).toBe(0);
    markReachable('uzisha');
    markReachable('uzisha');
    expect(calls).toBe(1);
    off();
    markUnreachable('health');
    markReachable('health');
    expect(calls).toBe(1);
  });

  it('suit les événements du navigateur et les retire à la fin', () => {
    const handlers: Record<string, () => void> = {};
    const target = {
      addEventListener: (n: string, h: () => void) => void (handlers[n] = h),
      removeEventListener: (n: string) => void delete handlers[n],
    };
    const stop = watchBrowserConnection(target as unknown as Window);
    handlers.offline();
    expect(getStatus().browserOffline).toBe(true);
    handlers.online();
    expect(isOnline()).toBe(true);
    stop();
    expect(Object.keys(handlers)).toEqual([]);
  });

  it('une réponse du serveur ne masque pas un navigateur hors ligne (serveur local en développement)', () => {
    setOnline(false);
    vi.stubGlobal('navigator', { onLine: false });
    markReachable('health');
    expect(getStatus().browserOffline).toBe(true);
    vi.stubGlobal('navigator', { onLine: true });
    markReachable('health');
    expect(isOnline()).toBe(true);
  });
});
