/**
 * Règles du laboratoire (fonctions pures). AUCUNE valeur de résultat n'est jamais proposée ni calculée :
 * valeurs, unités et valeurs de référence sont saisies par le laborantin, puis validées par une personne habilitée.
 */
export type LabStatus = 'requested' | 'collected' | 'inProgress' | 'resultEntered' | 'validated' | 'cancelled';
export type LabPriority = 'routine' | 'urgent';
export type LabFlag = 'unspecified' | 'normal' | 'abnormal';

export const LAB_FLOW: readonly LabStatus[] = ['requested', 'collected', 'inProgress', 'resultEntered', 'validated'];

export interface LabTestLine {
  code: string;
  label: string;
  catalogItemId: string;
}

export interface LabResultValue {
  code: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag: LabFlag;
  comment: string;
}

export interface LabAmendment {
  at: string;
  by: string;
  reason: string;
  previous: LabResultValue[];
}

export interface LabOrder {
  id: string;
  number: string;
  patientId: string;
  patientName: string;
  consultationId?: string;
  requestedBy: string;
  requestedAt: string;
  priority: LabPriority;
  clinicalNote: string;
  status: LabStatus;
  tests: LabTestLine[];
  /** Facture créée avec la demande (même transaction). */
  invoiceId: string;
  /** Prélèvement autorisé sans paiement : exception tracée. */
  paymentException?: { at: string; by: string; reason: string };
  collected?: { at: string; by: string; sampleNote: string };
  started?: { at: string; by: string };
  results: LabResultValue[];
  resultsEnteredBy?: { at: string; by: string };
  validation?: { at: string; by: string };
  amendments: LabAmendment[];
  cancellation?: { at: string; by: string; reason: string; refundPending: boolean };
}

export class LabError extends Error {
  constructor(readonly code: string, readonly params: Record<string, string | number> = {}) {
    super(code);
    this.name = 'LabError';
  }
}
const fail = (code: string, params?: Record<string, string | number>): never => {
  throw new LabError(code, params);
};

export function nextLabNumber(existing: readonly Pick<LabOrder, 'number'>[], year: number): string {
  const prefix = `LAB-${year}-`;
  const last = existing.map((o) => o.number).filter((n) => n.startsWith(prefix)).map((n) => Number(n.slice(prefix.length))).filter(Number.isFinite);
  return `${prefix}${String(Math.max(0, ...last) + 1).padStart(5, '0')}`;
}

export interface PaymentGate {
  /** Reste dû par le patient sur la facture de la demande. */
  patientBalance: number;
  creditAuthorized: boolean;
  cancelledInvoice: boolean;
  /** Dispensé de payer avant prélèvement (catégorie du patient ou patient hospitalisé). */
  waived?: boolean;
}

/** Le prélèvement exige : part patient soldée (0 pour un assuré à 100 %), OU crédit autorisé, OU exception tracée. */
export function paymentCleared(order: LabOrder, gate: PaymentGate): boolean {
  if (gate.cancelledInvoice) return false;
  return Boolean(gate.waived) || gate.patientBalance <= 0 || gate.creditAuthorized || Boolean(order.paymentException);
}

export function buildOrder(input: {
  id: string; number: string; patientId: string; patientName: string; consultationId?: string; tests: LabTestLine[];
  priority: LabPriority; clinicalNote: string; by: string; now: string; invoiceId: string;
}): LabOrder {
  if (input.tests.length === 0) fail('testsRequired');
  const codes = input.tests.map((t) => t.code);
  if (new Set(codes).size !== codes.length) fail('duplicateTest');
  return {
    id: input.id, number: input.number, patientId: input.patientId, patientName: input.patientName, consultationId: input.consultationId,
    requestedBy: input.by, requestedAt: input.now, priority: input.priority, clinicalNote: input.clinicalNote.trim(), status: 'requested',
    tests: input.tests, invoiceId: input.invoiceId, results: [], amendments: [],
  };
}

