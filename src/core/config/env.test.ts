import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('applique les valeurs par défaut', () => {
    const env = parseEnv({}, false);
    expect(env.appName).toBe('CERO HEALTH');
    expect(env.api).toEqual({ idCore: null, uzisha: null, health: null });
    expect(env.previewMode).toBe(false);
    expect(env.localMode).toBe(false);
    expect(env.designSystemEnabled).toBe(false);
  });
  it('retire le « / » final des URLs', () => {
    expect(parseEnv({ VITE_HEALTH_API_URL: 'https://api.example.org/v1/' }, false).api.health).toBe(
      'https://api.example.org/v1',
    );
  });
  it('ignore une URL invalide sans afficher sa valeur', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const env = parseEnv({ VITE_HEALTH_API_URL: 'pas-une-url' }, false);
    expect(env.api.health).toBeNull();
    expect(warn.mock.calls[0]?.[0]).not.toContain('pas-une-url');
    warn.mockRestore();
  });
});
