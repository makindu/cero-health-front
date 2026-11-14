/**
 * Montants monétaires EXACTS : entiers en plus petite unité (centimes…), jamais de nombre à virgule.
 * Les pourcentages sont en points de base (1 % = 100 pb ; 80 % = 8 000 pb) pour des taux comme 12,5 %.
 * Arrondi : « demi vers le haut » sur la valeur absolue (règle unique, documentée dans docs/BUSINESS_RULES.md).
 */

export type CurrencyCode = string;

export interface Money {
  /** Plus petite unité de la devise (ex. 1440 = 14,40 USD). Toujours un entier. */
  readonly minor: number;
  readonly currency: CurrencyCode;
}

/** Nombre de décimales par devise (par défaut : 2). */
const DECIMALS: Record<string, number> = { USD: 2, EUR: 2, CDF: 2, XAF: 0, XOF: 0, RWF: 0, UGX: 0, BIF: 0 };
export const decimalsOf = (currency: CurrencyCode): number => DECIMALS[currency] ?? 2;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

function assertSafe(minor: number): number {
  if (!Number.isSafeInteger(minor)) throw new MoneyError(`Montant invalide : ${minor}`);
  return minor;
}

export const money = (minor: number, currency: CurrencyCode): Money => ({ minor: assertSafe(minor), currency });
export const zero = (currency: CurrencyCode): Money => money(0, currency);

/** Construit un montant depuis un texte saisi (« 18 », « 18,5 », « 18.50 »). Refuse trop de décimales plutôt que d'arrondir. */
export function parseMoney(text: string, currency: CurrencyCode): Money {
  const clean = text.trim().replace(/\s/g, '').replace(',', '.');
  const decimals = decimalsOf(currency);
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(clean);
  if (!match) throw new MoneyError(`Montant illisible : « ${text} »`);
  const [, sign, whole, frac = ''] = match;
  if (frac.length > decimals) throw new MoneyError(`Trop de décimales pour ${currency} (maximum ${decimals})`);
  const minor = Number(whole) * 10 ** decimals + Number(frac.padEnd(decimals, '0') || '0');
  return money(sign === '-' ? -minor : minor, currency);
}

function same(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new MoneyError(`Devises différentes : ${a.currency} / ${b.currency}`);
}

export function add(a: Money, b: Money): Money {
  same(a, b);
  return money(a.minor + b.minor, a.currency);
}
export function sub(a: Money, b: Money): Money {
  same(a, b);
  return money(a.minor - b.minor, a.currency);
}
export const negate = (a: Money): Money => money(-a.minor, a.currency);
export const sum = (items: readonly Money[], currency: CurrencyCode): Money => items.reduce(add, zero(currency));
export function min(a: Money, b: Money): Money {
  same(a, b);
  return a.minor <= b.minor ? a : b;
}
export function max(a: Money, b: Money): Money {
  same(a, b);
  return a.minor >= b.minor ? a : b;
}
export const isZero = (a: Money): boolean => a.minor === 0;
export function compare(a: Money, b: Money): number {
  same(a, b);
  return Math.sign(a.minor - b.minor);
}

/** Division entière arrondie « demi vers le haut » (en valeur absolue), sans calcul flottant. */
function divRound(numerator: number, denominator: number): number {
  if (denominator <= 0) throw new MoneyError('Dénominateur invalide');
  const sign = numerator < 0 ? -1 : 1;
  const n = Math.abs(numerator);
  const q = Math.floor(n / denominator);
  const r = n - q * denominator;
  return sign * (r * 2 >= denominator ? q + 1 : q);
}

/** Multiplie par une quantité (entière ou décimale en millièmes max, ex. 0,5 perfusion). */
export function times(a: Money, quantity: number): Money {
  const scaled = Math.round(quantity * 1000);
  if (Math.abs(scaled / 1000 - quantity) > 1e-9) throw new MoneyError('Quantité : trois décimales au maximum');
  return money(divRound(a.minor * scaled, 1000), a.currency);
}

/** Part en points de base : percentOf(18,00 ; 8000) = 14,40. */
export function percentOf(a: Money, basisPoints: number): Money {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) throw new MoneyError('Taux invalide (0 à 10 000 pb)');
  return money(divRound(a.minor * basisPoints, 10000), a.currency);
}

/**
 * Répartit un montant selon des poids SANS perdre ni créer un centime (méthode du plus grand reste).
 * La somme des parts est toujours égale au montant d'origine.
 */
export function allocate(total: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0 || weights.some((w) => !Number.isInteger(w) || w < 0)) throw new MoneyError('Poids invalides');
  const weightSum = weights.reduce((x, y) => x + y, 0);
  if (weightSum === 0) throw new MoneyError('Somme des poids nulle');
  const sign = total.minor < 0 ? -1 : 1;
  const abs = Math.abs(total.minor);
  const base = weights.map((w) => Math.floor((abs * w) / weightSum));
  let remainder = abs - base.reduce((x, y) => x + y, 0);
  const order = weights
    .map((w, i) => ({ i, frac: (abs * w) % weightSum }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    base[i] = (base[i] ?? 0) + 1;
    remainder -= 1;
  }
  return base.map((b) => money(sign * b, total.currency));
}

/** Affichage localisé. Ne sert qu'à l'écran : les calculs ne passent jamais par ce texte. */
export function formatMoney(a: Money, locale: string): string {
  const decimals = decimalsOf(a.currency);
  const value = a.minor / 10 ** decimals;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: a.currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  } catch {
    return `${value.toFixed(decimals)} ${a.currency}`;
  }
}
