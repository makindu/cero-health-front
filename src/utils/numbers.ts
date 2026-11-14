/**
 * Saisie numérique : on n'accepte que des chiffres et, si autorisé, UN séparateur décimal
 * (virgule ou point — la virgule est affichée, usage francophone) et un signe « - » en tête.
 * Les lettres et autres symboles sont ignorés à la frappe comme au collage.
 */
export interface NumberFormat {
  /** Autorise une partie décimale. Défaut : false (entier). */
  decimal?: boolean;
  /** Nombre maximal de décimales. Défaut : 2. */
  maxDecimals?: number;
  /** Autorise un signe moins en tête (ajustements de stock). Défaut : false. */
  negative?: boolean;
}

export function sanitizeNumberText(raw: string, { decimal = false, maxDecimals = 2, negative = false }: NumberFormat = {}): string {
  let text = raw.replace(/\s/g, '');
  const minus = negative && text.startsWith('-') ? '-' : '';
  text = text.replace(/[^0-9.,]/g, '');
  if (!decimal) return minus + text.replace(/[.,]/g, '');
  const at = text.search(/[.,]/);
  if (at === -1) return minus + text;
  const whole = text.slice(0, at);
  const frac = text.slice(at + 1).replace(/[.,]/g, '').slice(0, maxDecimals);
  return `${minus}${whole},${frac}`;
}

/** Texte saisi (« 2,5 » ou « 2.5 ») → nombre. NaN si vide ou incomplet. */
export function parseNumberText(text: string): number {
  const t = text.trim().replace(',', '.');
  if (t === '' || t === '-' || t === '.' || t === '-.') return Number.NaN;
  return Number(t);
}

/** Évite les dérives binaires (0,1 + 0,2) sur les quantités à 2 décimales. */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Affichage francophone d'une quantité : 2.5 → « 2,5 ». */
export const formatQty = (n: number): string => String(n).replace('.', ',');

/** Quantité valide : nombre fini > 0 avec au plus 2 décimales. */
export const isQuantity = (n: number): boolean => Number.isFinite(n) && n > 0 && round2(n) === n;
