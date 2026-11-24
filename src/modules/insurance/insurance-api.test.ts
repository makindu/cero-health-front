import { describe, expect, it } from 'vitest';
import { catalogHitFrom, currencyFrom, defaultCurrency, authorizationFrom, coverageFrom, contractFrom, subscriptionFrom, dueFrom, isOpenDue, organizationFrom, organizationPayload, settlePayload, settleResultFrom, statementFrom } from './insurance-api';

describe('assurance API', () => {
  it('traduit un organisme', () => {
    expect(organizationFrom({ id: 3, code: 'SONAS', name: 'Sonas', kind: 'insurer', contact_person: null, phone: '+243', email: null, status: 'active', valid_from: '2026-01-01', valid_to: null, conditions: null }))
      .toEqual({ id: '3', code: 'SONAS', name: 'Sonas', kind: 'insurer', contactPerson: '', phone: '+243', email: '', status: 'active', validFrom: '2026-01-01', validTo: '', conditions: '' });
  });

  it('à la création : code en majuscules, jamais de statut ; en modification : jamais de code', () => {
    const v = { code: ' sonas ', name: ' Sonas ', kind: 'insurer' as const, contactPerson: '', phone: '', email: '', status: 'suspended' as const, validFrom: '2026-01-01', validTo: '', conditions: '' };
    const create = organizationPayload(v, true);
    expect(create).toMatchObject({ code: 'SONAS', name: 'Sonas', valid_to: null, contact_person: null });
    expect(create).not.toHaveProperty('status');
    const update = organizationPayload(v, false);
    expect(update).not.toHaveProperty('code');
    expect(update).toMatchObject({ status: 'suspended' });
  });

  it('lit une créance avec le patient du relevé, ou un repli sans nom', () => {
    const d = dueFrom({ id: 5, link_id: 2, patient_id: 9, currency: 'USD', amount_minor: 3000, settled_minor: 1000, rejected_minor: 0, outstanding_minor: 2000, status: 'partial', created_at: '2026-11-20 09:00:00', patient: { id: 9, file_number: 'P-009', full_name: 'Alpha Test' } });
    expect(d).toMatchObject({ id: '5', patientName: 'Alpha Test', fileNumber: 'P-009', outstandingMinor: 2000 });
    expect(dueFrom({ id: 6, patient_id: 4, status: 'open' }).patientName).toBe('#4');
  });

  it('ne propose de régler ou rejeter que les créances ouvertes avec un reste', () => {
    expect(isOpenDue({ status: 'open', outstandingMinor: 10 })).toBe(true);
    expect(isOpenDue({ status: 'partial', outstandingMinor: 10 })).toBe(true);
    expect(isOpenDue({ status: 'settled', outstandingMinor: 0 })).toBe(false);
    expect(isOpenDue({ status: 'open', outstandingMinor: 0 })).toBe(false);
    expect(isOpenDue({ status: 'cancelled', outstandingMinor: 0 })).toBe(false);
  });

  it('lit le relevé : totaux par devise, lignes et règlements', () => {
    const s = statementFrom({
      period: { from: '2026-10-23', to: '2026-11-22' },
      totals: [{ currency: 'USD', billed_minor: 5000, settled_minor: 2000, rejected_minor: 500, outstanding_minor: 2500 }],
      dues: [{ id: 1, patient_id: 2, currency: 'USD', amount_minor: 5000, status: 'partial' }],
      settlements: [{ id: 8, currency: 'USD', mode: 'oldest', patient_id: null, amount_minor: 2000, reference: 'VIR-1', paid_on: '2026-11-20', note: null }],
    });
    expect(s.totals).toEqual([{ currency: 'USD', billedMinor: 5000, settledMinor: 2000, rejectedMinor: 500, outstandingMinor: 2500 }]);
    expect(s.dues).toHaveLength(1);
    expect(s.settlements[0]).toMatchObject({ id: '8', patientId: '', reference: 'VIR-1', paidOn: '2026-11-20' });
    expect(statementFrom({})).toMatchObject({ totals: [], dues: [], settlements: [] });
  });

  it('prépare le règlement : patient seulement en mode « un adhérent », référence et note seulement si saisies', () => {
    const base = { amountMinor: 1500, currency: 'USD', paidOn: '2026-11-22', reference: ' ', note: '' };
    expect(settlePayload({ ...base, mode: 'oldest', patientId: '9' })).toEqual({ amount_minor: 1500, currency: 'USD', mode: 'oldest', paid_on: '2026-11-22' });
    expect(settlePayload({ ...base, mode: 'member', patientId: '9', reference: ' VIR-2 ', note: 'ok' }))
      .toEqual({ amount_minor: 1500, currency: 'USD', mode: 'member', paid_on: '2026-11-22', patient_id: 9, reference: 'VIR-2', note: 'ok' });
  });

  it('lit le résultat d\'un règlement', () => {
    expect(settleResultFrom({ settlement: { id: 4 }, allocations: [{ due_id: 1, amount_minor: 700 }, { due_id: 2, amount_minor: 800 }] }))
      .toEqual({ settlementId: '4', allocations: [{ dueId: '1', amountMinor: 700 }, { dueId: '2', amountMinor: 800 }] });
  });

  it('lit un contrat avec ses règles, les limites absentes restant « sans limite »', () => {
    const c = contractFrom({
      id: 2, organization_id: 3, label: 'Contrat A', currency: 'USD', valid_from: '2026-01-01', valid_to: '2026-12-31', status: 'active',
      franchise_per_episode_minor: null, ceiling_per_episode_minor: 100000, allows_complementary: true, can_be_complementary: false, conditions: null,
      rules: [{ category: null, item_code: null, coverage_bp: 8000, excluded: false, negotiated_unit_minor: null, ceiling_per_line_minor: 500, quota: 4, requires_authorization: true }],
    });
    expect(c).toMatchObject({ id: '2', organizationId: '3', franchiseMinor: null, ceilingMinor: 100000, allowsComplementary: true, canBeComplementary: false });
    expect(c.rules).toEqual([{ category: '', itemCode: '', catalogItemId: '', coverageBp: 8000, excluded: false, negotiatedUnitMinor: null, ceilingPerLineMinor: 500, quota: 4, requiresAuthorization: true }]);
    expect(contractFrom({}).rules).toEqual([]);
  });

  it('lit un abonnement avec ses bénéficiaires et ses remises', () => {
    const s = subscriptionFrom({
      id: 4, type: 'family', holder_name: 'Famille Test', patient_ids: [9, 12], price_minor: 12000, currency: 'USD', valid_from: '2026-01-01', valid_to: '2026-12-31',
      status: 'active', free_consultations: 3, discounts: { laboratory: 1000 }, included_categories: ['consultation'],
    });
    expect(s).toMatchObject({ id: '4', patientIds: ['9', '12'], priceMinor: 12000, freeConsultations: 3, discounts: { laboratory: 1000 }, includedCategories: ['consultation'] });
    expect(subscriptionFrom({ discounts: [] }).discounts).toEqual({});
    expect(subscriptionFrom({ free_consultations: null }).freeConsultations).toBeNull();
  });

  it('lit une couverture et ses bénéficiaires, plafond absent = sans plafond', () => {
    const c = coverageFrom({ id: 5, patient_id: 9, organization_id: 3, contract_id: 7, kind: 'insurance', policy_number: 'POL-1', card_number: null, valid_from: '2026-01-01', valid_to: '2026-12-31', status: 'pending', ceiling_remaining_minor: null, priority: 2, beneficiary_ids: [9, 11] });
    expect(c).toMatchObject({ id: '5', patientId: '9', contractId: '7', policyNumber: 'POL-1', cardNumber: '', status: 'pending', ceilingRemainingMinor: null, priority: 2, beneficiaryIds: ['9', '11'] });
    expect(coverageFrom({}).priority).toBe(1);
    expect(coverageFrom({ patient_name: 'Alice' }).patientName).toBe('Alice');
    expect(coverageFrom({}).patientName).toBe('');
  });

  it("lit l'acte du catalogue d'une règle, d'un accord et d'un résultat de recherche", () => {
    expect(authorizationFrom({ id: 2, item_code: 'CAT-42', catalog_item_id: 42, granted_at: 'x', note: null }).catalogItemId).toBe('42');
    expect(contractFrom({ id: 1, rules: [{ catalog_item_id: 42, coverage_bp: 10000 }] }).rules[0]?.catalogItemId).toBe('42');
    expect(catalogHitFrom({ id: 42, label: 'Césarienne', code: null, kind: 'service' })).toEqual({ id: '42', label: 'Césarienne', code: '', kind: 'service' });
  });

  it('lit une autorisation préalable', () => {
    expect(authorizationFrom({ id: 1, coverage_id: 5, item_code: 'LAB-001', granted_at: '2026-11-22 09:00:00', note: null })).toEqual({ id: '1', itemCode: 'LAB-001', catalogItemId: '', grantedAt: '2026-11-22 09:00:00', note: '' });
  });

  it("lit les monnaies de l'établissement et présélectionne la principale", () => {
    const list = [currencyFrom({ code: 'cdf', is_default: false }), currencyFrom({ code: 'usd', is_default: true })];
    expect(list).toEqual([{ code: 'CDF', isDefault: false }, { code: 'USD', isDefault: true }]);
    expect(defaultCurrency(list)).toBe('USD');
    expect(defaultCurrency([{ code: 'CDF', isDefault: false }])).toBe('CDF');
    expect(defaultCurrency([])).toBe('');
  });
});
