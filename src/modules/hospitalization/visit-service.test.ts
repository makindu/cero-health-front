import { describe, expect, it } from 'vitest';
import type { LocalContext } from '@/core/local/context';
import { createMemoryDatabase } from '@/core/local/memory-database';
import { runUnit } from '@/core/local/unit-of-work';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { createFinanceService, type FinanceDeps } from '../finance/finance-service';
import { lotsRef, movementsRef } from '../pharmacy/collections';
import { available } from '../pharmacy/pharmacy-rules';
import { EMPTY_DOC, docOf, para } from '../consultations/richtext/doc';
import { createAccountService } from './account-service';
import { createHospitalService } from './hospital-service';
import { createVisitService } from './visit-service';

const civil = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DRUG = 'cat-06'; // antalgique 5,00 — stock de démonstration : 100 disponibles
const ATB = 'cat-07'; // antibiotique 18,00 — stock de démonstration : 25
const DRESS = 'cat-12'; // pansement 7,00 — acte infirmier, pas de stock

function setup(denied: string[] = []) {
  const db = createMemoryDatabase();
  const state = { now: new Date(2026, 10, 14, 10, 0, 0), denied: new Set(denied), n: 0 };
  const ctx = (): LocalContext => ({ facilityId: 'F1', actor: { id: 'u1', name: 'Agent démo' } });
  const deps: FinanceDeps = {
    run: (fn) => runUnit(fn, { db: async () => db, context: ctx, now: () => state.now }),
    require: (p) => { if (state.denied.has(p)) throw new Error(`forbidden:${p}`); },
    patient: async (_u, id) => (id.startsWith('DEMO-P-') ? { id, fullName: `Patient ${id}` } : undefined),
    newId: (p) => `${p}-${++state.n}`,
    day: civil,
  };
  const finance = createFinanceService(deps);
  const visits = createVisitService(deps, finance);
  const hosp = createHospitalService(deps, { beforeCancel: visits.inUnit.assertCanCancel, afterDischargeRequest: (id) => visits.autoBill(id) });
  const acc = createAccountService(deps, finance, { beforeDischarge: (id) => visits.autoBill(id) });
  const stock = async (itemId: string) => deps.run(async (u) => available(await u.list(lotsRef), itemId, civil(state.now)));
  const moves = async () => deps.run(async (u) => (await u.list(movementsRef)).filter((m) => m.kind === 'dispense'));
  const pay = (invoiceId: string, amount: number) => finance.recordPayment({ invoiceId, amount, method: 'cash', submissionId: `p-${invoiceId}-${++state.n}` });
  const admit = () => hosp.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', reason: 'surveillance', attending: 'Dr démo' });
  return { finance, visits, hosp, acc, state, stock, moves, pay, admit };
}

describe('saisie des visites', () => {
  it('enregistre produits et services sans facture ni sortie de stock', async () => {
    const s = setup();
    const a = await s.admit();
    const l = await s.visits.recordVisit({ admissionId: a.id, type: 'round', lines: [{ itemId: DRUG, quantity: 3 }, { itemId: DRESS, quantity: 1 }] });
    expect(l.rows.map((r) => [r.entry.itemId, r.status, r.net])).toEqual([[DRUG, 'pending', 3], [DRESS, 'pending', 1]]);
    expect(l.invoiceIds).toEqual([]);
    expect(await s.stock(DRUG)).toBe(100);
    expect(await s.moves()).toEqual([]);
    expect((await s.acc.account(a.id)).invoices).toEqual([]);
  });
  it('une tournée sans consommation est valide ; les lignes invalides ne laissent aucune trace', async () => {
    const s = setup();
    const a = await s.admit();
    expect((await s.visits.recordVisit({ admissionId: a.id, type: 'round', lines: [] })).visits).toHaveLength(1);
    await expect(s.visits.recordVisit({ admissionId: a.id, type: 'care', lines: [{ itemId: DRUG, quantity: 0 }] })).rejects.toThrow('visit.quantityInvalid');
    await expect(s.visits.recordVisit({ admissionId: a.id, type: 'care', lines: [{ itemId: 'cat-08', quantity: 1 }] })).rejects.toThrow('visit.itemInvalid');
    expect((await s.visits.ledger(a.id)).visits).toHaveLength(1);
  });
  it('permissions vérifiées dans le service', async () => {
    const s = setup([P.hospitalization.visitRecord]);
    const a = await s.admit();
    await expect(s.visits.recordVisit({ admissionId: a.id, type: 'round', lines: [] })).rejects.toThrow('forbidden');
    const t = setup([P.hospitalization.visitView]);
    const b = await t.admit();
    await expect(t.visits.ledger(b.id)).rejects.toThrow('forbidden');
  });
  it('refuse sur une admission terminée ou inconnue', async () => {
    const s = setup();
    await expect(s.visits.recordVisit({ admissionId: 'nope', type: 'round', lines: [] })).rejects.toThrow('visit.admissionNotFound');
    const a = await s.admit();
    await s.hosp.cancel({ admissionId: a.id, reason: 'erreur' });
    await expect(s.visits.recordVisit({ admissionId: a.id, type: 'round', lines: [] })).rejects.toThrow('visit.notActive');
  });
});

