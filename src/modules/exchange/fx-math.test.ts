import { describe, expect, it } from 'vitest';
import type { FxOverview } from './fx-api';
import { convertMajor, exactTenderText, mixedCheck, parseAmount, pressKey, prettyAmount, rateMap, tenderCheck } from './fx-math';

const overview: FxOverview = {
  base: 'USD',
  rates: [
    { id: '1', baseCurrency: 'USD', currency: 'CDF', rate: '2800', date: '2026-11-28', setByName: '' },
    { id: '2', baseCurrency: 'USD', currency: 'EUR', rate: '0.5', date: '2026-11-28', setByName: '' },
  ],
  history: [],
};

describe('paiement remis dans une autre devise', () => {
  const rates = rateMap(overview);
  it('convertit ce qui est remis en devise de la facture', () => {
    // facture de 50,00 USD (5000) ; on remet 28 000,00 CDF = 10,00 USD
    expect(tenderCheck('28000', 'CDF', 'USD', 5000, rates)).toEqual({ ok: true, tenderMinor: 2800000, appliedMinor: 1000 });
    expect(tenderCheck('28000,5', 'CDF', 'USD', 5000, rates)).toMatchObject({ ok: true, tenderMinor: 2800050 });
  });
  it('propose le montant exact pour solder, arrondi au-dessus', () => {
    expect(exactTenderText(5000, 'USD', 'CDF', rates)).toBe('140000.00');
    expect(exactTenderText(1, 'USD', 'CDF', rates)).toBe('28.00');
    expect(exactTenderText(5000, 'USD', 'GBP', rates)).toBe('');
  });
  it('solde la facture avec la tolérance d\'arrondi, pas au-delà', () => {
    expect(tenderCheck('140000', 'CDF', 'USD', 5000, rates)).toEqual({ ok: true, tenderMinor: 14000000, appliedMinor: 5000 });
    expect(tenderCheck('140000.01', 'CDF', 'USD', 5000, rates)).toEqual({ ok: true, tenderMinor: 14000001, appliedMinor: 5000 });
    expect(tenderCheck('141000', 'CDF', 'USD', 5000, rates)).toEqual({ ok: false, reason: 'tooMuch' });
  });
  it('refuse le vide, l\'illisible, zéro et une devise sans taux', () => {
    expect(tenderCheck('', 'CDF', 'USD', 5000, rates)).toEqual({ ok: false, reason: 'empty' });
    expect(tenderCheck('abc', 'CDF', 'USD', 5000, rates)).toEqual({ ok: false, reason: 'unreadable' });
    expect(tenderCheck('0', 'CDF', 'USD', 5000, rates)).toEqual({ ok: false, reason: 'notPositive' });
    expect(tenderCheck('10', 'GBP', 'USD', 5000, rates)).toEqual({ ok: false, reason: 'noRate' });
  });
});

describe('calculateur de conversion', () => {
  const rates = rateMap(overview);
  it('met la devise par défaut à 1 et garde les taux valides', () => {
    expect(rates).toEqual({ USD: 1, CDF: 2800, EUR: 0.5 });
    expect(rateMap(undefined)).toEqual({});
    expect(rateMap({ ...overview, rates: [{ ...overview.rates[0], rate: '0' }] })).toEqual({ USD: 1 });
  });
  it('convertit dans les deux sens et entre deux devises étrangères', () => {
    expect(convertMajor(5, 'USD', 'CDF', rates)).toBe(14000);
    expect(convertMajor(14000, 'CDF', 'USD', rates)).toBe(5);
    expect(convertMajor(2.5, 'EUR', 'CDF', rates)).toBe(14000);
    expect(convertMajor(7, 'USD', 'USD', rates)).toBe(7);
  });
  it('renvoie null quand un taux manque ou que le montant est invalide', () => {
    expect(convertMajor(5, 'USD', 'GBP', rates)).toBeNull();
    expect(convertMajor(Number.NaN, 'USD', 'CDF', rates)).toBeNull();
  });
  it('lit une saisie avec virgule ou espaces', () => {
    expect(parseAmount('1 250,5')).toBe(1250.5);
    expect(parseAmount('1250.5')).toBe(1250.5);
    expect(parseAmount('')).toBeNaN();
    expect(parseAmount('abc')).toBeNaN();
  });
});

describe('paiement mixte', () => {
  const rates = rateMap(overview);
  it('additionne des remises en plusieurs devises et calcule le reste', () => {
    // facture 50,00 USD : 10 USD + 28 000 CDF (= 10 USD)
    const r = mixedCheck([{ currency: 'USD', text: '10', method: 'cash' }, { currency: 'CDF', text: '28000', method: 'cash' }], 'USD', 5000, rates, 'USD');
    expect(r).toMatchObject({ ok: true, appliedMinor: 2000, remainingAfterMinor: 3000, change: null });
  });
  it('rend la monnaie d\'un excès en espèces, dans la devise choisie', () => {
    const usd = mixedCheck([{ currency: 'USD', text: '60', method: 'cash' }], 'USD', 5000, rates, 'USD');
    expect(usd).toMatchObject({ ok: true, appliedMinor: 5000, remainingAfterMinor: 0, change: { currency: 'USD', minor: 1000 } });
    const cdf = mixedCheck([{ currency: 'USD', text: '60', method: 'cash' }], 'USD', 5000, rates, 'CDF');
    expect(cdf).toMatchObject({ ok: true, change: { currency: 'CDF', minor: 2800000 } });
  });
  it('refuse un excès hors espèces, une remise en trop et les montants illisibles', () => {
    expect(mixedCheck([{ currency: 'USD', text: '60', method: 'card' }], 'USD', 5000, rates, 'USD')).toEqual({ ok: false, reason: 'overpay' });
    expect(mixedCheck([{ currency: 'USD', text: '50', method: 'cash' }, { currency: 'USD', text: '1', method: 'cash' }], 'USD', 5000, rates, 'USD')).toEqual({ ok: false, reason: 'extraLine' });
    expect(mixedCheck([{ currency: 'USD', text: 'abc', method: 'cash' }], 'USD', 5000, rates, 'USD')).toEqual({ ok: false, reason: 'unreadable' });
    expect(mixedCheck([{ currency: 'USD', text: '', method: 'cash' }], 'USD', 5000, rates, 'USD')).toEqual({ ok: false, reason: 'empty' });
    expect(mixedCheck([{ currency: 'GBP', text: '5', method: 'cash' }], 'USD', 5000, rates, 'USD')).toEqual({ ok: false, reason: 'noRate' });
  });
});

describe('pavé du calculateur', () => {
  it('compose un nombre lisible touche par touche', () => {
    const type = (keys: string[]) => keys.reduce((a, k) => pressKey(a, k), '0');
    expect(type(['1', '2', '5', '.', '5'])).toBe('125.5');
    expect(type(['.', '5'])).toBe('0.5');
    expect(type(['0', '0', '7'])).toBe('7');
    expect(type(['1', '.', '2', '.', '3'])).toBe('1.23');          // une seule virgule
    expect(type(['4', '2', 'back'])).toBe('4');
    expect(type(['back'])).toBe('0');
    expect(type(['9', '9', 'clear'])).toBe('0');
    expect(type(Array(30).fill('1')).length).toBe(15);               // longueur bornée
  });
  it('affiche les milliers et garde la virgule en cours de frappe', () => {
    expect(prettyAmount('1250000')).toBe('1\u202f250\u202f000');
    expect(prettyAmount('1250.')).toBe('1\u202f250,');
    expect(prettyAmount('0.05')).toBe('0,05');
  });
});
