import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, sanitizePreferences } from './preferences-store';

describe('sanitizePreferences', () => {
  it('retombe sur les valeurs par défaut si l’entrée est invalide', () => {
    expect(sanitizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences('x')).toEqual(DEFAULT_PREFERENCES);
  });
  it('rejette les valeurs hors liste', () => {
    const result = sanitizePreferences({ theme: 'neon', density: 'huge', language: '<script>' });
    expect(result.theme).toBe('system');
    expect(result.density).toBe('comfortable');
    expect(result.language).toBeNull();
  });
  it('conserve les valeurs valides', () => {
    const result = sanitizePreferences({ theme: 'dark', density: 'compact', language: 'sw' });
    expect(result).toMatchObject({ theme: 'dark', density: 'compact', language: 'sw' });
  });
});
