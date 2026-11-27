import type { ReceiptContent } from '../_shared/receipt/ReceiptPrintDialog';

export interface PaymentReceiptLabels { title: string; patient: string; act: string; method: string; amount: string; remaining: string; invoices: string; footer: string; total?: string; paid?: string }

export interface PaymentReceiptInput {
  id: string;
  patientName: string;
  actText?: string;
  methodText: string;
  amountText: string;
  /** Reste à payer sur la facture (ou le solde) après ce paiement ; absent si inconnu. */
  remainingText?: string;
  /** Règlement groupé : nombre de factures touchées. */
  invoiceCount?: number;
  dateTimeText: string;
  /** Détail de la facture : une ligne par article (désignation × quantité, montant de la ligne). */
  items?: { text: string; amountText: string }[];
  totalText?: string;
  paidText?: string;
}

/** Contenu du reçu d'un paiement patient. Les montants sont déjà ceux du serveur, rien n'est recalculé ici. */
export function paymentReceipt(i: PaymentReceiptInput, L: PaymentReceiptLabels): ReceiptContent {
  const lines = [
    { label: L.patient, value: i.patientName },
    ...(i.actText ? [{ label: L.act, value: i.actText }] : []),
    ...(i.items ?? []).map((x) => ({ label: x.text, value: x.amountText })),
    ...(i.totalText ? [{ label: L.total ?? 'Total', value: i.totalText, strong: true }] : []),
    ...(i.paidText ? [{ label: L.paid ?? 'Déjà payé', value: i.paidText }] : []),
    ...(i.invoiceCount && i.invoiceCount > 1 ? [{ label: L.invoices, value: String(i.invoiceCount) }] : []),
    { label: L.method, value: i.methodText },
    { label: L.amount, value: i.amountText, strong: true },
    ...(i.remainingText ? [{ label: L.remaining, value: i.remainingText }] : []),
  ];

  return { title: L.title, number: `PAY-${i.id}`, dateTime: i.dateTimeText, lines, footer: L.footer };
}
