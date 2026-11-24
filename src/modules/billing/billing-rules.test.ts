import { describe, expect, it } from 'vitest';
import { checkAmount, dayOf, dayRange } from './billing-rules';

describe('saisie d\'un paiement', () => {
  it('accepte un montant valide, virgule ou point', () => {
    expect(checkAmount('18', 'USD', 5000)).toEqual({ ok: true, minor: 1800 });
    expect(checkAmount('18,5', 'USD', 5000)).toEqual({ ok: true, minor: 1850 });
    expect(checkAmount(' 18.50 ', 'USD', 5000)).toEqual({ ok: true, minor: 1850 });
  });
  it('accepte exactement le reste à payer', () => {
    expect(checkAmount('50', 'USD', 5000)).toEqual({ ok: true, minor: 5000 });
  });
  it('refuse un trop-perçu d\'un centime', () => {
    expect(checkAmount('50.01', 'USD', 5000)).toEqual({ ok: false, reason: 'tooMuch' });
  });
  it('refuse vide, illisible, nul et négatif', () => {
    expect(checkAmount('', 'USD', 5000)).toEqual({ ok: false, reason: 'empty' });
    expect(checkAmount('   ', 'USD', 5000)).toEqual({ ok: false, reason: 'empty' });
    expect(checkAmount('abc', 'USD', 5000)).toEqual({ ok: false, reason: 'unreadable' });
    expect(checkAmount('1e3', 'USD', 5000)).toEqual({ ok: false, reason: 'unreadable' });
    expect(checkAmount('0', 'USD', 5000)).toEqual({ ok: false, reason: 'notPositive' });
    expect(checkAmount('-5', 'USD', 5000)).toEqual({ ok: false, reason: 'notPositive' });
  });
  it('refuse trop de décimales plutôt que d\'arrondir', () => {
    expect(checkAmount('10.555', 'USD', 5000)).toEqual({ ok: false, reason: 'unreadable' });
  });
  it('ne laisse rien passer quand il ne reste rien à payer', () => {
    expect(checkAmount('1', 'USD', 0)).toEqual({ ok: false, reason: 'tooMuch' });
  });
});

describe('jour civil et bornes UTC', () => {
  it('formate le jour de l\'appareil', () => {
    expect(dayOf(new Date(2026, 10, 22, 23, 59))).toBe('2026-11-22');
    expect(dayOf(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
  });
  it('donne des bornes qui couvrent 24 h locales et se suivent', () => {
    const r = dayRange('2026-11-22');
    expect(r).not.toBeNull();
    const from = new Date(r!.from);
    const to = new Date(r!.to);
    expect(from.getFullYear()).toBe(2026);
    expect(from.getHours()).toBe(0);
    expect(to.getTime()).toBeGreaterThan(from.getTime());
    expect(to.getTime() - from.getTime()).toBeGreaterThanOrEqual(23 * 3_600_000);
    expect(to.getTime() - from.getTime()).toBeLessThanOrEqual(25 * 3_600_000);
    // le jour suivant commence là où celui-ci s'arrête : aucun encaissement perdu ni compté deux fois
    expect(dayRange('2026-11-23')!.from).toBe(r!.to);
  });
  it('passe correctement la fin de mois et d\'année', () => {
    expect(dayRange('2026-12-31')!.to).toBe(dayRange('2027-01-01')!.from);
    expect(dayRange('2026-02-28')!.to).toBe(dayRange('2026-03-01')!.from);
  });
  it('refuse les dates impossibles ou mal formées', () => {
    expect(dayRange('2026-02-30')).toBeNull();
    expect(dayRange('2026-13-01')).toBeNull();
    expect(dayRange('22/11/2026')).toBeNull();
    expect(dayRange('')).toBeNull();
  });
});
