import { healthClient } from '@/core/api';
import type { ReceiptFormat } from './receipt';

export type ReceiptKind = 'payment' | 'settlement';
export interface ReceiptCopy { kind: ReceiptKind; id: string; copyNumber: number; isDuplicate: boolean; firstPrintedAt: string | null }

type Row = Record<string, unknown>;
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});

export function copyFrom(r: Row): ReceiptCopy {
  const n = Number(r.copy_number);
  return {
    kind: r.kind === 'settlement' ? 'settlement' : 'payment', id: String(r.id ?? ''),
    copyNumber: Number.isInteger(n) && n >= 1 ? n : 1, isDuplicate: r.is_duplicate === true, firstPrintedAt: r.first_printed_at ? String(r.first_printed_at) : null,
  };
}

export const apiReceipts = {
  /** Enregistre l'impression et renvoie le numéro de copie (1 = original). La clé évite qu'un double clic fabrique un faux duplicata. */
  register: async (kind: ReceiptKind, id: string, format: ReceiptFormat, key: string): Promise<ReceiptCopy> =>
    copyFrom(rec((await healthClient.post<Row>('/receipts/print', { kind, id: Number(id), format }, { headers: { 'Idempotency-Key': key } })).data)),
};
