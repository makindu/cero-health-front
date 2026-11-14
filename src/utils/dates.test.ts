import { describe, expect, it } from 'vitest';
import { ageFromBirthDate, isoDay, minutesSince } from './dates';

const REF = new Date(2026, 5, 15, 12, 0, 0);

describe('dates', () => {
  it('calcule l’âge en années complètes', () => {
    expect(ageFromBirthDate('2000-06-15', REF)).toBe(26);
    expect(ageFromBirthDate('2000-06-16', REF)).toBe(25);
  });
  it('renvoie null pour une date absente, invalide ou future', () => {
    expect(ageFromBirthDate(null, REF)).toBeNull();
    expect(ageFromBirthDate('abc', REF)).toBeNull();
    expect(ageFromBirthDate('2030-01-01', REF)).toBeNull();
  });
  it('calcule les minutes écoulées sans valeur négative', () => {
    expect(minutesSince(new Date(REF.getTime() - 30 * 60000).toISOString(), REF)).toBe(30);
    expect(minutesSince(new Date(REF.getTime() + 60 * 60000).toISOString(), REF)).toBe(0);
  });
  it('décale un jour ISO', () => {
    expect(isoDay(1, REF)).toBe('2026-06-16');
    expect(isoDay(-15, REF)).toBe('2026-05-31');
  });
});
