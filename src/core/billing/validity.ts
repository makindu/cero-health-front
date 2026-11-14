/**
 * Validité des frais de consultation (jours CIVILS de l'établissement, jamais l'UTC).
 * - Durée configurable en MOIS CALENDAIRES, avec règle de fin de mois :
 *     « clamp » : même quantième, ramené au dernier jour du mois si besoin (31 janv. + 1 mois = 28/29 févr.) ;
 *     « endOfMonth » : la validité court jusqu'à la FIN du mois d'arrivée (15 janv. + 1 mois = 28/29 févr.).
 * - Non rétroactive : l'échéance est calculée au paiement et CONSERVÉE sur le paiement ; changer la configuration
 *   n'affecte que les paiements suivants. L'historique des configurations est gardé.
 * - L'échéance est INCLUSE (valable jusqu'au jour d'échéance compris).
 */

export type ValidityMode = 'clamp' | 'endOfMonth';

export interface ValidityConfig {
  /** Premier jour civil où cette configuration s'applique. */
  effectiveFrom: string;
  months: number;
  mode: ValidityMode;
  changedBy?: string;
  reason?: string;
}

export interface FeePayment {
  id: string;
  patientId: string;
  /** Jour civil du paiement (ou de l'exemption). */
  paidDay: string;
  validUntil: string;
  source: 'payment' | 'exemption';
  config: Pick<ValidityConfig, 'months' | 'mode' | 'effectiveFrom'>;
  invoiceId?: string;
  /** Annulé/remboursé : ne donne plus de validité (jamais supprimé). */
  voided?: boolean;
  exemption?: { reason: string; by: string };
}

const parse = (day: string): [number, number, number] => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new Error(`Jour civil invalide : ${day}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};
const pad = (n: number): string => String(n).padStart(2, '0');
const daysInMonth = (year: number, month1: number): number => new Date(Date.UTC(year, month1, 0)).getUTCDate();

export function addCalendarMonths(day: string, months: number, mode: ValidityMode): string {
  if (!Number.isInteger(months) || months < 1 || months > 120) throw new Error('Durée de validité invalide (1 à 120 mois)');
  const [y, m, d] = parse(day);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month1 = (index % 12) + 1;
  const last = daysInMonth(year, month1);
  const dayOut = mode === 'endOfMonth' ? last : Math.min(d, last);
  return `${year}-${pad(month1)}-${pad(dayOut)}`;
}

/** Jours entre deux jours civils (b − a), sans dépendre du fuseau horaire. */
export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = parse(a);
  const [yb, mb, db] = parse(b);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** Configuration en vigueur un jour donné (la plus récente dont `effectiveFrom` ≤ jour). */
export function configInForce(history: readonly ValidityConfig[], day: string): ValidityConfig | undefined {
  return [...history].filter((c) => c.effectiveFrom <= day).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

export function buildFeePayment(input: { id: string; patientId: string; paidDay: string; history: readonly ValidityConfig[]; invoiceId?: string }): FeePayment {
  const config = configInForce(input.history, input.paidDay);
  if (!config) throw new Error('Aucune durée de validité configurée pour cette date');
  return {
    id: input.id,
    patientId: input.patientId,
    paidDay: input.paidDay,
    validUntil: addCalendarMonths(input.paidDay, config.months, config.mode),
    source: 'payment',
    config: { months: config.months, mode: config.mode, effectiveFrom: config.effectiveFrom },
    invoiceId: input.invoiceId,
  };
}

/** Exemption de frais : motif OBLIGATOIRE, auteur tracé (la permission est vérifiée par le service appelant). */
export function buildExemption(input: { id: string; patientId: string; day: string; history: readonly ValidityConfig[]; reason: string; by: string }): FeePayment {
  if (!input.reason.trim()) throw new Error('Motif d’exemption obligatoire');
  const base = buildFeePayment({ id: input.id, patientId: input.patientId, paidDay: input.day, history: input.history });
  return { ...base, source: 'exemption', exemption: { reason: input.reason.trim(), by: input.by } };
}

export type FeeState = 'valid' | 'expired' | 'none';

export interface FeeStatus {
  state: FeeState;
  /** Vrai si une nouvelle consultation doit être facturée. */
  newPaymentRequired: boolean;
  validUntil?: string;
  daysLeft?: number;
  paymentId?: string;
  source?: FeePayment['source'];
}

/** État de validité d'un patient un jour donné, d'après ses paiements/exemptions non annulés (le plus tardif gagne). */
export function feeStatus(payments: readonly FeePayment[], patientId: string, day: string): FeeStatus {
  const mine = payments.filter((p) => p.patientId === patientId && !p.voided && p.paidDay <= day);
  if (mine.length === 0) return { state: 'none', newPaymentRequired: true };
  const best = [...mine].sort((a, b) => b.validUntil.localeCompare(a.validUntil))[0] as FeePayment;
  if (day <= best.validUntil) {
    return { state: 'valid', newPaymentRequired: false, validUntil: best.validUntil, daysLeft: daysBetween(day, best.validUntil), paymentId: best.id, source: best.source };
  }
  return { state: 'expired', newPaymentRequired: true, validUntil: best.validUntil, daysLeft: -daysBetween(best.validUntil, day), paymentId: best.id, source: best.source };
}