export function grantException(order: LabOrder, input: { by: string; now: string; reason: string }): LabOrder {
  if (order.status !== 'requested') fail('wrongStatus', { status: order.status });
  if (!input.reason.trim()) fail('reasonRequired');
  if (order.paymentException) fail('exceptionExists');
  return { ...order, paymentException: { at: input.now, by: input.by, reason: input.reason.trim() } };
}

export function collect(order: LabOrder, input: { by: string; now: string; sampleNote: string }, gate: PaymentGate): LabOrder {
  if (order.status !== 'requested') fail('wrongStatus', { status: order.status });
  if (!paymentCleared(order, gate)) fail('paymentRequired');
  return { ...order, status: 'collected', collected: { at: input.now, by: input.by, sampleNote: input.sampleNote.trim() } };
}

export function start(order: LabOrder, input: { by: string; now: string }): LabOrder {
  if (order.status !== 'collected') fail('wrongStatus', { status: order.status });
  return { ...order, status: 'inProgress', started: { at: input.now, by: input.by } };
}

const clean = (v: LabResultValue): LabResultValue => ({ ...v, value: v.value.trim(), unit: v.unit.trim(), referenceRange: v.referenceRange.trim(), comment: v.comment.trim() });

function checkValues(order: LabOrder, values: readonly LabResultValue[]): LabResultValue[] {
  const known = new Set(order.tests.map((t) => t.code));
  for (const v of values) if (!known.has(v.code)) fail('unknownTest', { code: v.code });
  return values.map(clean);
}

/** Saisie (ou enregistrement partiel). Passe à « résultat saisi » seulement quand CHAQUE examen a une valeur. */
export function enterResults(order: LabOrder, values: readonly LabResultValue[], input: { by: string; now: string }): LabOrder {
  if (order.status !== 'inProgress') fail('wrongStatus', { status: order.status });
  const cleaned = checkValues(order, values);
  const complete = order.tests.every((t) => cleaned.some((v) => v.code === t.code && v.value !== ''));
  return { ...order, results: cleaned, status: complete ? 'resultEntered' : 'inProgress', resultsEnteredBy: complete ? { at: input.now, by: input.by } : order.resultsEnteredBy };
}

/** Retour en saisie tant que le résultat n'est pas validé (correction d'une erreur de frappe). */
export function reopenResults(order: LabOrder): LabOrder {
  if (order.status !== 'resultEntered') fail('wrongStatus', { status: order.status });
  return { ...order, status: 'inProgress' };
}

export function validate(order: LabOrder, input: { by: string; now: string }): LabOrder {
  if (order.status !== 'resultEntered') fail('wrongStatus', { status: order.status });
  return { ...order, status: 'validated', validation: { at: input.now, by: input.by } };
}

/** Rectification d'un résultat validé : l'ancien est CONSERVÉ dans l'historique, motif obligatoire. */
export function amend(order: LabOrder, values: readonly LabResultValue[], input: { by: string; now: string; reason: string }): LabOrder {
  if (order.status !== 'validated') fail('wrongStatus', { status: order.status });
  if (!input.reason.trim()) fail('reasonRequired');
  const cleaned = checkValues(order, values);
  if (!order.tests.every((t) => cleaned.some((v) => v.code === t.code && v.value !== ''))) fail('incompleteResults');
  return { ...order, results: cleaned, validation: { at: input.now, by: input.by }, amendments: [...order.amendments, { at: input.now, by: input.by, reason: input.reason.trim(), previous: order.results }] };
}

/** Annulation : seulement avant le prélèvement. `refundPending` signale un paiement à rembourser par la caisse. */
export function cancel(order: LabOrder, input: { by: string; now: string; reason: string; refundPending: boolean }): LabOrder {
  if (!input.reason.trim()) fail('reasonRequired');
  if (order.status !== 'requested') fail(order.status === 'cancelled' ? 'alreadyCancelled' : 'cannotCancelAfterCollect');
  return { ...order, status: 'cancelled', cancellation: { at: input.now, by: input.by, reason: input.reason.trim(), refundPending: input.refundPending } };
}
