import { describe, expect, it } from 'vitest';
import { applyUsage, matchRule, priceLine, priceLines } from './engine';
import { CUR, ITEMS, bundle, contract, coverage, ctx, org, subscription } from './fixtures';
import { emptyUsage } from './types';

const insurer = org('ins');
const std = (over = {}) => contract('c1', 'ins', over);
const cov = (over = {}) => bundle(coverage('cv1', 'P1', 'ins', 'c1', over), insurer, std());
const shares = (r: ReturnType<typeof priceLine>) => ({ insurer: r.insurerShares.reduce((s, x) => s + x.amount.minor, 0), patient: r.patientShare.minor, sub: r.subscriptionShare.minor });

describe('moteur de tarification — scénarios obligatoires', () => {
  it('1. patient privé : paie 100 %', () => {
    const r = priceLine(ITEMS.consult, 1, ctx());
    expect(r).toMatchObject({ basis: 'private', outcome: 'none' });
    expect(shares(r)).toEqual({ insurer: 0, patient: 2000, sub: 0 });
  });

  it('2. assuré à 80 % sur tarif négocié : 18 → assureur 14,40 / patient 3,60 (pas 80 % du tarif privé)', () => {
    const k = std({ rules: [{ coverageBp: 8000, negotiatedUnit: 1800 }] });
    const r = priceLine(ITEMS.consult, 1, ctx({ coverages: [bundle(coverage('cv1', 'P1', 'ins', 'c1'), insurer, k)] }));
    expect(r.reference.minor).toBe(2000);
    expect(r.billable.minor).toBe(1800);
    expect(r.discount.minor).toBe(200);
    expect(shares(r)).toEqual({ insurer: 1440, patient: 360, sub: 0 });
    expect(r.insurerShares[0]).toMatchObject({ role: 'primary', rateBp: 8000 });
    expect(r.ticketModerator.minor).toBe(360);
    expect(r.outcome).toBe('partial');
  });

  it('3. assuré à 100 % confirmé : aucun paiement patient ; non confirmé : le patient paie tout', () => {
    const k = std({ rules: [{ coverageBp: 10000 }] });
    const ok = priceLine(ITEMS.consult, 1, ctx({ coverages: [bundle(coverage('cv1', 'P1', 'ins', 'c1'), insurer, k)] }));
    expect(shares(ok)).toEqual({ insurer: 2000, patient: 0, sub: 0 });
    expect(ok.outcome).toBe('full');
    const pending = priceLine(ITEMS.consult, 1, ctx({ coverages: [bundle(coverage('cv1', 'P1', 'ins', 'c1', { status: 'pending' }), insurer, k)] }));
    expect(shares(pending)).toEqual({ insurer: 0, patient: 2000, sub: 0 });
    expect(pending.justification.map((j) => j.code)).toContain('coverage.pending');
  });

  it('4. prestation exclue : le patient paie selon les règles (tarif privé)', () => {
    const k = std({ rules: [{ coverageBp: 8000 }, { category: 'procedure', coverageBp: 0, excluded: true }] });
    const r = priceLine(ITEMS.cosmetic, 1, ctx({ coverages: [bundle(coverage('cv1', 'P1', 'ins', 'c1'), insurer, k)] }));
    expect(shares(r)).toEqual({ insurer: 0, patient: 6000, sub: 0 });
    expect(r.justification.map((j) => j.code)).toContain('rule.excluded');
  });

  it('5. couverture expirée (ou pas encore commencée) à la date de la prestation', () => {
    const expired = priceLine(ITEMS.consult, 1, ctx({ date: '2027-01-05', coverages: [cov()] }));
    expect(shares(expired).insurer).toBe(0);
    expect(expired.justification.map((j) => j.code)).toContain('coverage.expired');
    // Droits évalués à la date de la prestation, pas à la date du jour :
    expect(shares(priceLine(ITEMS.consult, 1, ctx({ date: '2026-06-01', coverages: [cov()] }))).insurer).toBe(1600);
  });

  it('6. plafond dépassé : la part organisme est plafonnée, le reste revient au patient', () => {
    const k = std({ ceilingPerEpisode: 2500 });
    const c = bundle(coverage('cv1', 'P1', 'ins', 'c1'), insurer, k);
    const { results } = priceLines([{ item: ITEMS.consult, quantity: 1 }, { item: ITEMS.lab, quantity: 1 }], ctx({ coverages: [c] }));
    expect(results[0]?.insurerShares[0]?.amount.minor).toBe(1600);
    expect(results[1]?.insurerShares[0]?.amount.minor).toBe(900); // plafond restant 2500 − 1600
    expect(results[1]?.patientShare.minor).toBe(600);
    expect(results[1]?.justification.map((j) => j.code)).toContain('ceiling.reached');
    const third = priceLine(ITEMS.drug, 1, ctx({ coverages: [c], usage: applyUsage(emptyUsage(), { coverageSpent: { cv1: 2500 }, franchiseUsed: {}, quotaUsed: {}, freeConsultationsUsed: {} }) }));
    expect(shares(third)).toEqual({ insurer: 0, patient: 800, sub: 0 });
  });

  it('7. mutuelle à tarifs négociés', () => {
    const mut = org('mut', 'mutuelle');
    const k = contract('cm', 'mut', { rules: [{ category: 'laboratory', coverageBp: 7000, negotiatedUnit: 1000 }, { coverageBp: 5000 }] });
    const c = bundle(coverage('cvm', 'P1', 'mut', 'cm', { kind: 'mutuelle' }), mut, k);
    const lab = priceLine(ITEMS.lab, 2, ctx({ coverages: [c] }));
    expect(lab.billable.minor).toBe(2000); // 2 × 10,00 négocié (privé : 30,00)
    expect(shares(lab)).toEqual({ insurer: 1400, patient: 600, sub: 0 });
    expect(shares(priceLine(ITEMS.consult, 1, ctx({ coverages: [c] })))).toEqual({ insurer: 1000, patient: 1000, sub: 0 });
  });

  it('8. abonné : consultations gratuites limitées, puis tarif normal', () => {
    const s = subscription({ freeConsultations: 2 });
    let usage = emptyUsage();
    const outcomes: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const r = priceLine(ITEMS.consult, 1, ctx({ subscription: s, usage }));
      usage = applyUsage(usage, r.usageDelta);
      outcomes.push(r.patientShare.minor);
    }
    expect(outcomes).toEqual([0, 0, 2000]);
    const first = priceLine(ITEMS.consult, 1, ctx({ subscription: s }));
    expect(first.subscriptionShare.minor).toBe(2000);
    expect(first.insurerShares).toHaveLength(0); // financé par l'abonnement : ce n'est PAS une créance sur un organisme
  });

  it('abonné : pas couvert à 100 % par défaut, réduction par catégorie', () => {
    const s = subscription({ discounts: { laboratory: 2000 } });
    const lab = priceLine(ITEMS.lab, 1, ctx({ subscription: s }));
    expect(lab.billable.minor).toBe(1200);
    expect(lab.patientShare.minor).toBe(1200);
    expect(priceLine(ITEMS.drug, 1, ctx({ subscription: s })).patientShare.minor).toBe(800);
  });

  it('9. abonnement expiré/suspendu : avantages non appliqués', () => {
    const s = subscription({ freeConsultations: 5 });
    const late = priceLine(ITEMS.consult, 1, ctx({ date: '2027-02-01', subscription: s }));
    expect(late.patientShare.minor).toBe(2000);
    expect(late.justification.map((j) => j.code)).toContain('subscription.expired');
    expect(priceLine(ITEMS.consult, 1, ctx({ subscription: subscription({ status: 'suspended', freeConsultations: 5 }) })).patientShare.minor).toBe(2000);
    expect(priceLine(ITEMS.consult, 1, ctx({ patientId: 'P9', subscription: s })).patientShare.minor).toBe(2000);
  });

  it('10. plusieurs couvertures : jamais de double prise en charge sans règle explicite', () => {
    const mut = org('mut', 'mutuelle');
    const kIns = std({ rules: [{ coverageBp: 6000 }] });
    const kMut = contract('cm', 'mut', { rules: [{ coverageBp: 5000 }] });
    const a = bundle(coverage('cv1', 'P1', 'ins', 'c1', { priority: 1 }), insurer, kIns);
    const b = bundle(coverage('cvm', 'P1', 'mut', 'cm', { kind: 'mutuelle', priority: 2 }), mut, kMut);
    // Sans désignation de complémentaire : seule la principale (la plus prioritaire) intervient.
    const single = priceLine(ITEMS.consult, 1, ctx({ coverages: [b, a] }));
    expect(single.insurerShares).toHaveLength(1);
    expect(shares(single)).toEqual({ insurer: 1200, patient: 800, sub: 0 });
    // Complémentaire désignée mais contrats non autorisés : refus justifié.
    const refused = priceLine(ITEMS.consult, 1, ctx({ coverages: [a, b], secondaryCoverageId: 'cvm' }));
    expect(refused.insurerShares).toHaveLength(1);
    expect(refused.justification.map((j) => j.code)).toContain('complement.notAllowed');
    // Les deux contrats l'autorisent : la complémentaire ne couvre que le reste à charge dans le contrat.
    const a2 = bundle(a.coverage, insurer, { ...kIns, allowsComplementary: true });
    const b2 = bundle(b.coverage, mut, { ...kMut, canBeComplementary: true });
    const both = priceLine(ITEMS.consult, 1, ctx({ coverages: [a2, b2], secondaryCoverageId: 'cvm' }));
    expect(both.insurerShares.map((x) => [x.role, x.amount.minor])).toEqual([['primary', 1200], ['complementary', 400]]);
    expect(shares(both)).toEqual({ insurer: 1600, patient: 400, sub: 0 });
  });

  it('assurance et abonnement ne se cumulent pas implicitement', () => {
    const s = subscription({ freeConsultations: 3, discounts: { consultation: 5000 } });
    const r = priceLine(ITEMS.consult, 1, ctx({ coverages: [cov()], subscription: s }));
    expect(shares(r)).toEqual({ insurer: 1600, patient: 400, sub: 0 });
    expect(r.justification.map((j) => j.code)).toContain('subscription.notStacked');
  });

  it('franchise par épisode, quota et autorisation préalable', () => {
    const k = std({ franchisePerEpisode: 1000, rules: [{ coverageBp: 8000 }, { category: 'laboratory', coverageBp: 10000, quota: 1 }, { category: 'procedure', coverageBp: 10000, requiresAuthorization: true }] });
    const c = bundle(coverage('cv1', 'P1', 'ins', 'c1'), insurer, k);
    const { results } = priceLines([{ item: ITEMS.consult, quantity: 1 }, { item: ITEMS.drug, quantity: 1 }], ctx({ coverages: [c] }));
    // Consultation : franchise 10,00 puis 80 % de 10,00 = 8,00 ; patient = 10 + 2.
    expect(results[0]?.franchise.minor).toBe(1000);
    expect(shares(results[0]!)).toEqual({ insurer: 800, patient: 1200, sub: 0 });
    // La franchise est consommée : la ligne suivante n'en a plus.
    expect(results[1]?.franchise.minor).toBe(0);
    expect(shares(results[1]!).insurer).toBe(640);
    // Quota de 1 examen : le 2e est hors contrat (tarif privé).
    const lab = priceLine(ITEMS.lab, 2, ctx({ coverages: [bundle(coverage('cv1', 'P1', 'ins', 'c1'), insurer, std({ rules: [{ category: 'laboratory', coverageBp: 10000, quota: 1 }] }))] }));
    expect(shares(lab)).toEqual({ insurer: 1500, patient: 1500, sub: 0 });
    // Autorisation préalable obligatoire : sans elle, rien n'est pris en charge ; avec, 100 %.
    const noAuth = priceLine(ITEMS.cosmetic, 1, ctx({ coverages: [c] }));
    expect(noAuth).toMatchObject({ needsAuthorization: true, outcome: 'authorizationRequired' });
    expect(shares(noAuth).insurer).toBe(0);
    const withAuth = priceLine(ITEMS.cosmetic, 1, ctx({ coverages: [c], grantedAuthorizations: ['cv1|PROC-ESTH'] }));
    expect(shares(withAuth).insurer).toBe(5000); // franchise (10,00) déjà à charge : 100 % de 50,00
  });

  it('ayant droit couvert, étranger non couvert ; règle la plus spécifique gagne', () => {
    const c = bundle(coverage('cv1', 'P1', 'ins', 'c1', { beneficiaryIds: ['P2'] }), insurer, std());
    expect(shares(priceLine(ITEMS.consult, 1, ctx({ patientId: 'P2', coverages: [c] }))).insurer).toBe(1600);
    expect(shares(priceLine(ITEMS.consult, 1, ctx({ patientId: 'P3', coverages: [c] }))).insurer).toBe(0);
    const k = std({ rules: [{ coverageBp: 1000 }, { category: 'consultation', coverageBp: 5000 }, { itemCode: 'CONS-GEN', coverageBp: 9000 }] });
    expect(matchRule(k, ITEMS.consult)?.coverageBp).toBe(9000);
    expect(matchRule(k, ITEMS.lab)?.coverageBp).toBe(1000);
  });

  it('invariants (aléatoire) : somme des parts = montant facturable, aucune part négative', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const items = Object.values(ITEMS);
    for (let i = 0; i < 400; i += 1) {
      const bp = Math.floor(rnd() * 10001);
      const k = std({
        franchisePerEpisode: rnd() < 0.5 ? Math.floor(rnd() * 3000) : undefined,
        ceilingPerEpisode: rnd() < 0.5 ? Math.floor(rnd() * 5000) : undefined,
        allowsComplementary: true,
        rules: [{ coverageBp: bp, negotiatedUnit: rnd() < 0.5 ? Math.floor(rnd() * 2500) + 1 : undefined, quota: rnd() < 0.3 ? 1 : undefined }],
      });
      const mut = org('mut', 'mutuelle');
      const km = contract('cm', 'mut', { canBeComplementary: true, ceilingPerEpisode: rnd() < 0.5 ? Math.floor(rnd() * 2000) : undefined, rules: [{ coverageBp: Math.floor(rnd() * 10001) }] });
      const lines = Array.from({ length: 3 }, () => ({ item: items[Math.floor(rnd() * items.length)]!, quantity: 1 + Math.floor(rnd() * 3) }));
      const { results } = priceLines(lines, ctx({
        coverages: [bundle(coverage('cv1', 'P1', 'ins', 'c1'), insurer, k), bundle(coverage('cvm', 'P1', 'mut', 'cm', { priority: 2 }), mut, km)],
        secondaryCoverageId: rnd() < 0.7 ? 'cvm' : undefined,
        subscription: rnd() < 0.5 ? subscription({ freeConsultations: 1, discounts: { laboratory: 1000 } }) : undefined,
      }));
      for (const r of results) {
        const s = shares(r);
        expect(s.insurer + s.sub + s.patient).toBe(r.billable.minor);
        expect(Math.min(s.insurer, s.sub, s.patient) >= 0).toBe(true);
        expect(r.billable.minor >= 0).toBe(true);
      }
    }
  });
});

describe('moteur — tracabilité', () => {
  it("l'instantané conserve organisme, contrat, règle et date ; une modification ultérieure du contrat ne le change pas", () => {
    const k = std({ rules: [{ coverageBp: 8000, negotiatedUnit: 1800 }] });
    const r = priceLine(ITEMS.consult, 1, ctx({ coverages: [bundle(coverage('cv1', 'P1', 'ins', 'c1'), insurer, k)] }));
    expect(r.rules).toMatchObject({ basis: 'insurance', date: '2026-11-14', primary: { organizationId: 'ins', contractId: 'c1', policyNumber: 'POL-cv1', rule: { coverageBp: 8000, negotiatedUnit: 1800 } } });
    const frozen = JSON.stringify(r.rules);
    k.rules[0]!.coverageBp = 1;
    expect(JSON.stringify(r.rules)).toBe(frozen);
    expect(CUR).toBe('USD');
  });
});
