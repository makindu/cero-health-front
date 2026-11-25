import type { ReceiptContent } from '../_shared/receipt/ReceiptPrintDialog';

/** Libellés déjà traduits par l'écran : ce module reste pur (testable sans interface). */
export interface SettlementReceiptLabels {
  title: string; organization: string; patient: string; amount: string; method: string; mode: string; reference: string; paidOn: string; remaining: string; footer: string;
}

export interface SettlementReceiptInput {
  id: string;
  organizationName: string;
  patientName?: string;
  amountText: string;
  methodText: string;
  modeText: string;
  reference: string;
  paidOnText: string;
  dateTimeText: string;
  remainingText?: string;
}

/** Contenu du reçu de règlement d'un organisme. Les montants viennent du serveur ou de la saisie validée, jamais recalculés ici. */
export function settlementReceipt(i: SettlementReceiptInput, L: SettlementReceiptLabels): ReceiptContent {
  const lines = [
    { label: L.organization, value: i.organizationName },
    ...(i.patientName ? [{ label: L.patient, value: i.patientName }] : []),
    { label: L.paidOn, value: i.paidOnText },
    { label: L.method, value: i.methodText },
    { label: L.mode, value: i.modeText },
    ...(i.reference.trim() ? [{ label: L.reference, value: i.reference.trim() }] : []),
    { label: L.amount, value: i.amountText, strong: true },
    ...(i.remainingText ? [{ label: L.remaining, value: i.remainingText }] : []),
  ];

  return { title: L.title, number: `RGL-${i.id}`, dateTime: i.dateTimeText, lines, footer: L.footer };
}
