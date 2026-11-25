import { describe, expect, it } from 'vitest';
import { settlementReceipt, type SettlementReceiptLabels } from './settlement-receipt';

const L: SettlementReceiptLabels = { title: 'Reçu de règlement', organization: 'Organisme', patient: 'Patient', amount: 'Montant reçu', method: 'Paiement', mode: 'Répartition', reference: 'Référence', paidOn: 'Reçu le', remaining: 'Reste dû', footer: 'Merci' };
const base = { id: '8', organizationName: 'CERO CEPATEC', amountText: '300,00 $US', methodText: 'Virement', modeText: 'Les plus anciennes', reference: '', paidOnText: '25/11/2026', dateTimeText: '25/11/2026 12:47' };

describe('reçu de règlement d\'organisme', () => {
  it('numérote le reçu depuis le règlement et met le montant en évidence', () => {
    const r = settlementReceipt(base, L);
    expect(r.number).toBe('RGL-8');
    expect(r.lines.find((l) => l.label === 'Montant reçu')).toEqual({ label: 'Montant reçu', value: '300,00 $US', strong: true });
  });

  it('n\'imprime ni référence vide, ni patient absent, ni reste dû inconnu', () => {
    const labels = settlementReceipt(base, L).lines.map((l) => l.label);
    expect(labels).not.toContain('Référence');
    expect(labels).not.toContain('Patient');
    expect(labels).not.toContain('Reste dû');
  });

  it('ajoute la référence, le patient et le reste dû quand ils existent', () => {
    const labels = settlementReceipt({ ...base, reference: ' VIR-1 ', patientName: 'Louise', remainingText: '63,30 $US' }, L).lines;
    expect(labels.find((l) => l.label === 'Référence')?.value).toBe('VIR-1');
    expect(labels.map((l) => l.label)).toEqual(expect.arrayContaining(['Patient', 'Reste dû']));
  });
});
