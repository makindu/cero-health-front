import { describe, expect, it } from 'vitest';
import type { LocalContext } from '@/core/local/context';
import { createMemoryDatabase } from '@/core/local/memory-database';
import { runUnit } from '@/core/local/unit-of-work';
import type { FinanceDeps } from '../finance/finance-service';
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
    patient: async (_u, id) => (id === 'MERGED' ? { id, fullName: 'X', mergedInto: 'Y' } : id.startsWith('DEMO-P-') ? { id, fullName: `Patient ${id}` } : undefined),
    newId: (p) => `${p}-${++state.n}`,
    day: civil,
  };
  const svc = createHospitalService(deps);
  const ok = async () => { const b = await svc.board(); expect(R.findViolations(b.beds.map((x) => x.bed), b.admissions)).toEqual([]); return b; };
  return { svc, state, ok };
}
const base = { reason: 'surveillance', attending: 'Dr démo' };
const code = (fn: () => unknown): string | undefined => { try { fn(); } catch (e) { return (e as R.HospitalError).code; } };

describe('règles', () => {
  it('lit libéré → nettoyage, jamais directement libre', () => {
    expect(R.release({ id: 'b', roomId: 'r', label: 'x', status: 'occupied', admissionId: 'a' })).toMatchObject({ status: 'cleaning', admissionId: undefined });
  });
  it('états manuels : pas sur un lit occupé, maintenance avec motif', () => {
    const b: R.Bed = { id: 'b', roomId: 'r', label: 'x', status: 'free' };
    expect(code(() => R.setBedState({ ...b, status: 'occupied', admissionId: 'a' }, 'maintenance', 'x'))).toBe('bedOccupied');
    expect(code(() => R.setBedState(b, 'maintenance', ' '))).toBe('reasonRequired');
    expect(code(() => R.setBedState(b, 'free', ''))).toBe('wrongStatus');
    expect(R.setBedState({ ...b, status: 'cleaning' }, 'free', '').status).toBe('free');
  });
  it('findViolations détecte une double occupation', () => {
    const beds: R.Bed[] = [{ id: 'b1', roomId: 'r', label: 'a', status: 'occupied', admissionId: 'a1' }];
    const mk = (id: string, p: string): R.Admission => ({ id, number: id, patientId: p, patientName: p, ward: 'surgery', status: 'admitted', admittedAt: 'x', admittedBy: 'x', attending: 'x', reason: 'x', stays: [{ bedId: 'b1', roomId: 'r', from: 'x', by: 'x' }] });
    expect(R.findViolations(beds, [mk('a1', 'p1'), mk('a2', 'p2')]).length).toBeGreaterThan(0);
  });
});

