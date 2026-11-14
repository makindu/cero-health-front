import { describe, expect, it } from 'vitest';
import type { LocalContext } from './context';
import { createMemoryDatabase } from './memory-database';
import { defineCollection, runUnit } from './unit-of-work';

interface Row { id: string; n: number }
const A = defineCollection<Row>('a', [{ id: 'S', n: 1 }]);
const B = defineCollection<Row>('b');
const ctx: LocalContext = { facilityId: 'F1', actor: { id: 'u1', name: 'U1' } };
const setup = () => { const db = createMemoryDatabase(); return { db, run: <R,>(fn: Parameters<typeof runUnit<R>>[0]) => runUnit(fn, { db: async () => db, context: () => ctx }) }; };

describe('unité de travail', () => {
  it('écrit plusieurs collections et l’audit ensemble', async () => {
    const { db, run } = setup();
    await run(async (u) => { await u.insert(A, { id: 'x', n: 2 }); await u.insert(B, { id: 'y', n: 3 }); });
    const dump = await db.dump();
    expect(dump.records.map((r) => `${r.collection}/${r.id}`).sort()).toEqual(['a/S', 'a/x', 'b/y']);
    expect(dump.audit).toHaveLength(2);
  });
  it('annule TOUT si une étape échoue (aucune écriture partielle)', async () => {
    const { db, run } = setup();
    await expect(run(async (u) => { await u.insert(B, { id: 'y', n: 3 }); await u.insert(B, { id: 'y', n: 4 }); })).rejects.toThrow();
    const dump = await db.dump();
    expect(dump.records.filter((r) => r.collection === 'b')).toHaveLength(0);
    expect(dump.audit).toHaveLength(0);
  });
  it('met à jour, incrémente la version et refuse une ligne inconnue', async () => {
    const { db, run } = setup();
    await run(async (u) => { await u.update(A, 'S', (r) => ({ ...r, n: 9 })); });
    expect((await db.dump()).records.find((r) => r.id === 'S')?.version).toBe(2);
    await expect(run(async (u) => { await u.update(A, 'nope', (r) => r); })).rejects.toThrow();
  });
  it('sérialise deux écritures simultanées (pas de perte de mise à jour)', async () => {
    const { run } = setup();
    await run(async (u) => { await u.insert(B, { id: 'c', n: 0 }); });
    await Promise.all([1, 2, 3].map(() => run(async (u) => { await u.update(B, 'c', (r) => ({ ...r, n: r.n + 1 })); })));
    expect((await run((u) => u.get(B, 'c')))?.n).toBe(3);
  });
});
