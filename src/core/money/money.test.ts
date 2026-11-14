import { describe, expect, it } from 'vitest';
import { add, allocate, formatMoney, money, MoneyError, parseMoney, percentOf, sub, sum, times, zero } from './money';

describe('montants exacts', () => {
  it('reproduit l’exemple métier : 18 USD couverts à 80 % → 14,40 assurance + 3,60 patient', () => {
    const negotiated = parseMoney('18', 'USD');
    const insurer = percentOf(negotiated, 8000);
    expect(insurer.minor).toBe(1440);
    expect(sub(negotiated, insurer).minor).toBe(360);
  });
  it('n’accumule aucune erreur flottante', () => {
    const total = sum(Array.from({ length: 10 }, () => parseMoney('0,10', 'USD')), 'USD');
    expect(total.minor).toBe(100);
    expect(add(parseMoney('0,1', 'USD'), parseMoney('0,2', 'USD')).minor).toBe(30);
  });
  it('arrondit demi vers le haut et garde la somme des parts égale au total', () => {
    expect(percentOf(money(1, 'USD'), 5000).minor).toBe(1);
    expect(percentOf(money(999, 'USD'), 3333).minor).toBe(333);
    const parts = allocate(money(100, 'USD'), [1, 1, 1]);
    expect(parts.map((p) => p.minor)).toEqual([34, 33, 33]);
    expect(sum(parts, 'USD').minor).toBe(100);
    expect(sum(allocate(money(-101, 'USD'), [1, 2]), 'USD').minor).toBe(-101);
  });
  it('refuse les devises mélangées, les décimales en trop et les montants illisibles', () => {
    expect(() => add(money(1, 'USD'), money(1, 'EUR'))).toThrow(MoneyError);
    expect(() => parseMoney('1,234', 'USD')).toThrow(MoneyError);
    expect(() => parseMoney('abc', 'USD')).toThrow(MoneyError);
    expect(parseMoney('1500', 'XAF').minor).toBe(1500);
    expect(() => money(1.5, 'USD')).toThrow(MoneyError);
  });
  it('gère les quantités décimales et les devises sans centimes', () => {
    expect(times(parseMoney('3,50', 'USD'), 3).minor).toBe(1050);
    expect(times(parseMoney('10', 'USD'), 0.5).minor).toBe(500);
    expect(zero('USD').minor).toBe(0);
    expect(formatMoney(money(1440, 'USD'), 'en')).toContain('14.40');
  });
});
