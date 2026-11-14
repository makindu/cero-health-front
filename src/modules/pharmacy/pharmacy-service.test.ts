import { describe, expect, it } from 'vitest';
import type { LocalContext } from '@/core/local/context';
import { createMemoryDatabase } from '@/core/local/memory-database';
import { runUnit } from '@/core/local/unit-of-work';
import { createFinanceService, type FinanceDeps } from '../finance/finance-service';
import { createRxService } from '../prescriptions/rx-service';
import type { RxItem } from '../prescriptions/rx-rules';
import * as R from './pharmacy-rules';
import { createPharmacyService } from './pharmacy-service';

const civil = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function setup(denied: string[] = []) {
  const db = createMemoryDatabase();
  const state = { now: new Date(2026, 10, 14, 10, 0, 0), facility: 'F1', denied: new Set(denied), n: 0 };
  const ctx = (): LocalContext => ({ facilityId: state.facility, actor: { id: 'u1', name: 'Agent démo' } });
  const deps: FinanceDeps = {
    run: (fn) => runUnit(fn, { db: async () => db, context: ctx, now: () => state.now }),
    require: (p) => { if (state.denied.has(p)) throw new Error(`forbidden:${p}`); },
    patient: async (_u, id) => (id.startsWith('DEMO-P-') ? { id, fullName: `Patient ${id}` } : undefined),
    newId: (p) => `${p}-${++state.n}`,
    day: civil,
  };
  const finance = createFinanceService(deps);
  return { ph: createPharmacyService(deps, finance), rx: createRxService(deps), finance, state };
}
const line = (over: Partial<RxItem> = {}): RxItem => ({ label: 'Antalgique (boîte) (démo)', dosage: '1', frequency: '3/j', duration: '', quantity: 10, instructions: '', ...over });
async function validated(s: ReturnType<typeof setup>, items: RxItem[] = [line()], patientId = 'DEMO-P-007') {
  const r = await s.rx.create({ patientId, items, note: '' });
  await s.rx.validate({ id: r.id });
  return r;
}
const lot = (id: string, itemId: string, exp: string | null, q: number): R.StockLot => ({ id, itemId, lotNumber: id, expiresAt: exp, quantity: q });
const code = (fn: () => unknown): string | undefined => { try { fn(); } catch (e) { return (e as R.PharmacyError).code; } };

