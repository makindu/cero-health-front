import { describe, expect, it } from 'vitest';
import { paymentReceipt, type PaymentReceiptLabels } from './payment-receipt';

const L: PaymentReceiptLabels = { title: 'Reçu de paiement', patient: 'Patient', act: 'Acte', method: 'Mode', amount: 'Montant payé', remaining: 'Reste à payer', invoices: 'Factures', footer: 'Merci' };
const base = { id: '12', patientName: 'Louise', methodText: 'Espèces', amountText: '50,00 $US', dateTimeText: '25/11/2026 13:30' };

describe('reçu de paiement patient', () => {
  it('numérote depuis le paiement et met le montant en évidence', () => {
    const r = paymentReceipt(base, L);
    expect(r.number).toBe('PAY-12');
    expect(r.lines.find((l) => l.label === 'Montant payé')?.strong).toBe(true);
  });

  it('omet acte, factures et reste dû quand ils sont inconnus ou sans objet', () => {
    const labels = paymentReceipt({ ...base, invoiceCount: 1 }, L).lines.map((l) => l.label);
    expect(labels).toEqual(['Patient', 'Mode', 'Montant payé']);
  });

  it('indique le nombre de factures d\'un règlement groupé et le reste dû, même nul', () => {
    const lines = paymentReceipt({ ...base, invoiceCount: 3, actText: 'Consultation', remainingText: '0,00 $US' }, L).lines;
    expect(lines.find((l) => l.label === 'Factures')?.value).toBe('3');
    expect(lines.find((l) => l.label === 'Reste à payer')?.value).toBe('0,00 $US');
  });
});
