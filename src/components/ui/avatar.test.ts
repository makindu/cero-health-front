import { describe, expect, it } from 'vitest';
import { initialsOf, toneIndexOf } from './avatar';

describe('avatar', () => {
  it('initiales : premier et dernier mot, sans accents, sans titres entre parenthèses', () => {
    expect(initialsOf('Juma Kilo')).toBe('JK');
    expect(initialsOf('asifiwe ciralwira ass')).toBe('AA');
    expect(initialsOf('Amani')).toBe('A');
    expect(initialsOf('Éloïse Mbuyi-Kabeya')).toBe('EK');
    expect(initialsOf('Réceptionniste (démo)')).toBe('R');
    expect(initialsOf('   ')).toBe('?');
    expect(initialsOf('123')).toBe('?');
  });
  it('teinte stable pour un même nom, quelle que soit la casse', () => {
    expect(toneIndexOf('Juma Kilo')).toBe(toneIndexOf('juma kilo'));
    expect(toneIndexOf('x')).toBeGreaterThanOrEqual(0);
  });
});