describe('contre-écritures', () => {
  it('avant facturation : la facture et le stock suivent la quantité nette', async () => {
    const s = setup();
    const a = await s.admit();
    const l = await s.visits.recordVisit({ admissionId: a.id, type: 'round', lines: [{ itemId: DRUG, quantity: 5 }, { itemId: DRESS, quantity: 1 }] });
    const id = l.rows[0]!.entry.id;
    await expect(s.visits.reverse({ admissionId: a.id, consumptionId: id, reason: '', quantity: 2 })).rejects.toThrow('visit.reasonRequired');
    await expect(s.visits.reverse({ admissionId: a.id, consumptionId: id, reason: 'x', quantity: 9 })).rejects.toThrow('visit.overReversal');
    const after = await s.visits.reverse({ admissionId: a.id, consumptionId: id, reason: 'Saisie en trop', quantity: 2 });
    expect(after.rows.map((r) => r.status)).toEqual(['pending', 'pending', 'reversal']);
    expect(after.rows[0]!.entry.quantity).toBe(5);
    const { invoice } = await s.visits.bill({ admissionId: a.id });
    expect(invoice.invoice.totals.billable).toBe(3 * 500 + 700);
    expect(await s.stock(DRUG)).toBe(97);
  });
  it('une consommation facturée ne se contre-passe qu’après annulation de la facture, sans nouvelle sortie de stock', async () => {
    const s = setup();
    const a = await s.admit();
    const l = await s.visits.recordVisit({ admissionId: a.id, type: 'round', lines: [{ itemId: DRUG, quantity: 5 }] });
    const id = l.rows[0]!.entry.id;
    const { invoice } = await s.visits.bill({ admissionId: a.id });
    expect(await s.stock(DRUG)).toBe(95);
    await expect(s.visits.reverse({ admissionId: a.id, consumptionId: id, reason: 'x' })).rejects.toThrow('visit.alreadyBilled');
    await expect(s.visits.bill({ admissionId: a.id })).rejects.toThrow('visit.nothingToBill');

    await s.finance.cancelInvoice({ invoiceId: invoice.invoice.id, reason: 'Facture erronée' });
    expect((await s.visits.ledger(a.id)).rows[0]!.status).toBe('pending');
    await s.visits.reverse({ admissionId: a.id, consumptionId: id, reason: 'Erreur', quantity: 2 });
    const again = await s.visits.bill({ admissionId: a.id });
    expect(again.invoice.invoice.totals.billable).toBe(3 * 500);
    expect(await s.stock(DRUG)).toBe(95); // le stock déjà sorti n’est pas ressorti
    expect(await s.moves()).toHaveLength(1);
  });
  it('tout contre-passer rend la consommation non facturable', async () => {
    const s = setup();
    const a = await s.admit();
    const l = await s.visits.recordVisit({ admissionId: a.id, type: 'care', lines: [{ itemId: DRESS, quantity: 2 }] });
    await s.visits.reverse({ admissionId: a.id, consumptionId: l.rows[0]!.entry.id, reason: 'Erreur' });
    await expect(s.visits.bill({ admissionId: a.id })).rejects.toThrow('visit.nothingToBill');
    await expect(s.visits.reverse({ admissionId: a.id, consumptionId: l.rows[0]!.entry.id, reason: 'Encore' })).rejects.toThrow('visit.alreadyReversed');
  });
  it('annuler l’admission : refusé tant qu’une consommation nette existe', async () => {
    const s = setup();
    const a = await s.admit();
    const l = await s.visits.recordVisit({ admissionId: a.id, type: 'care', lines: [{ itemId: DRESS, quantity: 1 }] });
    await expect(s.hosp.cancel({ admissionId: a.id, reason: 'erreur' })).rejects.toThrow('visit.hasConsumptions');
    await s.visits.reverse({ admissionId: a.id, consumptionId: l.rows[0]!.entry.id, reason: 'Erreur' });
    expect((await s.hosp.cancel({ admissionId: a.id, reason: 'erreur' })).status).toBe('cancelled');
  });
});

