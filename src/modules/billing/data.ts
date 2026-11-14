import { isoDay } from '@/utils/dates';
import { demoPerson, pick } from '../_shared/demo-people';

export type InvoiceStatus = 'draft' | 'issued' | 'partial' | 'paid' | 'cancelled';
export type LineKind = 'consultation' | 'laboratory' | 'pharmacy' | 'hospitalization' | 'procedure';
export type Payer = 'self' | 'insurance' | 'company';

export interface InvoiceLine {
  kind: LineKind;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  id: string;
  patientId: string;
  patientName: string;
  issuedAt: string;
  currency: string;
  amount: number;
  paid: number;
  status: InvoiceStatus;
  payer: Payer;
  lines: InvoiceLine[];
}

/**
 * Jeu de démonstration de l'ANCIEN modèle de facture (montants en unités majeures), conservé UNIQUEMENT pour le compteur
 * « factures impayées » du tableau de bord en mode démonstration. La facturation réelle (mode local) vit dans modules/finance.
 */

/** Devise de la démonstration (la devise réelle dépend de l'établissement, à fournir par CERO ID CORE). */
export const DEMO_CURRENCY = 'USD';

const KINDS: readonly LineKind[] = ['consultation', 'laboratory', 'pharmacy', 'hospitalization', 'procedure'];
const PRICES: Record<LineKind, number> = { consultation: 10, laboratory: 15, pharmacy: 8, hospitalization: 40, procedure: 60 };
const STATUSES: readonly InvoiceStatus[] = ['paid', 'issued', 'partial', 'paid', 'draft', 'issued', 'cancelled', 'paid'];

/** FICTIF : 30 factures. Les montants sont arbitraires. */
export const DEMO_INVOICES: readonly Invoice[] = Array.from({ length: 30 }, (_, i) => {
  const person = demoPerson((i * 7) % 24);
  const lines: InvoiceLine[] = [0, 1, 2].slice(0, 1 + (i % 3)).map((n) => {
    const kind = pick(KINDS, i + n);
    return { kind, quantity: 1 + ((i + n) % 3), unitPrice: PRICES[kind] };
  });
  const amount = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const status = pick(STATUSES, i);
  const paid = status === 'paid' ? amount : status === 'partial' ? Math.round(amount / 2) : 0;
  return {
    id: `DEMO-F-${String(i + 1).padStart(4, '0')}`,
    patientId: person.id,
    patientName: person.fullName,
    issuedAt: isoDay(-(i % 25)),
    currency: DEMO_CURRENCY,
    amount,
    paid,
    status,
    payer: pick<Payer>(['self', 'self', 'insurance', 'company'], i),
    lines,
  };
});
