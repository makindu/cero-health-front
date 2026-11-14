import { describe, expect, it } from 'vitest';
import { formatQty, isQuantity, parseNumberText, round2, sanitizeNumberText } from './numbers';

describe('saisie numérique', () => {
  it('refuse les lettres et symboles', () => {
    expect(sanitizeNumberText('12abc')).toBe('12');
    expect(sanitizeNumberText('e5', { decimal: true })).toBe('5');
    expect(sanitizeNumberText('1,5')).toBe('15'); // entier : pas de séparateur
  });
  it('accepte la virgule et le point en mode décimal (affichage avec virgule, 1 seul séparateur, 2 décimales)', () => {
    expect(sanitizeNumberText('2,5', { decimal: true })).toBe('2,5');
    expect(sanitizeNumberText('2.5', { decimal: true })).toBe('2,5');
    expect(sanitizeNumberText('1,2,3', { decimal: true })).toBe('1,23');
    expect(sanitizeNumberText('0,12345', { decimal: true })).toBe('0,12');
    expect(sanitizeNumberText(',5', { decimal: true })).toBe(',5');
  });
  it('signe moins seulement si autorisé', () => {
    expect(sanitizeNumberText('-4')).toBe('4');
    expect(sanitizeNumberText('-4', { negative: true })).toBe('-4');
  });
  it('convertit en nombre', () => {
    expect(parseNumberText('2,5')).toBe(2.5);
    expect(parseNumberText(',5')).toBe(0.5);
    expect(Number.isNaN(parseNumberText(''))).toBe(true);
    expect(Number.isNaN(parseNumberText('-'))).toBe(true);
  });
  it('valide les quantités', () => {
    expect(isQuantity(0.5)).toBe(true);
    expect(isQuantity(0)).toBe(false);
    expect(isQuantity(1.255)).toBe(false);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(formatQty(2.5)).toBe('2,5');
  });
});