describe('facturation et réduction', () => {
  it('stock insuffisant : rien n’est facturé ni sorti', async () => {
    const s = setup();
    const a = await s.admit();
    await s.visits.recordVisit({ admissionId: a.id, type: 'round', lines: [{ itemId: ATB, quantity: 30 }, { itemId: DRESS, quantity: 1 }] });
    await expect(s.visits.bill({ admissionId: a.id })).rejects.toThrow('visit.insufficientStock');
    expect(await s.stock(ATB)).toBe(25);
    expect((await s.acc.account(a.id)).invoices).toEqual([]);
    expect((await s.visits.ledger(a.id)).rows.map((r) => r.status)).toEqual(['pending', 'pending']);
  });
  it('réduction : droit, motif, plafond, puis prix unitaire réduit', async () => {
    const denied = setup([P.billing.discount]);
    const d = await denied.admit();
    await denied.visits.recordVisit({ admissionId: d.id, type: 'round', lines: [{ itemId: DRUG, quantity: 3 }] });
    await expect(denied.visits.bill({ admissionId: d.id, discountBp: 1000, discountReason: 'geste' })).rejects.toThrow('visit.discountForbidden');

    const s = setup();
    const a = await s.admit();
    await s.visits.recordVisit({ admissionId: a.id, type: 'round', lines: [{ itemId: DRUG, quantity: 3 }, { itemId: DRESS, quantity: 1 }] });
    await expect(s.visits.bill({ admissionId: a.id, discountBp: 2000 })).rejects.toThrow('visit.discountReasonRequired');
    await expect(s.visits.bill({ admissionId: a.id, discountBp: 6000, discountReason: 'trop' })).rejects.toThrow('visit.discountTooHigh');
    expect(await s.stock(DRUG)).toBe(100);
    const { invoice } = await s.visits.bill({ admissionId: a.id, discountBp: 2000, discountReason: 'Patient démuni' });
    expect(invoice.invoice.totals.billable).toBe(3 * 400 + 560);
  });
});

