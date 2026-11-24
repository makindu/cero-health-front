import { describe, expect, it } from 'vitest';
import { allowedDecisions, authorizationCodeOk, coverageBody, decisionOk, type CoverageDraft, blankRule, bpToPercent, contractBody, minorToText, optionalMinor, percentToBp, ruleBody, subscriptionBody, type ContractDraft, type SubscriptionDraft } from './insurance-rules';

const contract: ContractDraft = {
  organizationId: '3', label: 'Contrat A', currency: 'USD', validFrom: '2026-01-01', validTo: '2026-12-31', status: 'active',
  franchise: '', ceiling: '1000', allowsComplementary: false, canBeComplementary: true, conditions: '',
};
const sub: SubscriptionDraft = {
  type: 'family', holderName: 'Famille Test', patientIds: ['9', '12'], price: '120', currency: 'USD', validFrom: '2026-01-01', validTo: '2026-12-31',
  status: 'active', free: '3', labDiscount: '10', included: ['consultation'],
};

describe('pourcentages et montants facultatifs', () => {
  it('convertit un taux en points de base, sans arrondir en silence', () => {
    expect(percentToBp('80')).toBe(8000);
    expect(percentToBp('12,5')).toBe(1250);
    expect(percentToBp('100')).toBe(10000);
    expect(percentToBp('100.01')).toBeNull();
    expect(percentToBp('12.345')).toBeNull();
    expect(percentToBp('-5')).toBeNull();
    expect(percentToBp('')).toBeNull();
    expect(percentToBp('abc')).toBeNull();
    expect(bpToPercent(1250)).toBe('12.5');
  });

  it('distingue « pas de limite » (vide) d\'une valeur illisible', () => {
    expect(optionalMinor('', 'USD')).toBeNull();
    expect(optionalMinor('10', 'USD')).toBe(1000);
    expect(optionalMinor('10,5', 'USD')).toBe(1050);
    expect(optionalMinor('10.555', 'USD')).toBeUndefined();
    expect(optionalMinor('abc', 'USD')).toBeUndefined();
    expect(optionalMinor('-1', 'USD')).toBeUndefined();
    expect(minorToText(1050, 'USD')).toBe('10.50');
    expect(minorToText(null, 'USD')).toBe('');
  });
});

describe('règles de contrat', () => {
  it('une règle exclue ne couvre rien, quel que soit le taux saisi', () => {
    expect(ruleBody({ ...blankRule(), rate: '90', excluded: true }, 'USD')).toMatchObject({ coverage_bp: 0, excluded: true });
  });
  it('refuse un taux, un quota ou un code de prestation invalides', () => {
    expect(ruleBody({ ...blankRule(), rate: '101' }, 'USD')).toBeNull();
    expect(ruleBody({ ...blankRule(), quota: '0' }, 'USD')).toBeNull();
    expect(ruleBody({ ...blankRule(), quota: '2.5' }, 'USD')).toBeNull();
    expect(ruleBody({ ...blankRule(), itemCode: 'a b' }, 'USD')).toBeNull();
    expect(ruleBody({ ...blankRule(), negotiated: 'x' }, 'USD')).toBeNull();
  });
  it('prépare une règle complète avec ses limites', () => {
    expect(ruleBody({ category: 'laboratory', itemCode: '', rate: '75', negotiated: '5', ceilingLine: '20', quota: '4', excluded: false, auth: true }, 'USD'))
      .toEqual({ category: 'laboratory', item_code: null, coverage_bp: 7500, excluded: false, negotiated_unit_minor: 500, ceiling_per_line_minor: 2000, quota: 4, requires_authorization: true });
  });
});

describe('corps d\'un contrat', () => {
  it('à la création : organisme, devise et règles ; jamais de statut', () => {
    const b = contractBody(contract, [blankRule()], false, true)!;
    expect(b).toMatchObject({ organization_id: 3, currency: 'USD', ceiling_per_episode_minor: 100000, franchise_per_episode_minor: null, conditions: null });
    expect(b.rules).toHaveLength(1);
    expect(b).not.toHaveProperty('status');
  });
  it('en modification : statut, jamais organisme ni devise, et règles seulement si touchées', () => {
    const untouched = contractBody({ ...contract, status: 'suspended' }, [blankRule()], false, false)!;
    expect(untouched).toMatchObject({ status: 'suspended' });
    expect(untouched).not.toHaveProperty('organization_id');
    expect(untouched).not.toHaveProperty('currency');
    expect(untouched).not.toHaveProperty('rules');            // les règles existantes ne sont pas remplacées par erreur
    expect(contractBody(contract, [blankRule()], true, false)).toHaveProperty('rules');
  });
  it('refuse une période inversée, un intitulé trop court ou une règle invalide', () => {
    expect(contractBody({ ...contract, validTo: '2025-12-31' }, [blankRule()], false, true)).toBeNull();
    expect(contractBody({ ...contract, label: 'A' }, [blankRule()], false, true)).toBeNull();
    expect(contractBody({ ...contract, ceiling: 'x' }, [blankRule()], false, true)).toBeNull();
    expect(contractBody(contract, [{ ...blankRule(), rate: '200' }], false, true)).toBeNull();
    expect(contractBody({ ...contract, organizationId: '' }, [blankRule()], false, true)).toBeNull();
  });
});

