/**
 * Règles de la pharmacie (fonctions pures).
 * Prescrire ≠ dispenser ≠ administrer : ici on ne traite QUE la dispensation (remise de produits et sortie de stock).
 * L'administration au patient relève des soins infirmiers (hors de cette phase).
 */
import { isQuantity, round2 } from '@/utils/numbers';
export interface StockLot {
  id: string;
  itemId: string;
  lotNumber: string;
  /** AAAA-MM-JJ ; null = sans péremption. */
  expiresAt: string | null;
  quantity: number;
}

export type MovementKind = 'receive' | 'dispense' | 'adjust' | 'dispenseCancel';
export interface StockMovement {
  id: string;
  at: string;
  by: string;
  itemId: string;
  lotId: string;
  /** Positif = entrée, négatif = sortie. */
  delta: number;
  kind: MovementKind;
  ref?: string;
  reason?: string;
}

export interface DispensationLine {
  rxLineIndex: number;
  rxLabel: string;
  itemId: string;
  itemLabel: string;
  quantity: number;
  /** Lots réellement utilisés (renseigné à la dispensation). */
  lots: { lotId: string; lotNumber: string; quantity: number }[];
  /** Écart par rapport à la prescription (quantité réduite et/ou produit différent) : motif obligatoire, tracé avec le pharmacien. */
  deviation?: { kinds: DeviationKind[]; reason: string };
}

/** reduced = on sert moins que le reste prescrit ; substituted = le produit servi n'a pas le libellé prescrit. */
export type DeviationKind = 'reduced' | 'substituted';
export const MAX_DEVIATION_REASON = 300;

const norm = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Écarts d'une ligne servie par rapport à la ligne prescrite (fonction pure, aussi utilisée par l'écran). */
export function deviationKinds(input: { rxLabel: string; itemLabel: string; quantity: number; remaining: number }): DeviationKind[] {
  const kinds: DeviationKind[] = [];
  if (input.quantity < input.remaining) kinds.push('reduced');
  if (norm(input.rxLabel) !== norm(input.itemLabel)) kinds.push('substituted');
  return kinds;
}

/** S'il y a un écart, le motif est obligatoire (et borné). */
export function checkDeviation(kinds: readonly DeviationKind[], reason: string | undefined): { kinds: DeviationKind[]; reason: string } | undefined {
  if (kinds.length === 0) return undefined;
  const r = (reason ?? '').trim();
  if (!r) fail('deviationReasonRequired');
  if (r.length > MAX_DEVIATION_REASON) fail('deviationReasonTooLong', { max: MAX_DEVIATION_REASON });
  return { kinds: [...kinds], reason: r };
}

export type DispensationStatus = 'prepared' | 'dispensed' | 'cancelled';
export interface Dispensation {
  id: string;
  number: string;
  prescriptionId: string;
  rxNumber: string;
  patientId: string;
  patientName: string;
  status: DispensationStatus;
  lines: DispensationLine[];
  invoiceId: string;
  preparedBy: string;
  preparedAt: string;
  paymentException?: { at: string; by: string; reason: string };
  dispensed?: { at: string; by: string };
  cancellation?: { at: string; by: string; reason: string; refundPending: boolean };
}

export class PharmacyError extends Error {
  constructor(readonly code: string, readonly params: Record<string, string | number> = {}) {
    super(code);
    this.name = 'PharmacyError';
  }
}
const fail = (code: string, params?: Record<string, string | number>): never => {
  throw new PharmacyError(code, params);
};

export const isExpired = (lot: StockLot, today: string): boolean => lot.expiresAt !== null && lot.expiresAt < today;

/** Quantité disponible à la dispensation : lots non périmés uniquement. */
export function available(lots: readonly StockLot[], itemId: string, today: string): number {
  return round2(lots.filter((l) => l.itemId === itemId && l.quantity > 0 && !isExpired(l, today)).reduce((s, l) => s + l.quantity, 0));
}

/** Premier périmé, premier sorti (FEFO). Les lots périmés ne sont JAMAIS utilisés. Ne modifie pas les lots. */
export function allocateFefo(lots: readonly StockLot[], itemId: string, quantity: number, today: string): { lotId: string; lotNumber: string; quantity: number }[] {
  if (!isQuantity(quantity)) fail('quantityInvalid');
  const usable = lots
    .filter((l) => l.itemId === itemId && l.quantity > 0 && !isExpired(l, today))
    .sort((a, b) => (a.expiresAt ?? '9999-12-31').localeCompare(b.expiresAt ?? '9999-12-31') || a.lotNumber.localeCompare(b.lotNumber));
  let left = quantity;
  const out: { lotId: string; lotNumber: string; quantity: number }[] = [];
  for (const lot of usable) {
    if (left === 0) break;
    const take = Math.min(lot.quantity, left);
    out.push({ lotId: lot.id, lotNumber: lot.lotNumber, quantity: take });
    left = round2(left - take);
  }
  if (left > 0) fail('insufficientStock', { available: round2(quantity - left) });
  return out;
}

