/**
 * Règles des prescriptions (fonctions pures).
 * Posologie, fréquence, durée : saisies PAR LE PRESCRIPTEUR. L'application n'en propose, n'en calcule et n'en contrôle aucune
 * (pas d'aide à la décision clinique dans cette version).
 * Prescrire n'est ni dispenser ni administrer : la dispensation appartient à la pharmacie (phase suivante).
 */
import { isQuantity } from '@/utils/numbers';
export type RxStatus = 'toValidate' | 'validated' | 'dispensed' | 'cancelled';

export interface RxItem {
  label: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  instructions: string;
}

export interface Rx {
  id: string;
  number: string;
  patientId: string;
  patientName: string;
  consultationId?: string;
  /** Visite d'hospitalisation à l'origine de l'ordonnance (mode API). */
  admissionVisitId?: string;
  prescriber: string;
  /** Identifiant du prescripteur (absent des ordonnances anciennes) : sert à lui adresser les notifications. */
  prescriberId?: string;
  prescribedAt: string;
  status: RxStatus;
  items: RxItem[];
  note: string;
  validation?: { at: string; by: string };
  cancellation?: { at: string; by: string; reason: string };
}

export class RxError extends Error {
  constructor(readonly code: string, readonly params: Record<string, string | number> = {}) {
    super(code);
    this.name = 'RxError';
  }
}
const fail = (code: string, params?: Record<string, string | number>): never => {
  throw new RxError(code, params);
};

export const MAX_TEXT = 200;

export function cleanItem(i: RxItem): RxItem {
  return { label: i.label.trim(), dosage: i.dosage.trim(), frequency: i.frequency.trim(), duration: i.duration.trim(), quantity: i.quantity, instructions: i.instructions.trim() };
}

export function checkItems(items: readonly RxItem[]): RxItem[] {
  if (items.length === 0) fail('itemsRequired');
  return items.map((raw, index) => {
    const i = cleanItem(raw);
    if (!i.label) fail('labelRequired', { line: index + 1 });
    if (!isQuantity(i.quantity)) fail('quantityInvalid', { line: index + 1 });
    if (!i.dosage || !i.frequency) fail('posologyRequired', { line: index + 1 });
    if ([i.label, i.dosage, i.frequency, i.duration, i.instructions].some((x) => x.length > 2 * MAX_TEXT)) fail('textTooLong', { line: index + 1 });
    return i;
  });
}

export function nextRxNumber(existing: readonly Pick<Rx, 'number'>[], year: number): string {
  const prefix = `RX-${year}-`;
  const last = existing.map((o) => o.number).filter((n) => n.startsWith(prefix)).map((n) => Number(n.slice(prefix.length))).filter(Number.isFinite);
  return `${prefix}${String(Math.max(0, ...last) + 1).padStart(5, '0')}`;
}

export function buildRx(input: { id: string; number: string; patientId: string; patientName: string; consultationId?: string; items: readonly RxItem[]; note: string; by: string; byId?: string; now: string }): Rx {
  return {
    id: input.id, number: input.number, patientId: input.patientId, patientName: input.patientName, consultationId: input.consultationId,
    prescriber: input.by, ...(input.byId ? { prescriberId: input.byId } : {}), prescribedAt: input.now, status: 'toValidate', items: checkItems(input.items), note: input.note.trim(),
  };
}

export function validateRx(rx: Rx, input: { by: string; now: string }): Rx {
  if (rx.status !== 'toValidate') fail('wrongStatus', { status: rx.status });
  return { ...rx, status: 'validated', validation: { at: input.now, by: input.by } };
}

export function cancelRx(rx: Rx, input: { by: string; now: string; reason: string }): Rx {
  if (!input.reason.trim()) fail('reasonRequired');
  if (rx.status === 'cancelled') fail('alreadyCancelled');
  if (rx.status === 'dispensed') fail('cannotCancelDispensed');
  return { ...rx, status: 'cancelled', cancellation: { at: input.now, by: input.by, reason: input.reason.trim() } };
}

/** Passage à « dispensée » : décidé par la pharmacie quand TOUTES les lignes ont été remises. */
export function markRxDispensed(rx: Rx): Rx {
  if (rx.status !== 'validated') fail('wrongStatus', { status: rx.status });
  return { ...rx, status: 'dispensed' };
}
