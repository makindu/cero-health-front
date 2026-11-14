import { describe, expect, it } from 'vitest';
import type { LocalContext } from '@/core/local/context';
import { createMemoryDatabase } from '@/core/local/memory-database';
import { runUnit } from '@/core/local/unit-of-work';
import { createFinanceService, type FinanceDeps } from '../finance/finance-service';
import { createAccountService } from './account-service';
import * as R from './hospital-rules';
import { createHospitalService } from './hospital-service';

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
  const hosp = createHospitalService(deps);
  const acc = createAccountService(deps, finance);
  const day = (n: number) => { state.now = new Date(2026, 10, 14 + n, 10, 0, 0); };
  const pay = async (invoiceId: string, amount: number) => finance.recordPayment({ invoiceId, amount, method: 'cash', submissionId: `p-${invoiceId}-${amount}-${++state.n}` });
  return { hosp, acc, finance, state, day, pay };
}
const base = { reason: 'surveillance', attending: 'Dr démo' };
const dayOf = (iso: string) => civil(new Date(iso));

describe('jours de chambre (règles pures)', () => {
  const adm = (over: Partial<R.Admission> = {}): R.Admission => ({
    id: 'a', number: 'n', patientId: 'p', patientName: 'p', ward: 'surgery', status: 'admitted', admittedAt: new Date(2026, 10, 14, 23, 30).toISOString(), admittedBy: 'x', attending: 'x', reason: 'x',
    stays: [{ bedId: 'b1', roomId: 'r1', from: new Date(2026, 10, 14, 23, 30).toISOString(), by: 'x' }], ...over,
  });
  it('addDays gère fin de mois et d’année', () => {
    expect(R.addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(R.addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(R.addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('séjour en cours : seulement les jours écoulés', () => {
    expect(R.billableDays(adm(), dayOf, '2026-11-14', false)).toEqual([]);
    expect(R.billableDays(adm(), dayOf, '2026-11-15', false).map((d) => d.day)).toEqual(['2026-11-14']);
    expect(R.billableDays(adm(), dayOf, '2026-11-17', false).map((d) => d.day)).toEqual(['2026-11-14', '2026-11-15', '2026-11-16']);
  });
  it('sortie : le jour de sortie ne compte pas, minimum un jour', () => {
    expect(R.billableDays(adm(), dayOf, '2026-11-14', true).map((d) => d.day)).toEqual(['2026-11-14']);
    expect(R.billableDays(adm(), dayOf, '2026-11-16', true).map((d) => d.day)).toEqual(['2026-11-14', '2026-11-15']);
  });
  it('le jour d’un transfert est imputé au nouveau lit', () => {
    const a = adm({ stays: [
      { bedId: 'b1', roomId: 'r1', from: new Date(2026, 10, 14, 8).toISOString(), to: new Date(2026, 10, 16, 9).toISOString(), by: 'x' },
      { bedId: 'b2', roomId: 'r2', from: new Date(2026, 10, 16, 9).toISOString(), by: 'x', reason: 'x' }] , admittedAt: new Date(2026, 10, 14, 8).toISOString() });
    expect(R.billableDays(a, dayOf, '2026-11-18', false).map((d) => `${d.day}:${d.roomId}`)).toEqual(['2026-11-14:r1', '2026-11-15:r1', '2026-11-16:r2', '2026-11-17:r2']);
  });
});

describe('compte hospitalier', () => {
  it('facture les jours écoulés par chambre, une seule fois (idempotent)', async () => {
    const s = setup();
    const a = await s.hosp.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base }); // standard 40,00/j
    await expect(s.acc.postRoomDays({ admissionId: a.id })).rejects.toThrow('hospital.nothingToPost');
    s.day(3);
    const v = await s.acc.postRoomDays({ admissionId: a.id });
    expect(v.invoices).toHaveLength(1);
    expect(v.invoices[0]!.invoice.lines).toHaveLength(3);
    expect(v.totals.billable).toBe(12000);
    expect(v.billedDayCount).toBe(3);
    expect(v.unbilledNow).toEqual([]);
    await expect(s.acc.postRoomDays({ admissionId: a.id })).rejects.toThrow('hospital.nothingToPost');
    s.day(4);
    expect((await s.acc.account(a.id)).unbilledNow).toEqual(['2026-11-17']);
    expect((await s.acc.postRoomDays({ admissionId: a.id })).totals.billable).toBe(16000);
  });

  it('chambre privée facturée au tarif privé après transfert', async () => {
    const s = setup();
    const a = await s.hosp.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    s.day(1);
    await s.hosp.transfer({ admissionId: a.id, bedId: 'bed-1-2-1', reason: 'privée' });
    s.day(3);
    const v = await s.acc.postRoomDays({ admissionId: a.id });
    expect(v.invoices[0]!.invoice.lines.map((l) => l.quantity)).toEqual([1, 1, 1]);
    expect(v.totals.billable).toBe(4000 + 9000 + 9000);
  });

  it('la couverture s’applique aux jours de chambre (assuré Alpha 70 % chambre, plafond par ligne)', async () => {
    const s = setup();
    const a = await s.hosp.admit({ patientId: 'DEMO-P-002', bedId: 'bed-1-1-1', ...base });
    s.day(2);
    const v = await s.acc.postRoomDays({ admissionId: a.id });
    expect(v.totals.billable).toBe(8000);
    expect(v.totals.insurerShare).toBeGreaterThan(0);
    expect(v.totals.patientShare + v.totals.insurerShare).toBe(v.totals.billable);
  });

  it('agrège aussi les factures créées pendant le séjour (laboratoire, pharmacie…)', async () => {
    const s = setup();
    const a = await s.hosp.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    const before = await s.finance.snapshot();
    const gly = before.catalog.find((c) => c.code === 'LAB-GLY')!;
    await s.finance.createInvoice({ patientId: 'DEMO-P-001', lines: [{ itemId: gly.id, quantity: 1 }] });
    const v = await s.acc.account(a.id);
    expect(v.invoices).toHaveLength(1);
    expect(v.totals.patientDue).toBe(800);
  });

  it('sortie refusée tant que des jours de chambre ne sont pas facturés, puis tant que le solde patient est dû', async () => {
    const s = setup();
    const a = await s.hosp.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    s.day(2);
    await expect(s.acc.discharge({ admissionId: a.id, outcome: 'normal', note: '' })).rejects.toThrow('hospital.roomDaysUnbilled');
    const v = await s.acc.postRoomDays({ admissionId: a.id, forDischarge: true });
    expect(v.totals.billable).toBe(8000); // 14 et 15 ; le 16 (sortie) ne compte pas
    await expect(s.acc.discharge({ admissionId: a.id, outcome: 'normal', note: '' })).rejects.toThrow('hospital.balanceDue');
    await s.pay(v.invoices[0]!.invoice.id, 8000);
    const out = await s.acc.discharge({ admissionId: a.id, outcome: 'normal', note: 'RAS' });
    expect(out.admission.status).toBe('discharged');
    const board = await s.hosp.board();
    expect(board.beds.find((b) => b.bed.id === 'bed-1-1-1')!.bed.status).toBe('cleaning');
    expect(R.findViolations(board.beds.map((b) => b.bed), board.admissions)).toEqual([]);
  });

  it('un paiement partiel ne suffit pas ; le crédit autorisé en caisse débloque la sortie', async () => {
    const s = setup();
    const a = await s.hosp.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    s.day(1);
    const v = await s.acc.postRoomDays({ admissionId: a.id, forDischarge: true });
    await s.pay(v.invoices[0]!.invoice.id, 1000);
    await expect(s.acc.discharge({ admissionId: a.id, outcome: 'normal', note: '' })).rejects.toThrow('hospital.balanceDue');
    await s.finance.authorizeCredit({ invoiceId: v.invoices[0]!.invoice.id, reason: 'garantie famille' });
    expect((await s.acc.discharge({ admissionId: a.id, outcome: 'normal', note: '' })).admission.status).toBe('discharged');
  });

  it('exception de sortie : permission dédiée, motif, tracée dans l’admission', async () => {
    const denied = setup(['health.discharges.exception']);
    const a1 = await denied.hosp.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    denied.day(1);
    await denied.acc.postRoomDays({ admissionId: a1.id, forDischarge: true });
    await expect(denied.acc.discharge({ admissionId: a1.id, outcome: 'normal', note: '', exceptionReason: 'urgence familiale' })).rejects.toThrow('forbidden');
    const s = setup();
    const a = await s.hosp.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    s.day(1);
    await s.acc.postRoomDays({ admissionId: a.id, forDischarge: true });
    const out = await s.acc.discharge({ admissionId: a.id, outcome: 'againstAdvice', note: 'sortie contre avis', exceptionReason: 'famille garante' });
    expect(out.admission.discharge?.exception?.reason).toBe('famille garante');
    expect(out.totals.patientDue).toBe(4000); // la dette reste ouverte en caisse
  });

  it('la part de l’assureur ne bloque pas la sortie', async () => {
    const s = setup();
    const a = await s.hosp.admit({ patientId: 'DEMO-P-002', bedId: 'bed-1-1-1', ...base });
    s.day(1);
    const v = await s.acc.postRoomDays({ admissionId: a.id, forDischarge: true });
    await s.pay(v.invoices[0]!.invoice.id, v.invoices[0]!.balances.patientBalance);
    const out = await s.acc.discharge({ admissionId: a.id, outcome: 'normal', note: '' });
    expect(out.admission.status).toBe('discharged');
    expect(out.totals.organizationsOutstanding).toBeGreaterThan(0);
  });

  it('sortie le jour même de l’admission : un jour minimum facturé', async () => {
    const s = setup();
    const a = await s.hosp.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    const v = await s.acc.postRoomDays({ admissionId: a.id, forDischarge: true });
    expect(v.totals.billable).toBe(4000);
  });

  it('refuse une admission déjà sortie, et l’annulation d’une admission avec jours facturés', async () => {
    const s = setup();
    const a = await s.hosp.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    s.day(1);
    const v = await s.acc.postRoomDays({ admissionId: a.id, forDischarge: true });
    await expect(s.hosp.cancel({ admissionId: a.id, reason: 'x' })).rejects.toThrow('hospital.hasBilledDays');
    await s.pay(v.invoices[0]!.invoice.id, 4000);
    await s.acc.discharge({ admissionId: a.id, outcome: 'normal', note: '' });
    await expect(s.acc.discharge({ admissionId: a.id, outcome: 'normal', note: '' })).rejects.toThrow('hospital.notActive');
    await expect(s.acc.postRoomDays({ admissionId: a.id })).rejects.toThrow('hospital.notActive');
    await expect(s.hosp.transfer({ admissionId: a.id, bedId: 'bed-1-1-2', reason: 'x' })).rejects.toThrow('hospital.notActive');
  });

  it('après la sortie, le lit se réutilise après nettoyage et le patient peut être réadmis', async () => {
    const s = setup();
    const a = await s.hosp.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    s.day(1);
    const v = await s.acc.postRoomDays({ admissionId: a.id, forDischarge: true });
    await s.pay(v.invoices[0]!.invoice.id, 4000);
    await s.acc.discharge({ admissionId: a.id, outcome: 'referral', note: '' });
    await s.hosp.setBedState({ bedId: 'bed-1-1-1', to: 'free', reason: '' });
    s.state.now = new Date(s.state.now.getTime() + 3600_000);
    const b = await s.hosp.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    expect(b.id).not.toBe(a.id);
    // les jours de la première admission ne sont pas refacturés sur la seconde
    expect((await s.acc.account(b.id)).invoices).toHaveLength(0);
  });

  it('permissions dans le service', async () => {
    const s = setup(['health.discharges.validate']);
    const a = await s.hosp.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    s.day(1);
    await expect(s.acc.postRoomDays({ admissionId: a.id })).rejects.toThrow('forbidden');
    await expect(s.acc.discharge({ admissionId: a.id, outcome: 'normal', note: '' })).rejects.toThrow('forbidden');
  });
});
