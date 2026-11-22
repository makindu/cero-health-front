import { describe, expect, it } from 'vitest';
import { dispensationFromApi } from './pharmacy-api';

const base = {
  id: 7, number: 'DSP-2026-00007', status: 'prepared', prescription_id: 3, prescription_number: 'RX-2026-00003', patient_id: 5,
  patient: { patient_number: 'P1', full_name: 'Alpha Test' }, prepared_by_user_id: 9, prepared_at: '2026-11-22T08:00:00Z', payment_state: 'unpaid',
  lines: [{
    line_no: 1, prescription_item_id: 11, catalog_item_id: 4, quantity: 3, rx_label: 'Amoxicilline', item_label: 'Amoxicilline 500',
    deviation: { kinds: ['reduced'], reason: 'Stock réduit' }, allocations: [{ stock_history_id: 21, quantity: 3, batch_number: 'L-1' }],
  }],
};

describe('dispensationFromApi', () => {
  it('traduit la dispensation et bloque la remise tant que le paiement manque', () => {
    const v = dispensationFromApi(base);
    expect(v.dispensation).toMatchObject({ id: '7', patientName: 'Alpha Test', rxNumber: 'RX-2026-00003', status: 'prepared' });
    expect(v.dispensation.lines[0]).toMatchObject({ rxLabel: 'Amoxicilline', itemLabel: 'Amoxicilline 500', quantity: 3, deviation: { kinds: ['reduced'], reason: 'Stock réduit' } });
    expect(v.dispensation.lines[0]!.lots).toEqual([{ lotId: '21', lotNumber: 'L-1', quantity: 3 }]);
    expect(v.paymentState).toBe('unpaid');
    expect(v.paymentCleared).toBe(false);
  });

  it.each([['paid', true], ['waived', true], ['exception', true], ['no_invoice', false], ['invoice_cancelled', false]])('état de paiement %s -> remise possible : %s', (state, cleared) => {
    expect(dispensationFromApi({ ...base, payment_state: state }).paymentCleared).toBe(cleared);
  });

  it('reprend la remise et l’annulation', () => {
    const v = dispensationFromApi({ ...base, status: 'cancelled', cancellation: { reason: 'Erreur', by_user_id: 9, at: '2026-11-22T09:00:00Z', refund_pending: true } });
    expect(v.dispensation.cancellation).toMatchObject({ reason: 'Erreur', refundPending: true });
  });
});
