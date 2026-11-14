import { describe, expect, it } from 'vitest';
import { addCalendarMonths, buildExemption, buildFeePayment, configInForce, daysBetween, feeStatus, type ValidityConfig } from './validity';

const H: ValidityConfig[] = [{ effectiveFrom: '2026-01-01', months: 1, mode: 'clamp' }];

describe('validité des frais de consultation', () => {
  it('mois calendaires avec règle de fin de mois', () => {
    expect(addCalendarMonths('2026-01-31', 1, 'clamp')).toBe('2026-02-28');
    expect(addCalendarMonths('2028-01-31', 1, 'clamp')).toBe('2028-02-29');
    expect(addCalendarMonths('2026-01-15', 1, 'clamp')).toBe('2026-02-15');
    expect(addCalendarMonths('2026-01-15', 1, 'endOfMonth')).toBe('2026-02-28');
    expect(addCalendarMonths('2026-11-14', 3, 'clamp')).toBe('2027-02-14');
    expect(addCalendarMonths('2026-12-10', 2, 'clamp')).toBe('2027-02-10');
    expect(() => addCalendarMonths('2026-01-10', 0, 'clamp')).toThrow();
  });

  it("échéance incluse : valable le jour même d'échéance, expirée le lendemain", () => {
    const p = buildFeePayment({ id: 'F1', patientId: 'P1', paidDay: '2026-11-14', history: H });
    expect(p.validUntil).toBe('2026-12-14');
    expect(feeStatus([p], 'P1', '2026-12-14')).toMatchObject({ state: 'valid', newPaymentRequired: false, daysLeft: 0 });
    expect(feeStatus([p], 'P1', '2026-12-15')).toMatchObject({ state: 'expired', newPaymentRequired: true, daysLeft: -1 });
    expect(feeStatus([p], 'P1', '2026-11-20')).toMatchObject({ state: 'valid', daysLeft: 24 });
    expect(feeStatus([], 'P1', '2026-11-20')).toEqual({ state: 'none', newPaymentRequired: true });
    expect(feeStatus([p], 'P2', '2026-11-20').state).toBe('none');
  });

  it('non rétroactif : changer la configuration ne modifie pas les paiements déjà faits', () => {
    const before = buildFeePayment({ id: 'F1', patientId: 'P1', paidDay: '2026-11-14', history: H });
    const history: ValidityConfig[] = [...H, { effectiveFrom: '2026-12-01', months: 6, mode: 'endOfMonth', changedBy: 'admin', reason: 'Nouvelle politique' }];
    expect(before.validUntil).toBe('2026-12-14');
    expect(configInForce(history, '2026-11-30')?.months).toBe(1);
    expect(configInForce(history, '2026-12-01')?.months).toBe(6);
    const after = buildFeePayment({ id: 'F2', patientId: 'P1', paidDay: '2026-12-02', history });
    expect(after.validUntil).toBe('2027-06-30');
    expect(after.config).toMatchObject({ months: 6, mode: 'endOfMonth' });
    expect(before.config.months).toBe(1);
  });

  it('paiement annulé : plus de validité ; exemption : motif obligatoire et tracée', () => {
    const p = { ...buildFeePayment({ id: 'F1', patientId: 'P1', paidDay: '2026-11-14', history: H }), voided: true };
    expect(feeStatus([p], 'P1', '2026-11-15').state).toBe('none');
    expect(() => buildExemption({ id: 'E1', patientId: 'P1', day: '2026-11-14', history: H, reason: '  ', by: 'u' })).toThrow();
    const e = buildExemption({ id: 'E1', patientId: 'P1', day: '2026-11-14', history: H, reason: 'Cas social validé', by: 'Responsable' });
    expect(feeStatus([e], 'P1', '2026-11-15')).toMatchObject({ state: 'valid', source: 'exemption' });
    expect(e.exemption).toEqual({ reason: 'Cas social validé', by: 'Responsable' });
  });

  it('calcul de jours indépendant du fuseau horaire', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});
