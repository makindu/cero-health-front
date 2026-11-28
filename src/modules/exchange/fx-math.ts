import { MoneyError, decimalsOf, parseMoney } from '@/core/money/money';
import type { FxOverview } from './fx-api';

/** Taux par devise : la devise par défaut vaut 1, les autres « N pour 1 devise par défaut ». */
export function rateMap(o: FxOverview | undefined): Record<string, number> {
  if (!o || !o.base) return {};
  const map: Record<string, number> = { [o.base]: 1 };
  for (const r of o.rates) {
    const n = Number(r.rate);
    if (Number.isFinite(n) && n > 0) map[r.currency] = n;
  }
  return map;
}

/** Convertit un montant (unités entières de la devise, pas les centimes) ; null si un taux manque ou si le montant n'est pas un nombre. */
export function convertMajor(amount: number, from: string, to: string, rates: Record<string, number>): number | null {
  if (!Number.isFinite(amount)) return null;
  if (from === to) return amount;
  const rf = rates[from];
  const rt = rates[to];
  if (!rf || !rt) return null;
  return (amount / rf) * rt;
}

/** Saisie « 1 250,5 » ou « 1250.5 » → 1250.5 ; vide ou invalide → NaN. */
export function parseAmount(text: string): number {
  const t = text.replace(/\s/g, '').replace(',', '.');
  return t === '' ? Number.NaN : Number(t);
}

export type TenderCheck = { ok: true; tenderMinor: number; appliedMinor: number } | { ok: false; reason: 'empty' | 'unreadable' | 'notPositive' | 'tooMuch' | 'noRate' };

const toMinor = (major: number, currency: string): number => Math.round(major * 10 ** decimalsOf(currency));
const toMajor = (minor: number, currency: string): number => minor / 10 ** decimalsOf(currency);

/**
 * Paiement remis dans une AUTRE devise que la facture : montant remis (texte) → unités mineures, converti au taux du jour et vérifié contre le reste à payer.
 * Même tolérance que le serveur : au plus 1 unité mineure de la devise remise au-dessus du solde converti. Le serveur reste l'autorité.
 */
export function tenderCheck(text: string, tender: string, invoiceCurrency: string, remainingMinor: number, rates: Record<string, number>): TenderCheck {
  if (text.trim() === '') return { ok: false, reason: 'empty' };
  let tenderMinor: number;
  try { tenderMinor = parseMoney(text, tender).minor; } catch (e) {
    if (e instanceof MoneyError) return { ok: false, reason: 'unreadable' };
    throw e;
  }
  if (tenderMinor <= 0) return { ok: false, reason: 'notPositive' };
  const applied = convertMajor(toMajor(tenderMinor, tender), tender, invoiceCurrency, rates);
  if (applied === null) return { ok: false, reason: 'noRate' };
  let appliedMinor = toMinor(applied, invoiceCurrency);
  if (appliedMinor <= 0) return { ok: false, reason: 'notPositive' };
  if (appliedMinor > remainingMinor) {
    const needed = convertMajor(toMajor(remainingMinor, invoiceCurrency), invoiceCurrency, tender, rates);
    if (needed === null || tenderMinor > toMinor(needed, tender) + 1) return { ok: false, reason: 'tooMuch' };
    appliedMinor = remainingMinor;
  }
  return { ok: true, tenderMinor, appliedMinor };
}

/** Montant à demander pour solder la facture dans la devise remise (arrondi au-dessus), prêt à saisir : « 140000.00 ». */
export function exactTenderText(remainingMinor: number, invoiceCurrency: string, tender: string, rates: Record<string, number>): string {
  const v = convertMajor(toMajor(remainingMinor, invoiceCurrency), invoiceCurrency, tender, rates);
  if (v === null) return '';
  const d = decimalsOf(tender);
  return (Math.ceil(v * 10 ** d - 1e-9) / 10 ** d).toFixed(d);
}

export interface MixedLineInput { currency: string; text: string; method: string }
export interface MixedLineOk { currency: string; minor: number; method: string; appliedMinor: number }
export type MixedCheck =
  | { ok: true; lines: MixedLineOk[]; appliedMinor: number; remainingAfterMinor: number; change: { currency: string; minor: number } | null }
  | { ok: false; reason: 'empty' | 'unreadable' | 'notPositive' | 'noRate' | 'overpay' | 'extraLine' };

/**
 * Paiement mixte : chaque remise est convertie dans la devise de la facture et plafonnée au reste à payer.
 * Un dépassement n'est admis que sur une remise en espèces (le surplus est rendu dans `changeCurrency`). Les lignes vides sont ignorées.
 * Même règle que le serveur, qui reste l'autorité.
 */
export function mixedCheck(inputs: MixedLineInput[], invoiceCurrency: string, remainingMinor: number, rates: Record<string, number>, changeCurrency: string): MixedCheck {
  const filled = inputs.filter((x) => x.text.trim() !== '');
  if (filled.length === 0) return { ok: false, reason: 'empty' };
  let left = remainingMinor;
  let change: { currency: string; minor: number } | null = null;
  const lines: MixedLineOk[] = [];
  for (const x of filled) {
    if (left <= 0) return { ok: false, reason: 'extraLine' };
    let minor: number;
    try { minor = parseMoney(x.text, x.currency).minor; } catch (e) {
      if (e instanceof MoneyError) return { ok: false, reason: 'unreadable' };
      throw e;
    }
    if (minor <= 0) return { ok: false, reason: 'notPositive' };
    const conv = convertMajor(toMajor(minor, x.currency), x.currency, invoiceCurrency, rates);
    if (conv === null) return { ok: false, reason: 'noRate' };
    let applied = x.currency === invoiceCurrency ? minor : toMinor(conv, invoiceCurrency);
    if (applied <= 0) return { ok: false, reason: 'notPositive' };
    if (applied > left) {
      const needed = x.currency === invoiceCurrency ? left : toMinor(convertMajor(toMajor(left, invoiceCurrency), invoiceCurrency, x.currency, rates) ?? 0, x.currency);
      const tolerated = x.currency !== invoiceCurrency && minor <= needed + 1;
      if (!tolerated) {
        if (x.method !== 'cash') return { ok: false, reason: 'overpay' };
        const back = convertMajor(toMajor(applied - left, invoiceCurrency), invoiceCurrency, changeCurrency, rates);
        if (back === null) return { ok: false, reason: 'noRate' };
        change = { currency: changeCurrency, minor: toMinor(back, changeCurrency) };
      }
      applied = left;
    }
    lines.push({ currency: x.currency, minor, method: x.method, appliedMinor: applied });
    left -= applied;
  }
  return { ok: true, lines, appliedMinor: remainingMinor - left, remainingAfterMinor: left, change };
}

const MAX_TYPED = 15;

/** Touche du pavé : chiffre, « . » (une seule fois), « back » (retour arrière) ou « clear » (remise à zéro). Le texte reste toujours un nombre lisible. */
export function pressKey(current: string, key: string): string {
  if (key === 'clear') return '0';
  if (key === 'back') return current.length <= 1 || current === '0' ? '0' : current.slice(0, -1);
  if (key === '.') return current.includes('.') ? current : `${current === '' ? '0' : current}.`;
  if (!/^[0-9]$/.test(key) || current.length >= MAX_TYPED) return current;
  return current === '0' ? key : current + key;
}

/** Affichage de la saisie : milliers séparés, virgule décimale telle que tapée (« 1 250, » reste visible pendant la frappe). */
export function prettyAmount(text: string): string {
  const [int = '0', dec] = text.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
  return dec === undefined ? grouped : `${grouped},${dec}`;
}