describe('règles de stock', () => {
  it('écart par rapport à la prescription (quantité réduite ou produit différent) : motif obligatoire et tracé', async () => {
    const s = setup();
    const r = await validated(s, [line({ quantity: 10 }), line({ label: 'Autre molécule', quantity: 2 })]);
    const item = (await s.ph.stock()).items.find((i) => i.code === 'PHA-ANT')!.itemId;
    // quantité réduite sans motif → refus ; motif vide ou blanc → refus
    await expect(s.ph.prepare({ prescriptionId: r.id, lines: [{ rxLineIndex: 0, itemId: item, quantity: 4 }] })).rejects.toThrow('pharmacy.deviationReasonRequired');
    await expect(s.ph.prepare({ prescriptionId: r.id, lines: [{ rxLineIndex: 0, itemId: item, quantity: 4, reason: '   ' }] })).rejects.toThrow('pharmacy.deviationReasonRequired');
    // produit différent (même quantité) → motif exigé
    await expect(s.ph.prepare({ prescriptionId: r.id, lines: [{ rxLineIndex: 1, itemId: item, quantity: 2 }] })).rejects.toThrow('pharmacy.deviationReasonRequired');
    expect(await s.ph.queue()).toHaveLength(1);
    expect((await s.ph.queue())[0]!.remaining).toEqual([10, 2]); // rien d'enregistré par les refus
    // pas d'écart → pas de motif
    const ok = await s.ph.prepare({ prescriptionId: r.id, lines: [{ rxLineIndex: 0, itemId: item, quantity: 10 }] });
    expect(ok.dispensation.lines[0]!.deviation).toBeUndefined();
    // avec motif → enregistré sur la ligne
    const dev = await s.ph.prepare({ prescriptionId: r.id, lines: [{ rxLineIndex: 1, itemId: item, quantity: 2, reason: ' équivalent générique ' }] });
    expect(dev.dispensation.lines[0]!.deviation).toEqual({ kinds: ['substituted'], reason: 'équivalent générique' });
  });

  it('accepte des quantités décimales (0,5 ; 2,5) sans dérive de calcul', () => {
    const lots = [lot('a', 'x', '2027-01-01', 3)];
    expect(R.allocateFefo(lots, 'x', 2.5, '2026-11-14')).toEqual([{ lotId: 'a', lotNumber: 'a', quantity: 2.5 }]);
    expect(code(() => R.allocateFefo(lots, 'x', 0.001, '2026-11-14'))).toBe('quantityInvalid');
    const rxLines = [{ label: 'Sirop', quantity: 2.5 }];
    expect(() => R.checkPrepare([{ rxLineIndex: 0, quantity: 0.1 }, { rxLineIndex: 0, quantity: 0.2 }], rxLines, [])).not.toThrow();
    expect(R.remaining(rxLines, [])).toEqual([2.5]);
    expect(code(() => R.checkPrepare([{ rxLineIndex: 0, quantity: 2.6 }], rxLines, []))).toBe('overDispense');
  });
  it('FEFO : le lot qui expire en premier sort d’abord, les périmés sont ignorés', () => {
    const lots = [lot('b', 'x', '2028-01-01', 10), lot('a', 'x', '2027-01-01', 5), lot('old', 'x', '2020-01-01', 100), lot('n', 'x', null, 50)];
    expect(R.allocateFefo(lots, 'x', 12, '2026-11-14')).toEqual([{ lotId: 'a', lotNumber: 'a', quantity: 5 }, { lotId: 'b', lotNumber: 'b', quantity: 7 }]);
    expect(R.available(lots, 'x', '2026-11-14')).toBe(65);
    expect(code(() => R.allocateFefo(lots, 'x', 66, '2026-11-14'))).toBe('insufficientStock');
    expect(code(() => R.allocateFefo(lots, 'x', 0, '2026-11-14'))).toBe('quantityInvalid');
  });
  it('un lot qui expire aujourd’hui est encore utilisable, demain non', () => {
    expect(R.available([lot('a', 'x', '2026-11-14', 3)], 'x', '2026-11-14')).toBe(3);
    expect(R.available([lot('a', 'x', '2026-11-14', 3)], 'x', '2026-11-15')).toBe(0);
  });
  it('réception et ajustement validés', () => {
    expect(code(() => R.checkReceive({ lotNumber: ' ', quantity: 1, expiresAt: null }, '2026-11-14'))).toBe('lotRequired');
    expect(code(() => R.checkReceive({ lotNumber: 'L', quantity: 0, expiresAt: null }, '2026-11-14'))).toBe('quantityInvalid');
    expect(code(() => R.checkReceive({ lotNumber: 'L', quantity: 1, expiresAt: '2026-01-01' }, '2026-11-14'))).toBe('alreadyExpired');
    expect(code(() => R.checkAdjust(lot('a', 'x', null, 3), -4, 'casse'))).toBe('negativeStock');
    expect(code(() => R.checkAdjust(lot('a', 'x', null, 3), -1, ' '))).toBe('reasonRequired');
  });
});

