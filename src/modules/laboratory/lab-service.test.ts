import { describe, expect, it } from 'vitest';
import type { LocalContext } from '@/core/local/context';
import { createMemoryDatabase } from '@/core/local/memory-database';
import { runUnit } from '@/core/local/unit-of-work';
import { createFinanceService, type FinanceDeps } from '../finance/finance-service';
import { createLabService } from './lab-service';

const civil = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function setup(denied: string[] = []) {
  const db = createMemoryDatabase();
  const state = { now: new Date(2026, 10, 14, 10, 0, 0), facility: 'F1', denied: new Set(denied), n: 0 };
  const ctx = (): LocalContext => ({ facilityId: state.facility, actor: { id: 'u1', name: 'Agent démo' } });
  const deps: FinanceDeps = {
    run: (fn) => runUnit(fn, { db: async () => db, context: ctx, now: () => state.now }),
    require: (p) => { if (state.denied.has(p)) throw new Error(`forbidden:${p}`); },
    patient: async (_u, id) => (id.startsWith('DEMO-P-') ? { id, fullName: `Patient ${id}` } : undefined),
    newId: (prefix) => `${prefix}-${++state.n}`,
    day: civil,
  };
  const finance = createFinanceService(deps);
  const lab = createLabService(deps, finance);
  const ids = async (...codes: string[]) => { const c = await lab.catalog(); return codes.map((x) => c.find((i) => i.code === x)!.id); };
  return { lab, finance, state, ids };
}
const val = (code: string, value: string) => ({ code, value, unit: 'u', referenceRange: '', flag: 'unspecified' as const, comment: '' });

