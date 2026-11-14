import { describe, expect, it } from 'vitest';
import type { LocalContext } from '@/core/local/context';
import { createMemoryDatabase } from '@/core/local/memory-database';
import { runUnit } from '@/core/local/unit-of-work';
import { createFinanceService, type FinanceDeps } from './finance-service';

const civil = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function setup(opts: { denied?: string[]; facility?: string } = {}) {
  const db = createMemoryDatabase();
  const state = { now: new Date(2026, 10, 14, 10, 0, 0), facility: opts.facility ?? 'F1', denied: new Set(opts.denied ?? []), n: 0 };
  const ctx = (): LocalContext => ({ facilityId: state.facility, actor: { id: 'u-cash', name: 'Caissier démo' } });
  const deps: FinanceDeps = {
    run: (fn) => runUnit(fn, { db: async () => db, context: ctx, now: () => state.now }),
    require: (p) => { if (state.denied.has(p)) throw new Error(`forbidden:${p}`); },
    patient: async (_u, id) => (id.startsWith('DEMO-P-') ? { id, fullName: `Patient ${id}` } : undefined),
    newId: (prefix) => `${prefix}-${++state.n}`,
    day: civil,
  };
  const svc = createFinanceService(deps);
  const catalog = async () => (await svc.snapshot()).catalog;
  const item = async (code: string) => (await catalog()).find((c) => c.code === code)!.id;
  return { svc, db, state, item };
}

