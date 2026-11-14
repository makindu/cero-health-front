import { ApiError } from '@/core/api/types';
import type { Envelope, LocalDatabase, Tx } from './database';
import type { LocalContext } from './context';

/**
 * Contrat de repository. Une implémentation API (CERO HEALTH) pourra remplacer l'implémentation locale sans toucher
 * aux pages ni aux règles métier : seule la fabrique de repositories change.
 */
export interface Repository<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  /** Échoue en « conflict » si l'identifiant existe déjà (anti double création). */
  insert(row: T, options?: WriteOptions): Promise<T>;
  /** Applique `change` et incrémente la version. `expectedVersion` refuse une écriture sur une version périmée. */
  update(id: string, change: (row: T) => T, options?: UpdateOptions): Promise<T>;
}

export interface WriteOptions {
  action?: string;
  reason?: string;
}
export interface UpdateOptions extends WriteOptions {
  expectedVersion?: number;
}

const error = (kind: 'conflict' | 'not_found', message: string) => new ApiError(kind, message, { source: 'health', status: kind === 'conflict' ? 409 : 404 });

/** Écrit l'enveloppe ET l'entrée d'audit dans la MÊME transaction. */
export async function writeRecord<T extends { id: string }>(
  tx: Tx,
  collection: string,
  ctx: LocalContext,
  row: T,
  previous: Envelope | undefined,
  options: WriteOptions & { action: string },
  now: string,
): Promise<Envelope<T>> {
  const envelope: Envelope<T> = {
    collection,
    facilityId: ctx.facilityId,
    id: row.id,
    data: row,
    version: (previous?.version ?? 0) + 1,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    createdBy: previous?.createdBy ?? ctx.actor.id,
    updatedBy: ctx.actor.id,
  };
  await tx.putRecord(envelope);
  await tx.appendAudit({
    at: now,
    facilityId: ctx.facilityId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    action: options.action,
    collection,
    recordId: row.id,
    before: previous?.data,
    after: row,
    reason: options.reason,
  });
  return envelope;
}

export interface LocalRepositoryOptions<T> {
  db: () => Promise<LocalDatabase>;
  collection: string;
  context: () => LocalContext;
  /** Jeu FICTIF copié une seule fois par établissement à la première lecture. */
  seed?: readonly T[];
  now?: () => Date;
}

/** Nom de collection locale dérivé d'un endpoint de contrat (« /health/patients » → « health-patients »). */
export const collectionNameFor = (endpoint: string): string => endpoint.replace(/^\/+|\/+$/g, '').replace(/\//g, '-');

export function seedMarker(collection: string, facilityId: string): string {
  return `seeded:${collection}:${facilityId}`;
}

/** Copie un jeu FICTIF dans l'établissement actif, une seule fois (marqueur écrit dans la même transaction). */
export async function seedCollection<T extends { id: string }>(tx: Tx, collection: string, ctx: LocalContext, seed: readonly T[] | undefined, now: string): Promise<void> {
  if (!seed || seed.length === 0) return;
  const marker = seedMarker(collection, ctx.facilityId);
  if (await tx.getMeta(marker)) return;
  for (const row of seed) {
    await tx.putRecord({
      collection, facilityId: ctx.facilityId, id: row.id, data: structuredClone(row), version: 1,
      createdAt: now, updatedAt: now, createdBy: 'seed', updatedBy: 'seed',
    });
  }
  await tx.putMeta(marker, now);
}

export function createLocalRepository<T extends { id: string }>(options: LocalRepositoryOptions<T>): Repository<T> {
  const { collection, context, seed } = options;
  const clock = () => (options.now ? options.now() : new Date()).toISOString();

  const ensureSeeded = (tx: Tx, ctx: LocalContext) => seedCollection(tx, collection, ctx, seed, clock());

  return {
    async list() {
      const db = await options.db();
      const ctx = context();
      // Le semis écrit : il se fait donc en transaction « readwrite », puis la lecture suit.
      return db.run('readwrite', async (tx) => {
        await ensureSeeded(tx, ctx);
        return (await tx.listRecords(collection, ctx.facilityId)).map((e) => e.data as T);
      });
    },
    async get(id) {
      const db = await options.db();
      const ctx = context();
      return db.run('readwrite', async (tx) => {
        await ensureSeeded(tx, ctx);
        return (await tx.getRecord(collection, ctx.facilityId, id))?.data as T | undefined;
      });
    },
    async insert(row, writeOptions) {
      const db = await options.db();
      const ctx = context();
      return db.run('readwrite', async (tx) => {
        await ensureSeeded(tx, ctx);
        if (await tx.getRecord(collection, ctx.facilityId, row.id)) throw error('conflict', `${collection}/${row.id} existe déjà`);
        await writeRecord(tx, collection, ctx, row, undefined, { action: writeOptions?.action ?? 'create', reason: writeOptions?.reason }, clock());
        return row;
      });
    },
    async update(id, change, updateOptions) {
      const db = await options.db();
      const ctx = context();
      return db.run('readwrite', async (tx) => {
        await ensureSeeded(tx, ctx);
        const previous = await tx.getRecord(collection, ctx.facilityId, id);
        if (!previous) throw error('not_found', `${collection}/${id} introuvable`);
        if (updateOptions?.expectedVersion !== undefined && updateOptions.expectedVersion !== previous.version) {
          throw error('conflict', `${collection}/${id} a été modifié entre-temps`);
        }
        const next = change(structuredClone(previous.data as T));
        if (next.id !== id) throw new Error("L'identifiant d'une ligne ne peut pas changer");
        await writeRecord(tx, collection, ctx, next, previous, { action: updateOptions?.action ?? 'update', reason: updateOptions?.reason }, clock());
        return next;
      });
    },
  };
}