describe('facturation automatique à la sortie', () => {
  it('à la demande de sortie, puis à la sortie : la facture des soins tardifs reste au compte même si la sortie est refusée', async () => {
    const s = setup();
    const a = await s.admit();
    await s.visits.recordVisit({ admissionId: a.id, type: 'round', lines: [{ itemId: DRUG, quantity: 2 }, { itemId: DRESS, quantity: 1 }] });
    await s.hosp.requestDischarge({ admissionId: a.id, note: '' });
    const l1 = await s.visits.ledger(a.id);
    expect(l1.pending).toEqual([]);
    expect(l1.invoiceIds).toHaveLength(1);
    expect(await s.stock(DRUG)).toBe(98);

    // des soins ont encore lieu pendant l’attente de sortie
    await s.visits.recordVisit({ admissionId: a.id, type: 'care', lines: [{ itemId: DRESS, quantity: 2 }] });
    await s.acc.postRoomDays({ admissionId: a.id, forDischarge: true });
    for (const inv of (await s.acc.account(a.id)).invoices) await s.pay(inv.invoice.id, inv.balances.patientBalance);
    // la sortie facture les soins tardifs, qui créent un solde dû : la sortie est refusée MAIS la facture est conservée
    await expect(s.acc.discharge({ admissionId: a.id, outcome: 'normal', note: '' })).rejects.toThrow('hospital.balanceDue');
    const mid = await s.acc.account(a.id);
    expect(mid.totals.patientDue).toBe(2 * 700);
    expect((await s.visits.ledger(a.id)).pending).toEqual([]);
    for (const inv of mid.invoices) if (inv.balances.patientBalance > 0) await s.pay(inv.invoice.id, inv.balances.patientBalance);
    const done = await s.acc.discharge({ admissionId: a.id, outcome: 'normal', note: '' });
    expect(done.admission.status).toBe('discharged');
  });
  it('un échec de facturation automatique ne bloque ni la demande de sortie ni la sortie', async () => {
    const s = setup();
    const a = await s.admit();
    await s.visits.recordVisit({ admissionId: a.id, type: 'round', lines: [{ itemId: ATB, quantity: 30 }] });
    const requested = await s.hosp.requestDischarge({ admissionId: a.id, note: '' });
    expect(requested.status).toBe('dischargePending');
    const l = await s.visits.ledger(a.id);
    expect(l.pending).toHaveLength(1);
    expect(l.invoiceIds).toEqual([]);
    await s.acc.postRoomDays({ admissionId: a.id, forDischarge: true });
    for (const inv of (await s.acc.account(a.id)).invoices) await s.pay(inv.invoice.id, inv.balances.patientBalance);
    expect((await s.acc.discharge({ admissionId: a.id, outcome: 'normal', note: '' })).admission.status).toBe('discharged');
    expect((await s.visits.ledger(a.id)).pending).toHaveLength(1); // reste à facturer : rattrapage manuel quand le stock arrive
  });

  describe('volet clinique', () => {
    const D = (text: string) => docOf(para(text));
    const clinical = { complaints: { none: false, text: D('Douleur thoracique') }, examination: { evolution: 'worsened' as const, text: D('Râles bilatéraux') }, diagnosis: 'Pneumonie', plan: { treatment: 'modify' as const, labs: true, discharge: false, note: EMPTY_DOC } };

    it('enregistre plaintes, examen, diagnostic et plan avec la visite et les consommations', async () => {
      const s = setup();
      const a = await s.admit();
      const l = await s.visits.recordVisit({ admissionId: a.id, type: 'round', lines: [{ itemId: DRESS, quantity: 1 }], clinical });
      expect(l.visits[0]!.clinical).toEqual(clinical);
      expect(l.rows).toHaveLength(1);
      expect((await s.visits.ledger(a.id)).visits[0]!.clinical!.diagnosis).toBe('Pneumonie');
    });
    it('un infirmier (sans droit clinique) note les plaintes mais ne peut ni examiner, ni diagnostiquer, ni planifier', async () => {
      const s = setup([P.hospitalization.visitClinical]);
      const a = await s.admit();
      const ok = await s.visits.recordVisit({ admissionId: a.id, type: 'care', lines: [], clinical: { complaints: { none: true, text: '' } } });
      expect(ok.visits[0]!.clinical).toEqual({ complaints: { none: true, text: EMPTY_DOC } });
      await expect(s.visits.recordVisit({ admissionId: a.id, type: 'care', lines: [], clinical })).rejects.toThrow('visit.clinicalForbidden');
      expect((await s.visits.ledger(a.id)).visits).toHaveLength(1);
    });
    it('un volet incohérent est refusé sans rien écrire (ni visite ni consommation)', async () => {
      const s = setup();
      const a = await s.admit();
      await expect(s.visits.recordVisit({ admissionId: a.id, type: 'round', lines: [{ itemId: DRESS, quantity: 1 }], clinical: { diagnosis: 'Paludisme' } })).rejects.toThrow('visit.diagnosisNeedsExamination');
      const l = await s.visits.ledger(a.id);
      expect(l.visits).toHaveLength(0);
      expect(l.rows).toHaveLength(0);
    });
    it('une visite sans volet clinique reste valide (compatibilité)', async () => {
      const s = setup();
      const a = await s.admit();
      expect((await s.visits.recordVisit({ admissionId: a.id, type: 'round', lines: [] })).visits[0]!.clinical).toBeUndefined();
    });
  });
});
