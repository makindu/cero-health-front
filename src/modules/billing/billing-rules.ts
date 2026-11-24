import { MoneyError, parseMoney } from '@/core/money/money';

/** Règles de saisie de la facturation, sans interface : testables seules. Le serveur reste l'autorité (il refuse un trop-perçu). */
export type AmountCheck = { ok: true; minor: number } | { ok: false; reason: 'empty' | 'unreadable' | 'notPositive' | 'tooMuch' };

/** Montant saisi (« 18 », « 18,5 ») → unités mineures, vérifié contre le reste à payer. Refuse trop de décimales plutôt que d'arrondir. */
export function checkAmount(text: string, currency: string, remainingMinor: number): AmountCheck {
  if (text.trim() === '') return { ok: false, reason: 'empty' };
  let minor: number;
  try { minor = parseMoney(text, currency).minor; } catch (e) {
    if (e instanceof MoneyError) return { ok: false, reason: 'unreadable' };
    throw e;
  }
  if (minor <= 0) return { ok: false, reason: 'notPositive' };
  if (minor > remainingMinor) return { ok: false, reason: 'tooMuch' };
  return { ok: true, minor };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Jour civil de l'appareil (AAAA-MM-JJ). */
export const dayOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Un jour civil local → bornes UTC [début, fin[ : minuit local à minuit local suivant (23 h ou 25 h les jours de changement d'heure). */
export function dayRange(day: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const start = new Date(y, mo - 1, d);
  if (start.getFullYear() !== y || start.getMonth() !== mo - 1 || start.getDate() !== d) return null;   // 31 février, etc.
  return { from: start.toISOString(), to: new Date(y, mo - 1, d + 1).toISOString() };
}