describe('facturation locale', () => {
  it('assuré 80 % sur tarif négocié : assureur 14,40 / patient 3,60, instantané des règles figé', async () => {
    const { svc, item } = setup();
    const v = await svc.createInvoice({ patientId: 'DEMO-P-002', lines: [{ itemId: await item('CONS-GEN'), quantity: 1 }], primaryCoverageId: 'cov-01' });
    expect(v.invoice.totals).toMatchObject({ billable: 1800, insurer: 1440, patient: 360 });
    expect(v.invoice.lines[0]!.rules.primary?.organizationId).toBe('org-assur-a');
    expect(v.invoice.number).toBe('FAC-2026-000001');
    expect(v.status).toBe('awaitingPayment');
  });

  it('facture non soldée tant que l’assureur n’a pas réglé ; frais de consultation accordés au solde patient', async () => {
    const { svc, item } = setup();
    const v = await svc.createInvoice({ patientId: 'DEMO-P-002', lines: [{ itemId: await item('CONS-GEN'), quantity: 1 }], primaryCoverageId: 'cov-01' });
    expect((await svc.feeStatusFor('DEMO-P-002')).state).toBe('none');
    const paid = await svc.recordPayment({ invoiceId: v.invoice.id, amount: 360, method: 'cash', submissionId: 's1' });
    expect(paid.balances.patientBalance).toBe(0);
    expect(paid.status).toBe('partiallyPaid'); // créance assureur ouverte
    expect((await svc.feeStatusFor('DEMO-P-002')).state).toBe('valid');
    const done = await svc.settleOrganization({ invoiceId: v.invoice.id, organizationId: 'org-assur-a', amount: 1440, method: 'transfer', reference: 'VIR-DEMO-1', submissionId: 's2' });
    expect(done.status).toBe('paid');
  });

  it('refuse une nouvelle consultation tant que les frais sont valides, puis l’accepte après l’échéance', async () => {
    const { svc, item, state } = setup();
    const cons = await item('CONS-GEN');
    const v = await svc.createInvoice({ patientId: 'DEMO-P-007', lines: [{ itemId: cons, quantity: 1 }] });
    await svc.recordPayment({ invoiceId: v.invoice.id, amount: 2000, method: 'cash', submissionId: 'a' });
    await expect(svc.createInvoice({ patientId: 'DEMO-P-007', lines: [{ itemId: cons, quantity: 1 }] })).rejects.toThrow('billing.feeStillValid');
    state.now = new Date(2026, 11, 14, 10, 0, 0); // échéance 14 déc. incluse
    await expect(svc.createInvoice({ patientId: 'DEMO-P-007', lines: [{ itemId: cons, quantity: 1 }] })).rejects.toThrow('billing.feeStillValid');
    state.now = new Date(2026, 11, 15, 8, 0, 0);
    expect((await svc.feeStatusFor('DEMO-P-007')).state).toBe('expired');
    await expect(svc.createInvoice({ patientId: 'DEMO-P-007', lines: [{ itemId: cons, quantity: 1 }] })).resolves.toBeTruthy();
  });

  it('la contrepassation du paiement retire la validité des frais', async () => {
    const { svc, item } = setup();
    const v = await svc.createInvoice({ patientId: 'DEMO-P-007', lines: [{ itemId: await item('CONS-GEN'), quantity: 1 }] });
    const p = await svc.recordPayment({ invoiceId: v.invoice.id, amount: 2000, method: 'cash', submissionId: 'a' });
    expect((await svc.feeStatusFor('DEMO-P-007')).state).toBe('valid');
    await expect(svc.reversePayment({ entryId: p.ledger[0]!.id, reason: '  ', submissionId: 'r0' })).rejects.toThrow('billing.reasonRequired');
    const r = await svc.reversePayment({ entryId: p.ledger[0]!.id, reason: 'Erreur de saisie', submissionId: 'r1' });
    expect(r.balances.patientBalance).toBe(2000);
    expect((await svc.feeStatusFor('DEMO-P-007')).state).toBe('none'); // paiement annulé : plus de droit (ligne conservée, marquée annulée)
    expect((await svc.snapshot()).feePayments[0]!.voided).toBe(true);
  });

  it('rejette un surpaiement et ne laisse AUCUNE écriture partielle', async () => {
    const { svc, item, db } = setup();
    const v = await svc.createInvoice({ patientId: 'DEMO-P-007', lines: [{ itemId: await item('LAB-NFS'), quantity: 1 }] });
    const before = (await db.dump()).audit.length;
    await expect(svc.recordPayment({ invoiceId: v.invoice.id, amount: 99999, method: 'cash', submissionId: 'x' })).rejects.toThrow('billing.overpayment');
    expect((await db.dump()).audit.length).toBe(before);
    expect((await svc.snapshot()).ledger).toHaveLength(0);
  });

  it('la même soumission ne crée qu’un seul paiement (double clic)', async () => {
    const { svc, item } = setup();
    const v = await svc.createInvoice({ patientId: 'DEMO-P-007', lines: [{ itemId: await item('LAB-NFS'), quantity: 1 }] });
    await svc.recordPayment({ invoiceId: v.invoice.id, amount: 500, method: 'cash', submissionId: 'dup' });
    await expect(svc.recordPayment({ invoiceId: v.invoice.id, amount: 500, method: 'cash', submissionId: 'dup' })).rejects.toThrow('billing.duplicatePayment');
    expect((await svc.snapshot()).ledger).toHaveLength(1);
  });

  it('refuse sans permission (le service est la barrière, pas le bouton)', async () => {
    const { svc, item, state } = setup();
    const v = await svc.createInvoice({ patientId: 'DEMO-P-007', lines: [{ itemId: await item('LAB-NFS'), quantity: 1 }] });
    state.denied = new Set(['health.billing.pay', 'health.billing.cancel', 'health.billing.exempt', 'health.billing.configure']);
    await expect(svc.recordPayment({ invoiceId: v.invoice.id, amount: 100, method: 'cash', submissionId: 'z' })).rejects.toThrow('forbidden');
    await expect(svc.cancelInvoice({ invoiceId: v.invoice.id, reason: 'test' })).rejects.toThrow('forbidden');
    await expect(svc.exemptFee({ patientId: 'DEMO-P-007', reason: 'indigent' })).rejects.toThrow('forbidden');
    await expect(svc.setFeeConfig({ effectiveFrom: '2027-01-01', months: 2, mode: 'clamp', reason: 'r' })).rejects.toThrow('forbidden');
  });

  it('annulation : refusée s’il y a un paiement, acceptée sinon (motif obligatoire)', async () => {
    const { svc, item } = setup();
    const lab = await item('LAB-NFS');
    const a = await svc.createInvoice({ patientId: 'DEMO-P-007', lines: [{ itemId: lab, quantity: 1 }] });
    await svc.recordPayment({ invoiceId: a.invoice.id, amount: 100, method: 'cash', submissionId: 'p' });
    await expect(svc.cancelInvoice({ invoiceId: a.invoice.id, reason: 'erreur' })).rejects.toThrow('billing.hasPayments');
    const b = await svc.createInvoice({ patientId: 'DEMO-P-008', lines: [{ itemId: lab, quantity: 1 }] });
    await expect(svc.cancelInvoice({ invoiceId: b.invoice.id, reason: '' })).rejects.toThrow('billing.reasonRequired');
    expect((await svc.cancelInvoice({ invoiceId: b.invoice.id, reason: 'Patient parti' })).status).toBe('cancelled');
  });

  it('une prestation d’origine ne se facture qu’une fois', async () => {
    const { svc, item } = setup();
    const req = { patientId: 'DEMO-P-007', lines: [{ itemId: await item('LAB-NFS'), quantity: 1 }], sources: [{ module: 'laboratory', ref: 'ORD-1' }] };
    await svc.createInvoice(req);
    await expect(svc.createInvoice(req)).rejects.toThrow('billing.alreadyInvoiced');
  });

  it('couverture « en attente » : jamais appliquée ; validée ensuite, elle l’est', async () => {
    const { svc, item } = setup();
    const lab = await item('LAB-NFS');
    const before = await svc.preview({ patientId: 'DEMO-P-005', lines: [{ itemId: lab, quantity: 1 }], primaryCoverageId: 'cov-05' });
    expect(before.totals.insurer).toBe(0);
    await svc.validateCoverage({ coverageId: 'cov-05', status: 'validated', note: 'Carte vérifiée (démo)' });
    const after = await svc.preview({ patientId: 'DEMO-P-005', lines: [{ itemId: lab, quantity: 1 }], primaryCoverageId: 'cov-05' });
    expect(after.totals.insurer).toBe(1200);
    const cov = (await svc.snapshot()).coverages.find((c) => c.id === 'cov-05')!;
    expect(cov.history.at(-1)).toMatchObject({ status: 'validated', by: 'Caissier démo' });
  });

  it('une couverture créée est toujours « en attente » sans validation', async () => {
    const { svc } = setup();
    const c = await svc.createCoverage({ patientId: 'DEMO-P-009', organizationId: 'org-assur-a', contractId: 'ctr-a', kind: 'insurance', policyNumber: 'X', cardNumber: 'Y', memberNumber: 'Z', coverageType: 'std', validFrom: '2026-01-01', validTo: '2026-12-31', beneficiaryIds: [], documents: [], priority: 1 });
    expect(c.status).toBe('pending');
    expect(c.history).toHaveLength(0);
  });

  it('assurance + mutuelle : la complémentaire ne couvre que le ticket modérateur (somme des parts = facturable)', async () => {
    const { svc, item } = setup();
    const p = await svc.preview({ patientId: 'DEMO-P-004', lines: [{ itemId: await item('LAB-NFS'), quantity: 1 }], primaryCoverageId: 'cov-03', secondaryCoverageId: 'cov-04' });
    const t = p.totals;
    expect(t.insurer + t.subscription + t.patient).toBe(t.billable);
    expect(t.insurer).toBe(1500); // 80 % assureur + 20 % mutuelle
    expect(t.patient).toBe(0);
  });

  it('plafond d’épisode partagé entre factures du même épisode', async () => {
    const { svc, item } = setup();
    const room = await item('ROOM-STD');
    const a = await svc.createInvoice({ patientId: 'DEMO-P-002', lines: [{ itemId: room, quantity: 4 }], primaryCoverageId: 'cov-01', episodeId: 'EP1' });
    expect(a.invoice.totals.insurer).toBe(11200); // 70 % de 160,00
    const b = await svc.preview({ patientId: 'DEMO-P-002', lines: [{ itemId: room, quantity: 10 }], primaryCoverageId: 'cov-01', episodeId: 'EP1' });
    // plafond ligne 200,00 ; plafond épisode 1000,00 : reste cumulable, jamais au-delà
    expect(b.totals.insurer).toBeLessThanOrEqual(20000);
    expect(b.totals.insurer + b.totals.patient).toBe(b.totals.billable);
  });

  it('exemption : motif obligatoire, tracée ; durée non rétroactive', async () => {
    const { svc } = setup();
    await expect(svc.exemptFee({ patientId: 'DEMO-P-010', reason: ' ' })).rejects.toThrow('billing.reasonRequired');
    const ex = await svc.exemptFee({ patientId: 'DEMO-P-010', reason: 'Cas social (démo)' });
    expect(ex.source).toBe('exemption');
    expect((await svc.feeStatusFor('DEMO-P-010')).state).toBe('valid');
    await expect(svc.setFeeConfig({ effectiveFrom: '2026-11-01', months: 3, mode: 'clamp', reason: 'x' })).rejects.toThrow('billing.configRetroactive');
    const doc = await svc.setFeeConfig({ effectiveFrom: '2026-12-01', months: 3, mode: 'endOfMonth', reason: 'Politique 2027 (démo)' });
    expect(doc.history).toHaveLength(2);
    expect((await svc.feeStatusFor('DEMO-P-010')).validUntil).toBe('2026-12-14'); // l'ancien paiement garde son échéance
  });

  it('isole les établissements', async () => {
    const a = setup();
    await a.svc.createInvoice({ patientId: 'DEMO-P-007', lines: [{ itemId: await a.item('LAB-NFS'), quantity: 1 }] });
    a.state.facility = 'F2';
    expect((await a.svc.snapshot()).invoices).toHaveLength(0);
  });
});
