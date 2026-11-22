import { describe, expect, it } from 'vitest';
import { gramsToKgText, kgTextToGrams } from './data';

describe('poids de naissance : saisi en kilogrammes, gardé en grammes par le serveur', () => {
  it('convertit les kilogrammes saisis (virgule ou point) en grammes', () => {
    expect(kgTextToGrams('3,2')).toBe(3200);
    expect(kgTextToGrams('3.25')).toBe(3250);
    expect(kgTextToGrams(' ')).toBeNull();
    expect(kgTextToGrams(undefined)).toBeNull();
  });

  it('refuse une valeur qui ressemble à des grammes ou qui n’est pas un nombre', () => {
    expect(() => kgTextToGrams('3200')).toThrow(/kilogrammes/);
    expect(() => kgTextToGrams('abc')).toThrow(/kilogrammes/);
    expect(() => kgTextToGrams('0')).toThrow(/kilogrammes/);
  });

  it('affiche en kilogrammes le poids reçu en grammes', () => {
    expect(gramsToKgText(3200)).toBe('3,2');
    expect(gramsToKgText(2950)).toBe('2,95');
    expect(gramsToKgText(undefined)).toBe('');
  });
});
