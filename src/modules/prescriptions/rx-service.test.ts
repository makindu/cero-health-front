import { describe, expect, it } from 'vitest';
import type { LocalContext } from '@/core/local/context';
import { createMemoryDatabase } from '@/core/local/memory-database';
import { runUnit } from '@/core/local/unit-of-work';
import type { FinanceDeps } from '../finance/finance-service';
import * as R from './rx-rules';
import { createRxService } from './rx-service';

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
  return { rx: createRxService(deps), state };
}
const item = (over: Partial<R.RxItem> = {}): R.RxItem => ({ label: ' Produit A ', dosage: '1 comprimé', frequency: '2 fois par jour', duration: '', quantity: 10, instructions: '', ...over });
const code = (fn: () => unknown): string | undefined => { try { fn(); } catch (e) { return (e as R.RxError).code; } };

describe('règles des prescriptions', () => {
  it('exige au moins une ligne complète, quantité positive (2 décimales au plus)', () => {
    expect(code(() => R.checkItems([]))).toBe('itemsRequired');
    expect(code(() => R.checkItems([item({ label: ' ' })]))).toBe('labelRequired');
    expect(code(() => R.checkItems([item({ quantity: 0 })]))).toBe('quantityInvalid');
    expect(code(() => R.checkItems([item({ quantity: 1.255 })]))).toBe('quantityInvalid');
    expect(code(() => R.checkItems([item({ quantity: Number.NaN })]))).toBe('quantityInvalid');
    expect(R.checkItems([item({ quantity: 0.5 })])[0]!.quantity).toBe(0.5);
    expect(R.checkItems([item({ quantity: 2.5 })])[0]!.quantity).toBe(2.5);
    expect(code(() => R.checkItems([item({ dosage: '' })]))).toBe('posologyRequired');
    expect(code(() => R.checkItems([item({ frequency: ' ' })]))).toBe('posologyRequired');
    expect(R.checkItems([item()])[0]!.label).toBe('Produit A');
  });
  it('numérote par année', () => {
    expect(R.nextRxNumber([], 2026)).toBe('RX-2026-00001');
    expect(R.nextRxNumber([{ number: 'RX-2026-00009' }], 2026)).toBe('RX-2026-00010');
  });
});

describe('prescriptions locales', () => {
  it('crée une prescription à valider, rattachée au patient et à la consultation', async () => {
    const { rx } = setup();
    const r = await rx.create({ patientId: 'DEMO-P-001', items: [item()], note: '', consultationId: ' C1 ' });
    expect(r.status).toBe('toValidate');
    expect(r.number).toBe('RX-2026-00001');
    expect(r.consultationId).toBe('C1');
    expect(r.prescriber).toBe('Agent démo');
    expect(await rx.list()).toHaveLength(1);
  });
  it('refuse patient inconnu / fusionné, et une ligne invalide sans rien enregistrer', async () => {
    const { rx } = setup();
    await expect(rx.create({ patientId: 'Z', items: [item()], note: '' })).rejects.toThrow('rx.patientNotFound');
    await expect(rx.create({ patientId: 'MERGED', items: [item()], note: '' })).rejects.toThrow('rx.patientMerged');
    await expect(rx.create({ patientId: 'DEMO-P-001', items: [item({ dosage: '' })], note: '' })).rejects.toThrow('rx.posologyRequired');
    expect(await rx.list()).toHaveLength(0);
  });
  it('valide une fois ; annule avec motif ; pas de double annulation', async () => {
    const { rx } = setup();
    const r = await rx.create({ patientId: 'DEMO-P-001', items: [item()], note: '' });
    expect((await rx.validate({ id: r.id })).validation?.by).toBe('Agent démo');
    await expect(rx.validate({ id: r.id })).rejects.toThrow('rx.wrongStatus');
    await expect(rx.cancel({ id: r.id, reason: ' ' })).rejects.toThrow('rx.reasonRequired');
    expect((await rx.cancel({ id: r.id, reason: 'erreur' })).status).toBe('cancelled');
    await expect(rx.cancel({ id: r.id, reason: 'x' })).rejects.toThrow('rx.alreadyCancelled');
    await expect(rx.validate({ id: r.id })).rejects.toThrow('rx.wrongStatus');
  });
  it('permissions appliquées dans le service', async () => {
    const a = setup(['health.prescriptions.create']);
    await expect(a.rx.create({ patientId: 'DEMO-P-001', items: [item()], note: '' })).rejects.toThrow('forbidden');
    const b = setup(['health.prescriptions.validate']);
    const r = await b.rx.create({ patientId: 'DEMO-P-001', items: [item()], note: '' });
    await expect(b.rx.validate({ id: r.id })).rejects.toThrow('forbidden');
  });
  it('isolation multi-établissements', async () => {
    const { rx, state } = setup();
    await rx.create({ patientId: 'DEMO-P-001', items: [item()], note: '' });
    state.facility = 'F2';
    expect(await rx.list()).toHaveLength(0);
  });
});