describe('hospitalisation locale', () => {
  it('amorce 4 services, 8 chambres, 16 lits tous libres', async () => {
    const { svc } = setup();
    const b = await svc.board();
    expect(b.beds).toHaveLength(16);
    expect(b.beds.every((x) => x.bed.status === 'free')).toBe(true);
    expect(new Set(b.beds.map((x) => x.room.id)).size).toBe(8);
  });

  it('admet un patient : lit occupé, séjour ouvert, numéro HOS-AAAA-NNNNN', async () => {
    const { svc, ok } = setup();
    const a = await svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    expect(a.number).toBe('HOS-2026-00001');
    expect(a.ward).toBe('generalMedicine');
    const b = await ok();
    expect(b.beds.find((x) => x.bed.id === 'bed-1-1-1')!.bed).toMatchObject({ status: 'occupied', admissionId: a.id });
  });

  it('refuse un lit occupé, en nettoyage ou en maintenance', async () => {
    const { svc, ok } = setup();
    await svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    await expect(svc.admit({ patientId: 'DEMO-P-002', bedId: 'bed-1-1-1', ...base })).rejects.toThrow('hospital.bedNotFree');
    await svc.setBedState({ bedId: 'bed-1-1-2', to: 'maintenance', reason: 'fuite' });
    await expect(svc.admit({ patientId: 'DEMO-P-002', bedId: 'bed-1-1-2', ...base })).rejects.toThrow('hospital.bedNotFree');
    await ok();
  });

  it('deux admissions simultanées sur le même lit : une seule réussit', async () => {
    const { svc, ok } = setup();
    const res = await Promise.allSettled([
      svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-2-1-1', ...base }),
      svc.admit({ patientId: 'DEMO-P-002', bedId: 'bed-2-1-1', ...base }),
    ]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(res.filter((r) => r.status === 'rejected')).toHaveLength(1);
    await ok();
  });

  it('un patient ne peut avoir qu’une admission active (même sur deux lits différents, même en simultané)', async () => {
    const { svc, ok } = setup();
    const res = await Promise.allSettled([
      svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base }),
      svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-3-1-1', ...base }),
    ]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await ok();
    await expect(svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-4-1-1', ...base })).rejects.toThrow('hospital.alreadyAdmitted');
  });

  it('valide les saisies : motif, médecin, date de sortie passée, patient inconnu ou fusionné, lit inconnu', async () => {
    const { svc, ok } = setup();
    await expect(svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', reason: ' ', attending: 'x' })).rejects.toThrow('hospital.reasonRequired');
    await expect(svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', reason: 'x', attending: ' ' })).rejects.toThrow('hospital.attendingRequired');
    await expect(svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base, expectedDischarge: '2026-11-01' })).rejects.toThrow('hospital.dischargeInPast');
    await expect(svc.admit({ patientId: 'Z', bedId: 'bed-1-1-1', ...base })).rejects.toThrow('hospital.patientNotFound');
    await expect(svc.admit({ patientId: 'MERGED', bedId: 'bed-1-1-1', ...base })).rejects.toThrow('hospital.patientMerged');
    await expect(svc.admit({ patientId: 'DEMO-P-001', bedId: 'nope', ...base })).rejects.toThrow('hospital.bedNotFound');
    expect((await ok()).admissions).toHaveLength(0);
  });

  it('transfert : ancien lit en nettoyage, nouveau occupé, historique conservé, motif obligatoire', async () => {
    const { svc, ok } = setup();
    const a = await svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    await expect(svc.transfer({ admissionId: a.id, bedId: 'bed-1-2-1', reason: ' ' })).rejects.toThrow('hospital.reasonRequired');
    await expect(svc.transfer({ admissionId: a.id, bedId: 'bed-1-1-1', reason: 'x' })).rejects.toThrow('hospital.sameBed');
    const t = await svc.transfer({ admissionId: a.id, bedId: 'bed-1-2-1', reason: 'chambre privée demandée' });
    expect(t.stays).toHaveLength(2);
    expect(t.stays[0]!.to).toBeDefined();
    const b = await ok();
    expect(b.beds.find((x) => x.bed.id === 'bed-1-1-1')!.bed.status).toBe('cleaning');
    expect(b.beds.find((x) => x.bed.id === 'bed-1-2-1')!.bed).toMatchObject({ status: 'occupied', admissionId: a.id });
  });

  it('transfert vers un lit occupé refusé sans effet de bord', async () => {
    const { svc, ok } = setup();
    const a = await svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    await svc.admit({ patientId: 'DEMO-P-002', bedId: 'bed-1-1-2', ...base });
    await expect(svc.transfer({ admissionId: a.id, bedId: 'bed-1-1-2', reason: 'x' })).rejects.toThrow('hospital.bedNotFree');
    await ok();
  });

  it('un lit nettoyé redevient libre puis réutilisable ; un lit occupé ne se modifie pas à la main', async () => {
    const { svc, ok } = setup();
    const a = await svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    await expect(svc.setBedState({ bedId: 'bed-1-1-1', to: 'free', reason: '' })).rejects.toThrow('hospital.bedOccupied');
    await svc.cancel({ admissionId: a.id, reason: 'erreur de saisie' });
    await expect(svc.admit({ patientId: 'DEMO-P-002', bedId: 'bed-1-1-1', ...base })).rejects.toThrow('hospital.bedNotFree'); // en nettoyage
    await svc.setBedState({ bedId: 'bed-1-1-1', to: 'free', reason: '' });
    await svc.admit({ patientId: 'DEMO-P-002', bedId: 'bed-1-1-1', ...base });
    await ok();
  });

  it('annulation : motif obligatoire, séjour fermé, patient de nouveau admissible', async () => {
    const { svc, ok } = setup();
    const a = await svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    await expect(svc.cancel({ admissionId: a.id, reason: ' ' })).rejects.toThrow('hospital.reasonRequired');
    const c = await svc.cancel({ admissionId: a.id, reason: 'doublon' });
    expect(c.status).toBe('cancelled');
    expect(c.stays.every((s) => s.to)).toBe(true);
    await expect(svc.cancel({ admissionId: a.id, reason: 'x' })).rejects.toThrow('hospital.notActive');
    await svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-2-1-1', ...base });
    await ok();
  });

  it('demande de sortie : le lit reste occupé ; révocable ; pas de transfert interdit', async () => {
    const { svc, ok } = setup();
    const a = await svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    const d = await svc.requestDischarge({ admissionId: a.id, note: 'stable' });
    expect(d.status).toBe('dischargePending');
    await expect(svc.requestDischarge({ admissionId: a.id, note: '' })).rejects.toThrow('hospital.wrongStatus');
    expect((await ok()).beds.find((x) => x.bed.id === 'bed-1-1-1')!.bed.status).toBe('occupied');
    expect((await svc.revokeDischarge({ admissionId: a.id })).status).toBe('admitted');
  });

  it('permissions appliquées dans le service', async () => {
    const a = setup(['health.admissions.create']);
    await expect(a.svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base })).rejects.toThrow('forbidden');
    const b = setup(['health.beds.assign']);
    await expect(b.svc.setBedState({ bedId: 'bed-1-1-1', to: 'maintenance', reason: 'x' })).rejects.toThrow('forbidden');
    const c = setup(['health.discharges.validate']);
    const adm = await c.svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    await expect(c.svc.requestDischarge({ admissionId: adm.id, note: '' })).rejects.toThrow('forbidden');
  });

  it('isolation multi-établissements : les lits et admissions d’un site ne sont pas ceux d’un autre', async () => {
    const { svc, state } = setup();
    await svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base });
    state.facility = 'F2';
    const b = await svc.board();
    expect(b.admissions).toHaveLength(0);
    expect(b.beds.every((x) => x.bed.status === 'free')).toBe(true);
    await svc.admit({ patientId: 'DEMO-P-001', bedId: 'bed-1-1-1', ...base }); // même patient, autre site : autorisé
  });
});