describe('laboratoire local', () => {
  it('propose uniquement les examens actifs du catalogue de laboratoire', async () => {
    const { lab } = setup();
    const codes = (await lab.catalog()).map((c) => c.code).sort();
    expect(codes).toEqual(['LAB-CREA', 'LAB-GLY', 'LAB-GROSS', 'LAB-NFS', 'LAB-PALU', 'LAB-URINE']);
  });

  it('la demande crée la facture dans la même transaction : l’examen apparaît à la caisse', async () => {
    const { lab, finance, ids } = setup();
    const v = await lab.order({ patientId: 'DEMO-P-007', testItemIds: await ids('LAB-NFS', 'LAB-GLY'), priority: 'routine', clinicalNote: '', consultationId: 'C1' });
    expect(v.order.status).toBe('requested');
    expect(v.invoice?.invoice.totals.patient).toBe(2300);
    expect(v.invoice?.invoice.episodeId).toBe('C1');
    expect(v.paymentState).toBe('unpaid');
    const snap = await finance.snapshot();
    expect(snap.invoices.map((i) => i.invoice.id)).toContain(v.order.invoiceId);
    expect(v.invoice?.invoice.sourceKeys).toEqual([`laboratory:${v.order.id}:LAB-NFS`, `laboratory:${v.order.id}:LAB-GLY`]);
  });

  it('aucune demande orpheline : si la facturation est refusée, rien n’est enregistré', async () => {
    const { lab, ids } = setup();
    await expect(lab.order({ patientId: 'DEMO-P-007', testItemIds: await ids('LAB-NFS'), priority: 'routine', clinicalNote: '', primaryCoverageId: 'cov-inexistante' })).rejects.toThrow();
    expect(await lab.list()).toHaveLength(0);
  });

  it('refuse patient inconnu et examen hors catalogue', async () => {
    const { lab, ids } = setup();
    await expect(lab.order({ patientId: 'X', testItemIds: await ids('LAB-NFS'), priority: 'routine', clinicalNote: '' })).rejects.toThrow('lab.patientNotFound');
    await expect(lab.order({ patientId: 'DEMO-P-007', testItemIds: ['cat-01'], priority: 'routine', clinicalNote: '' })).rejects.toThrow('lab.testNotInCatalog');
    await expect(lab.order({ patientId: 'DEMO-P-007', testItemIds: [], priority: 'routine', clinicalNote: '' })).rejects.toThrow('lab.testsRequired');
  });

  it('le prélèvement est bloqué tant que la caisse n’a pas encaissé, puis débloqué par le paiement', async () => {
    const { lab, finance, ids } = setup();
    const v = await lab.order({ patientId: 'DEMO-P-007', testItemIds: await ids('LAB-PALU'), priority: 'urgent', clinicalNote: '' });
    await expect(lab.collect({ orderId: v.order.id, sampleNote: '' })).rejects.toThrow('lab.paymentRequired');
    await finance.recordPayment({ invoiceId: v.order.invoiceId, amount: 600, method: 'cash', submissionId: 'p1' });
    const after = await lab.collect({ orderId: v.order.id, sampleNote: 'sang veineux' });
    expect(after.order.status).toBe('collected');
    expect(after.paymentState).toBe('paid');
  });

  it('une part patient nulle (assurance + mutuelle complémentaire) permet le prélèvement sans encaissement', async () => {
    const { lab, ids } = setup();
    const v = await lab.order({ patientId: 'DEMO-P-004', testItemIds: await ids('LAB-GLY'), priority: 'routine', clinicalNote: '', primaryCoverageId: 'cov-03', secondaryCoverageId: 'cov-04' });
    expect(v.invoice!.balances.patientBalance).toBe(0);
    expect(v.paymentCleared).toBe(true);
    expect((await lab.collect({ orderId: v.order.id, sampleNote: '' })).order.status).toBe('collected');
  });

  it('le crédit autorisé débloque le prélèvement ; l’exception exige permission, motif, et est tracée', async () => {
    const a = setup();
    const v = await a.lab.order({ patientId: 'DEMO-P-007', testItemIds: await a.ids('LAB-NFS'), priority: 'routine', clinicalNote: '' });
    await a.finance.authorizeCredit({ invoiceId: v.order.invoiceId, reason: 'garantie famille' });
    expect((await a.lab.collect({ orderId: v.order.id, sampleNote: '' })).order.status).toBe('collected');

    const b = setup(['health.laboratory.exception']);
    const w = await b.lab.order({ patientId: 'DEMO-P-007', testItemIds: await b.ids('LAB-NFS'), priority: 'routine', clinicalNote: '' });
    await expect(b.lab.grantPaymentException({ orderId: w.order.id, reason: 'urgence' })).rejects.toThrow('forbidden:health.laboratory.exception');

    const c = setup();
    const x = await c.lab.order({ patientId: 'DEMO-P-007', testItemIds: await c.ids('LAB-NFS'), priority: 'urgent', clinicalNote: '' });
    await expect(c.lab.grantPaymentException({ orderId: x.order.id, reason: ' ' })).rejects.toThrow('lab.reasonRequired');
    const ex = await c.lab.grantPaymentException({ orderId: x.order.id, reason: 'urgence vitale' });
    expect(ex.paymentState).toBe('exception');
    expect((await c.lab.collect({ orderId: x.order.id, sampleNote: '' })).order.paymentException?.reason).toBe('urgence vitale');
    // la dette reste ouverte à la caisse
    expect((await c.finance.snapshot()).invoices.find((i) => i.invoice.id === x.order.invoiceId)?.balances.patientBalance).toBe(1500);
  });

  it('parcours complet jusqu’à la validation puis rectification avec historique', async () => {
    const { lab, finance, ids } = setup();
    const v = await lab.order({ patientId: 'DEMO-P-007', testItemIds: await ids('LAB-GLY'), priority: 'routine', clinicalNote: '' });
    const id = v.order.id;
    await finance.recordPayment({ invoiceId: v.order.invoiceId, amount: 800, method: 'cash', submissionId: 'p' });
    await lab.collect({ orderId: id, sampleNote: '' });
    await lab.start({ orderId: id });
    const entered = await lab.enterResults({ orderId: id, values: [val('LAB-GLY', '5,2')] });
    expect(entered.order.status).toBe('resultEntered');
    expect((await lab.validate({ orderId: id })).order.status).toBe('validated');
    const am = await lab.amend({ orderId: id, values: [val('LAB-GLY', '5,4')], reason: 'erreur de saisie' });
    expect(am.order.amendments[0]!.previous[0]!.value).toBe('5,2');
    await expect(lab.cancel({ orderId: id, reason: 'x' })).rejects.toThrow('lab.cannotCancelAfterCollect');
  });

  it('annulation avant prélèvement : facture impayée annulée atomiquement', async () => {
    const { lab, finance, ids } = setup();
    const v = await lab.order({ patientId: 'DEMO-P-007', testItemIds: await ids('LAB-NFS'), priority: 'routine', clinicalNote: '' });
    const c = await lab.cancel({ orderId: v.order.id, reason: 'demande en double' });
    expect(c.order.status).toBe('cancelled');
    expect(c.order.cancellation?.refundPending).toBe(false);
    expect(c.invoice?.status).toBe('cancelled');
    expect((await finance.snapshot()).invoices.find((i) => i.invoice.id === v.order.invoiceId)?.status).toBe('cancelled');
  });

  it('annulation après paiement : la demande est annulée, le remboursement reste à faire en caisse', async () => {
    const { lab, finance, ids } = setup();
    const v = await lab.order({ patientId: 'DEMO-P-007', testItemIds: await ids('LAB-NFS'), priority: 'routine', clinicalNote: '' });
    await finance.recordPayment({ invoiceId: v.order.invoiceId, amount: 1500, method: 'cash', submissionId: 'p' });
    const c = await lab.cancel({ orderId: v.order.id, reason: 'erreur patient' });
    expect(c.order.cancellation?.refundPending).toBe(true);
    expect(c.invoice?.status).not.toBe('cancelled');
    expect(c.invoice?.balances.patientPaid).toBe(1500);
    expect(c.paymentCleared).toBe(true);
  });

  it('permissions appliquées dans le service', async () => {
    const { lab, ids } = setup(['health.laboratory.order']);
    await expect(lab.order({ patientId: 'DEMO-P-007', testItemIds: await ids('LAB-NFS'), priority: 'routine', clinicalNote: '' })).rejects.toThrow('forbidden');
  });

  it('isolation multi-établissements', async () => {
    const { lab, state, ids } = setup();
    await lab.order({ patientId: 'DEMO-P-007', testItemIds: await ids('LAB-NFS'), priority: 'routine', clinicalNote: '' });
    state.facility = 'F2';
    expect(await lab.list()).toHaveLength(0);
  });
});
