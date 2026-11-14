import { describe, expect, it } from 'vitest';
import { createBackup, parseBackup, restoreBackup, resetLocalData, BackupError } from './backup';
import type { LocalContext } from './context';
import { createMemoryDatabase } from './memory-database';
import { createLocalRepository } from './repository';
import { migrate, SchemaTooNewError, SCHEMA_META_KEY } from './schema';

interface Row {
  id: string;
  name: string;
  bed?: string;
}
const ctxFor = (facilityId: string, actor = 'u1'): LocalContext => ({ facilityId, actor: { id: actor, name: `Utilisateur ${actor}` } });
const SEED: Row[] = [{ id: 'S1', name: 'Démo un' }, { id: 'S2', name: 'Démo deux' }];

function repo(db = createMemoryDatabase(), facility = 'F1', seed: readonly Row[] | undefined = SEED) {
  let ctx = ctxFor(facility);
  const r = createLocalRepository<Row>({ db: async () => db, collection: 'things', context: () => ctx, seed });
  return { db, r, as: (c: LocalContext) => { ctx = c; } };
}

describe('dépôt local', () => {
  it('sème le jeu fictif une seule fois par établissement', async () => {
    const { r, db } = repo();
    expect((await r.list()).map((x) => x.id).sort()).toEqual(['S1', 'S2']);
    await r.insert({ id: 'N1', name: 'Nouveau' });
    expect(await r.list()).toHaveLength(3);
    expect(await r.list()).toHaveLength(3); // pas de re-semis
    const dump = await db.dump();
    expect(dump.records).toHaveLength(3);
  });
  it('isole les établissements', async () => {
    const { r, as } = repo();
    await r.insert({ id: 'N1', name: 'Chez F1' });
    as(ctxFor('F2'));
    const ids = (await r.list()).map((x) => x.id);
    expect(ids).not.toContain('N1');
    expect(ids).toEqual(expect.arrayContaining(['S1', 'S2']));
    expect(await r.get('N1')).toBeUndefined();
  });
  it('refuse une double création et une mise à jour sur version périmée', async () => {
    const { r } = repo();
    await r.insert({ id: 'N1', name: 'A' });
    await expect(r.insert({ id: 'N1', name: 'B' })).rejects.toMatchObject({ kind: 'conflict' });
    await r.update('N1', (x) => ({ ...x, name: 'A2' }), { expectedVersion: 1 });
    await expect(r.update('N1', (x) => ({ ...x, name: 'A3' }), { expectedVersion: 1 })).rejects.toMatchObject({ kind: 'conflict' });
    await expect(r.update('ABSENT', (x) => x)).rejects.toMatchObject({ kind: 'not_found' });
    expect((await r.get('N1'))?.name).toBe('A2');
  });
  it('empêche la double occupation d’un lit quand deux écritures se suivent (verrou transactionnel)', async () => {
    const { r } = repo();
    await r.insert({ id: 'BED-1', name: 'Lit 1' });
    const assign = (patient: string) =>
      r.update('BED-1', (bed) => {
        if (bed.bed) throw Object.assign(new Error('déjà occupé'), { kind: 'conflict' });
        return { ...bed, bed: patient };
      });
    const results = await Promise.allSettled([assign('P1'), assign('P2')]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((await r.get('BED-1'))?.bed).toBe('P1');
  });
  it('journalise chaque écriture avec auteur, avant et après', async () => {
    const { r, db } = repo();
    await r.insert({ id: 'N1', name: 'A' }, { action: 'create' });
    await r.update('N1', (x) => ({ ...x, name: 'B' }), { action: 'command:rename', reason: 'correction' });
    const { audit } = await db.dump();
    expect(audit.map((a) => a.action)).toEqual(['create', 'command:rename']);
    expect(audit[1]).toMatchObject({ before: { name: 'A' }, after: { name: 'B' }, reason: 'correction', actorId: 'u1' });
  });
  it('annule entièrement une transaction qui échoue', async () => {
    const { db } = repo();
    await expect(
      db.run('readwrite', async (tx) => {
        await tx.putMeta('x', 1);
        await tx.appendAudit({ at: 'now', facilityId: 'F1', actorId: 'u', actorName: 'u', action: 'a', collection: 'c', recordId: '1' });
        throw new Error('échec au milieu');
      }),
    ).rejects.toThrow('échec au milieu');
    const dump = await db.dump();
    expect(dump.meta.find((m) => m.key === 'x')).toBeUndefined();
    expect(dump.audit).toHaveLength(0);
  });
});

describe('schéma et migrations', () => {
  it('initialise la version puis applique les migrations manquantes dans l’ordre', async () => {
    const db = createMemoryDatabase();
    expect(await migrate(db, [], 1)).toEqual({ from: 1, to: 1 });
    const log: number[] = [];
    const out = await migrate(db, [
      { to: 3, description: 'c', run: async () => { log.push(3); } },
      { to: 2, description: 'b', run: async () => { log.push(2); } },
    ], 3);
    expect(out).toEqual({ from: 1, to: 3 });
    expect(log).toEqual([2, 3]);
    expect(await db.run('readonly', (tx) => tx.getMeta(SCHEMA_META_KEY))).toBe(3);
  });
  it('refuse des données plus récentes que l’application sans rien modifier', async () => {
    const db = createMemoryDatabase();
    await db.run('readwrite', (tx) => tx.putMeta(SCHEMA_META_KEY, 9));
    await expect(migrate(db, [], 1)).rejects.toBeInstanceOf(SchemaTooNewError);
    expect(await db.run('readonly', (tx) => tx.getMeta(SCHEMA_META_KEY))).toBe(9);
  });
});

describe('sauvegarde, restauration, réinitialisation', () => {
  it('restaure à l’identique après une sauvegarde', async () => {
    const { r, db } = repo();
    await r.insert({ id: 'N1', name: 'À garder' });
    const backup = await createBackup(db, new Date('2026-01-01T00:00:00Z'));
    expect(backup.counts.records).toBe(3);
    await r.update('N1', (x) => ({ ...x, name: 'Modifié' }));
    await restoreBackup(db, JSON.stringify(backup));
    expect((await r.get('N1'))?.name).toBe('À garder');
  });
  it('rejette les fichiers invalides sans toucher aux données', async () => {
    const { r, db } = repo();
    await r.insert({ id: 'N1', name: 'Intact' });
    await expect(restoreBackup(db, 'pas du json')).rejects.toBeInstanceOf(BackupError);
    await expect(restoreBackup(db, JSON.stringify({ format: 'autre' }))).rejects.toMatchObject({ code: 'invalid_format' });
    const future = { format: 'cero-health-local-backup', formatVersion: 1, schemaVersion: 99, dump: { records: [], meta: [], audit: [] } };
    await expect(restoreBackup(db, JSON.stringify(future))).rejects.toMatchObject({ code: 'too_new' });
    expect(() => parseBackup(JSON.stringify({ ...future, schemaVersion: 1, dump: { records: [{ collection: 'c' }], meta: [], audit: [] } }))).toThrow(BackupError);
    expect((await r.get('N1'))?.name).toBe('Intact');
  });
  it('réinitialise le jeu de démonstration (le semis repart)', async () => {
    const { r, db } = repo();
    await r.insert({ id: 'N1', name: 'Sera effacé' });
    await resetLocalData(db);
    const ids = (await r.list()).map((x) => x.id).sort();
    expect(ids).toEqual(['S1', 'S2']);
  });
});