describe('corps d\'un abonnement', () => {
  it('prépare la création avec la remise laboratoire en points de base', () => {
    const b = subscriptionBody(sub, {}, true)!;
    expect(b).toMatchObject({ type: 'family', patient_ids: [9, 12], price_minor: 12000, free_consultations: 3, discounts: { laboratory: 1000 } });
    expect(b).not.toHaveProperty('status');
  });
  it('conserve les remises des autres catégories et retire « laboratoire » si vidée', () => {
    expect(subscriptionBody({ ...sub, labDiscount: '' }, { pharmacy: 500, laboratory: 900 }, false)!.discounts).toEqual({ pharmacy: 500 });
    expect(subscriptionBody({ ...sub, labDiscount: '5' }, { pharmacy: 500 }, false)!.discounts).toEqual({ pharmacy: 500, laboratory: 500 });
  });
  it('en modification : statut, jamais le type', () => {
    const b = subscriptionBody({ ...sub, status: 'suspended' }, {}, false)!;
    expect(b).toMatchObject({ status: 'suspended' });
    expect(b).not.toHaveProperty('type');
  });
  it('refuse sans bénéficiaire, sans prix lisible, avec période inversée ou gratuités hors limites', () => {
    expect(subscriptionBody({ ...sub, patientIds: [] }, {}, true)).toBeNull();
    expect(subscriptionBody({ ...sub, price: '' }, {}, true)).toBeNull();
    expect(subscriptionBody({ ...sub, price: 'x' }, {}, true)).toBeNull();
    expect(subscriptionBody({ ...sub, validTo: '2025-01-01' }, {}, true)).toBeNull();
    expect(subscriptionBody({ ...sub, free: '1000' }, {}, true)).toBeNull();
    expect(subscriptionBody({ ...sub, labDiscount: '101' }, {}, true)).toBeNull();
    expect(subscriptionBody({ ...sub, holderName: 'A' }, {}, true)).toBeNull();
  });
});


const cov: CoverageDraft = {
  organizationId: '3', contractId: '7', kind: 'insurance', validFrom: '2026-01-01', validTo: '2026-12-31', policy: 'POL-1', card: '', member: '', coverageType: '',
  ceilingRemaining: '500', priority: '1', beneficiaryIds: ['9'],
};

describe('couvertures et décisions', () => {
  it('ne propose que les décisions permises depuis chaque statut', () => {
    expect(allowedDecisions('pending')).toEqual(['validated', 'rejected']);
    expect(allowedDecisions('validated')).toEqual(['suspended']);
    expect(allowedDecisions('suspended')).toEqual(['validated']);
    expect(allowedDecisions('rejected')).toEqual([]);
    expect(allowedDecisions('inconnu')).toEqual([]);
  });
  it('exige un motif pour rejeter ou suspendre, pas pour valider', () => {
    expect(decisionOk('validated', '')).toBe(true);
    expect(decisionOk('rejected', '')).toBe(false);
    expect(decisionOk('rejected', 'ab')).toBe(false);
    expect(decisionOk('suspended', 'Carte expirée')).toBe(true);
  });
  it('valide le code de prestation d\'une autorisation', () => {
    expect(authorizationCodeOk('LAB-001')).toBe(true);
    expect(authorizationCodeOk(' LAB-001 ')).toBe(true);
    expect(authorizationCodeOk('')).toBe(false);
    expect(authorizationCodeOk('a b')).toBe(false);
  });
  it('à la création : identité complète ; en modification : seulement carte, plafond, priorité et bénéficiaires', () => {
    const create = coverageBody(cov, 'USD', true)!;
    expect(create).toMatchObject({ organization_id: 3, contract_id: 7, kind: 'insurance', valid_from: '2026-01-01', ceiling_remaining_minor: 50000, priority: 1, beneficiary_ids: [9], card_number: null });
    const update = coverageBody(cov, 'USD', false)!;
    for (const k of ['organization_id', 'contract_id', 'kind', 'valid_from', 'valid_to']) expect(update).not.toHaveProperty(k);
    expect(update).toMatchObject({ policy_number: 'POL-1', priority: 1 });
  });
  it('refuse une priorité hors 1–9, un plafond illisible, une période inversée ou un contrat manquant', () => {
    expect(coverageBody({ ...cov, priority: '0' }, 'USD', true)).toBeNull();
    expect(coverageBody({ ...cov, priority: '10' }, 'USD', true)).toBeNull();
    expect(coverageBody({ ...cov, ceilingRemaining: 'x' }, 'USD', true)).toBeNull();
    expect(coverageBody({ ...cov, validTo: '2025-01-01' }, 'USD', true)).toBeNull();
    expect(coverageBody({ ...cov, contractId: '' }, 'USD', true)).toBeNull();
    expect(coverageBody({ ...cov, kind: 'autre' }, 'USD', true)).toBeNull();
    expect(coverageBody({ ...cov, ceilingRemaining: '' }, 'USD', false)).toMatchObject({ ceiling_remaining_minor: null });
  });
});