export function checkReceive(input: { lotNumber: string; quantity: number; expiresAt: string | null }, today: string): void {
  if (!input.lotNumber.trim()) fail('lotRequired');
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) fail('quantityInvalid');
  if (input.expiresAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt)) fail('dateInvalid');
  if (input.expiresAt !== null && input.expiresAt < today) fail('alreadyExpired');
}

export function checkAdjust(lot: StockLot, delta: number, reason: string): void {
  if (!reason.trim()) fail('reasonRequired');
  if (!Number.isInteger(delta) || delta === 0) fail('quantityInvalid');
  if (lot.quantity + delta < 0) fail('negativeStock');
}

export interface RxLineRef { label: string; quantity: number }
/** Quantité restant à dispenser sur chaque ligne : prescrit − (dispensé + préparé non annulé). */
export function remaining(lines: readonly RxLineRef[], dispensations: readonly Dispensation[]): number[] {
  return lines.map((l, i) => round2(l.quantity - dispensations.filter((d) => d.status !== 'cancelled').flatMap((d) => d.lines).filter((x) => x.rxLineIndex === i).reduce((s, x) => s + x.quantity, 0)));
}

export function allDispensed(lines: readonly RxLineRef[], dispensations: readonly Dispensation[]): boolean {
  const done = dispensations.filter((d) => d.status === 'dispensed');
  return lines.every((l, i) => done.flatMap((d) => d.lines).filter((x) => x.rxLineIndex === i).reduce((s, x) => s + x.quantity, 0) + 0.001 >= l.quantity);
}

export function checkPrepare(lines: readonly { rxLineIndex: number; quantity: number }[], rxLines: readonly RxLineRef[], prior: readonly Dispensation[]): void {
  if (lines.length === 0) fail('linesRequired');
  const left = remaining(rxLines, prior);
  const asked = new Map<number, number>();
  for (const l of lines) {
    if (!Number.isInteger(l.rxLineIndex) || l.rxLineIndex < 0 || l.rxLineIndex >= rxLines.length) fail('unknownLine');
    if (!isQuantity(l.quantity)) fail('quantityInvalid');
    asked.set(l.rxLineIndex, round2((asked.get(l.rxLineIndex) ?? 0) + l.quantity));
  }
  for (const [i, q] of asked) if (q > left[i]!) fail('overDispense', { label: rxLines[i]!.label, remaining: left[i]! });
}

export interface PaymentGate { patientBalance: number; creditAuthorized: boolean; cancelledInvoice: boolean }
export const paymentCleared = (d: Dispensation, gate: PaymentGate): boolean => !gate.cancelledInvoice && (gate.patientBalance <= 0 || gate.creditAuthorized || Boolean(d.paymentException));

export function nextNumber(existing: readonly { number: string }[], year: number): string {
  const prefix = `DIS-${year}-`;
  const last = existing.map((o) => o.number).filter((n) => n.startsWith(prefix)).map((n) => Number(n.slice(prefix.length))).filter(Number.isFinite);
  return `${prefix}${String(Math.max(0, ...last) + 1).padStart(5, '0')}`;
}

export function grantException(d: Dispensation, input: { by: string; now: string; reason: string }): Dispensation {
  if (d.status !== 'prepared') fail('wrongStatus', { status: d.status });
  if (!input.reason.trim()) fail('reasonRequired');
  if (d.paymentException) fail('exceptionExists');
  return { ...d, paymentException: { at: input.now, by: input.by, reason: input.reason.trim() } };
}

export function markDispensed(d: Dispensation, lines: DispensationLine[], input: { by: string; now: string }, gate: PaymentGate): Dispensation {
  if (d.status !== 'prepared') fail('wrongStatus', { status: d.status });
  if (!paymentCleared(d, gate)) fail('paymentRequired');
  return { ...d, status: 'dispensed', lines, dispensed: { at: input.now, by: input.by } };
}

export function cancel(d: Dispensation, input: { by: string; now: string; reason: string; refundPending: boolean }): Dispensation {
  if (!input.reason.trim()) fail('reasonRequired');
  if (d.status === 'cancelled') fail('alreadyCancelled');
  if (d.status === 'dispensed') fail('cannotCancelDispensed');
  return { ...d, status: 'cancelled', cancellation: { at: input.now, by: input.by, reason: input.reason.trim(), refundPending: input.refundPending } };
}
