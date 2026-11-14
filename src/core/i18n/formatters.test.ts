import { describe, expect, it } from 'vitest';
import { EMPTY_VALUE, formatDate, formatNumber } from './formatters';

describe('formatters', () => {
  it('affiche un tiret pour une valeur absente ou invalide', () => {
    expect(formatDate(null, 'fr')).toBe(EMPTY_VALUE);
    expect(formatDate('pas une date', 'fr')).toBe(EMPTY_VALUE);
    expect(formatNumber(undefined, 'fr')).toBe(EMPTY_VALUE);
  });
  it('affiche une date civile (naissance) sans décalage de jour, dans chaque langue', () => {
    // 12 h local : le jour reste le 1er quel que soit le fuseau du poste.
    for (const [locale, month] of [['fr', 'janv'], ['en', 'Jan'], ['sw', 'Jan']] as const) {
      const text = formatDate('1990-01-01', locale);
      expect(text).toContain('1990');
      expect(text).toContain(month);
      expect(text).toContain('1');
    }
    expect(formatDate('1990-01-01', 'fr')).not.toContain('31');
  });
  it('formate une date dans le fuseau demandé', () => {
    const text = formatDate('2025-03-01T23:30:00Z', 'fr', { timeZone: 'Africa/Lubumbashi' });
    expect(text).toContain('2');
    expect(text).toContain('2025');
  });
});