describe('pharmacie locale', () => {
  it('prescrire ≠ dispenser : la file ne contient que les prescriptions validées, avec le reste à dispenser', async () => {
    const s = setup();
    const draft = await s.rx.create({ patientId: 'DEMO-P-007', items: [line()], note: '' });
    expect(await s.ph.queue()).toHaveLength(0);
    await s.rx.validate({ id: draft.id });
    const q = await s.ph.queue();
    expect(q).toHaveLength(1);
    expect(q[0]!.remaining).toEqual([10]);
  });

  it('préparer crée la facture sans toucher au stock ; payer ; dispenser sort le stock en FEFO et solde la prescription', async () => {
    const s = setup();
    const r = await validated(s);
    const stock0 = await s.ph.stock();
    const ant = stock0.items.find((i) => i.code === 'PHA-ANT')!;
    expect(ant.total).toBe(130);
    expect(ant.usable).toBe(100); // le lot périmé (30) n'est pas utilisable
    const v = await s.ph.prepare({ prescriptionId: r.id, lines: [{ rxLineIndex: 0, itemId: ant.itemId, quantity: 10 }] });
    expect(v.dispensation.status).toBe('prepared');
    expect(v.invoice?.invoice.totals.patient).toBe(5000);
    expect((await s.ph.stock()).items.find((i) => i.code === 'PHA-ANT')!.total).toBe(130);
    await expect(s.ph.dispense({ id: v.dispensation.id })).rejects.toThrow('pharmacy.paymentRequired');
    await s.finance.recordPayment({ invoiceId: v.dispensation.invoiceId, amount: 5000, method: 'cash', submissionId: 'p' });
    const done = await s.ph.dispense({ id: v.dispensation.id });
    expect(done.dispensation.status).toBe('dispensed');
    expect(done.dispensation.lines[0]!.lots).toEqual([{ lotId: 'lot-01', lotNumber: 'LOT-DEMO-A1', quantity: 10 }]);
    const after = await s.ph.stock();
    expect(after.items.find((i) => i.code === 'PHA-ANT')!.total).toBe(120);
    expect((await s.rx.list())[0]!.status).toBe('dispensed');
    await expect(s.ph.dispense({ id: v.dispensation.id })).rejects.toThrow('pharmacy.wrongStatus');
  });

  it('les mouvements expliquent exactement le stock de chaque lot', async () => {
    const s = setup();
    const r = await validated(s);
    const ant = (await s.ph.stock()).items.find((i) => i.code === 'PHA-ANT')!;
    const v = await s.ph.prepare({ prescriptionId: r.id, lines: [{ rxLineIndex: 0, itemId: ant.itemId, quantity: 10 }] });
    await s.finance.recordPayment({ invoiceId: v.dispensation.invoiceId, amount: 5000, method: 'cash', submissionId: 'p' });
    await s.ph.dispense({ id: v.dispensation.id });
    await s.ph.adjust({ lotId: 'lot-02', delta: -3, reason: 'casse constatée' });
    const st = await s.ph.stock();
    for (const l of st.items.flatMap((i) => i.lots)) expect(st.movements.filter((m) => m.lotId === l.id).reduce((a, m) => a + m.delta, 0)).toBe(l.quantity);
  });

  it('dispensation partielle puis solde ; interdit de dépasser la quantité prescrite', async () => {
    const s = setup();
    const r = await validated(s, [line({ quantity: 10 })]);
    const item = (await s.ph.stock()).items.find((i) => i.code === 'PHA-ANT')!.itemId;
    const a = await s.ph.prepare({ prescriptionId: r.id, lines: [{ rxLineIndex: 0, itemId: item, quantity: 4, reason: 'stock limité' }] });
    await expect(s.ph.prepare({ prescriptionId: r.id, lines: [{ rxLineIndex: 0, itemId: item, quantity: 7 }] })).rejects.toThrow('pharmacy.overDispense');
    await s.finance.recordPayment({ invoiceId: a.dispensation.invoiceId, amount: 2000, method: 'cash', submissionId: 'a' });
    await s.ph.dispense({ id: a.dispensation.id });
    expect((await s.rx.list())[0]!.status).toBe('validated');
    expect((await s.ph.queue())[0]!.remaining).toEqual([6]);
    const b = await s.ph.prepare({ prescriptionId: r.id, lines: [{ rxLineIndex: 0, itemId: item, quantity: 6 }] });
    await s.finance.recordPayment({ invoiceId: b.dispensation.invoiceId, amount: 3000, method: 'cash', submissionId: 'b' });
    await s.ph.dispense({ id: b.dispensation.id });
    expect((await s.rx.list())[0]!.status).toBe('dispensed');
    expect(await s.ph.queue()).toHaveLength(0);
  });

  it('refuse un produit hors catalogue pharmacie et un stock insuffisant, sans rien enregistrer', async () => {
    const s = setup();
    const r = await validated(s, [line({ quantity: 500 })]);
    const item = (await s.ph.stock()).items.find((i) => i.code === 'PHA-ANT')!.itemId;
    await expect(s.ph.prepare({ prescriptionId: r.id, lines: [{ rxLineIndex: 0, itemId: 'cat-03', quantity: 1 }] })).rejects.toThrow('pharmacy.itemNotInCatalog');
    await expect(s.ph.prepare({ prescriptionId: r.id, lines: [{ rxLineIndex: 0, itemId: item, quantity: 101 }] })).rejects.toThrow('pharmacy.insufficientStock');
    expect(await s.ph.dispensations()).toHaveLength(0);
    expect((await s.finance.snapshot()).invoices).toHaveLength(0);
  });

  it('une prescription non validée ou annulée ne peut pas être préparée', async () => {
    const s = setup();
    const draft = await s.rx.create({ patientId: 'DEMO-P-007', items: [line()], note: '' });
    const item = (await s.ph.stock()).items[0]!.itemId;
    await expect(s.ph.prepare({ prescriptionId: draft.id, lines: [{ rxLineIndex: 0, itemId: item, quantity: 1 }] })).rejects.toThrow('pharmacy.prescriptionNotValidated');
  });

  it('exception de paiement : permission, motif, tracée ; la dette reste en caisse', async () => {
    const a = setup(['health.pharmacy.exception']);
    const r = await validated(a);
    const item = (await a.ph.stock()).items.find((i) => i.code === 'PHA-ANT')!.itemId;
    const v = await a.ph.prepare({ prescriptionId: r.id, lines: [{ rxLineIndex: 0, itemId: item, quantity: 2, reason: 'stock limité' }] });
    await expect(a.ph.grantPaymentException({ id: v.dispensation.id, reason: 'urgence' })).rejects.toThrow('forbidden');
    const b = setup();
    const r2 = await validated(b);
    const item2 = (await b.ph.stock()).items.find((i) => i.code === 'PHA-ANT')!.itemId;
    const v2 = await b.ph.prepare({ prescriptionId: r2.id, lines: [{ rxLineIndex: 0, itemId: item2, quantity: 2, reason: 'stock limité' }] });
    await expect(b.ph.grantPaymentException({ id: v2.dispensation.id, reason: ' ' })).rejects.toThrow('pharmacy.reasonRequired');
    await b.ph.grantPaymentException({ id: v2.dispensation.id, reason: 'urgence vitale' });
    expect((await b.ph.dispense({ id: v2.dispensation.id })).dispensation.status).toBe('dispensed');
    expect((await b.finance.snapshot()).invoices[0]!.balances.patientBalance).toBe(1000);
  });

  it('annulation avant remise : facture impayée annulée ; payée → remboursement à faire ; après remise → refusé', async () => {
    const s = setup();
    const r = await validated(s, [line({ quantity: 10 })]);
    const item = (await s.ph.stock()).items.find((i) => i.code === 'PHA-ANT')!.itemId;
    const a = await s.ph.prepare({ prescriptionId: r.id, lines: [{ rxLineIndex: 0, itemId: item, quantity: 2, reason: 'stock limité' }] });
    await expect(s.ph.cancel({ id: a.dispensation.id, reason: ' ' })).rejects.toThrow('pharmacy.reasonRequired');
    const c = await s.ph.cancel({ id: a.dispensation.id, reason: 'erreur' });
    expect(c.invoice?.status).toBe('cancelled');
    expect((await s.ph.queue())[0]!.remaining).toEqual([10]); // la quantité est libérée
    const b = await s.ph.prepare({ prescriptionId: r.id, lines: [{ rxLineIndex: 0, itemId: item, quantity: 2, reason: 'stock limité' }] });
    await s.finance.recordPayment({ invoiceId: b.dispensation.invoiceId, amount: 1000, method: 'cash', submissionId: 'b' });
    expect((await s.ph.cancel({ id: b.dispensation.id, reason: 'patient parti' })).dispensation.cancellation?.refundPending).toBe(true);
    const d = await s.ph.prepare({ prescriptionId: r.id, lines: [{ rxLineIndex: 0, itemId: item, quantity: 2, reason: 'stock limité' }] });
    await s.finance.recordPayment({ invoiceId: d.dispensation.invoiceId, amount: 1000, method: 'cash', submissionId: 'd' });
    await s.ph.dispense({ id: d.dispensation.id });
    await expect(s.ph.cancel({ id: d.dispensation.id, reason: 'x' })).rejects.toThrow('pharmacy.cannotCancelDispensed');
  });

  it('une prescription avec dispensation ne peut plus être annulée', async () => {
    const s = setup();
    const r = await validated(s);
    const item = (await s.ph.stock()).items.find((i) => i.code === 'PHA-ANT')!.itemId;
    await s.ph.prepare({ prescriptionId: r.id, lines: [{ rxLineIndex: 0, itemId: item, quantity: 2, reason: 'stock limité' }] });
    await expect(s.rx.cancel({ id: r.id, reason: 'x' })).rejects.toThrow('rx.hasDispensation');
  });

  it('réception de lot et ajustement : permissions, doublon de lot, stock jamais négatif', async () => {
    const s = setup();
    const item = (await s.ph.stock()).items.find((i) => i.code === 'PHA-ATB')!.itemId;
    const l = await s.ph.receiveLot({ itemId: item, lotNumber: 'NEW-1', quantity: 10, expiresAt: '2029-01-01' });
    expect(l.quantity).toBe(10);
    await expect(s.ph.receiveLot({ itemId: item, lotNumber: ' new-1 ', quantity: 5, expiresAt: null })).rejects.toThrow('pharmacy.lotExists');
    await expect(s.ph.adjust({ lotId: l.id, delta: -11, reason: 'inventaire' })).rejects.toThrow('pharmacy.negativeStock');
    expect((await s.ph.adjust({ lotId: l.id, delta: -4, reason: 'inventaire' })).quantity).toBe(6);
    const d = setup(['health.stock.adjust']);
    await expect(d.ph.adjust({ lotId: 'lot-01', delta: -1, reason: 'x' })).rejects.toThrow('forbidden');
  });

  it('isolation multi-établissements : le stock d’un site n’est pas celui d’un autre', async () => {
    const s = setup();
    const r = await validated(s);
    const item = (await s.ph.stock()).items.find((i) => i.code === 'PHA-ANT')!.itemId;
    const v = await s.ph.prepare({ prescriptionId: r.id, lines: [{ rxLineIndex: 0, itemId: item, quantity: 10 }] });
    await s.finance.recordPayment({ invoiceId: v.dispensation.invoiceId, amount: 5000, method: 'cash', submissionId: 'p' });
    await s.ph.dispense({ id: v.dispensation.id });
    s.state.facility = 'F2';
    expect((await s.ph.stock()).items.find((i) => i.code === 'PHA-ANT')!.total).toBe(130);
    expect(await s.ph.dispensations()).toHaveLength(0);
  });
});
