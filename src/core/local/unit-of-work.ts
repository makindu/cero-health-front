import { ApiError } from '@/core/api/types';
import type { LocalContext } from './context';
import type { LocalDatabase, Tx } from './database';
import { getLocalDatabase } from './open';
import { seedCollection, writeRecord, type WriteOptions } from './repository';

/**
 * Unité de travail : plusieurs collections lues et écrites dans UNE SEULE transaction atomique.
 * Tout ou rien — facture + paiement + validité + audit s'enregistrent ensemble ou pas du tout.
 * Les verrous d'écriture sont sérialisés par la base : deux soumissions simultanées ne peuvent pas se croiser.
 * À l'intérieur de `fn`, n'attendre (await) que les méthodes de l'unité.
 */
export interface CollectionRef<T extends { id: string }> {
  readonly name: string;
  readonly seed?: readonly T[];
}

export const defineCollection = <T extends { id: string }>(name: string, seed?: readonly T[]): CollectionRef<T> => ({ name, seed });

export interface Unit {
  readonly ctx: LocalContext;
  readonly now: Date;
  list<T extends { id: string }>(ref: CollectionRef<T>): Promise<T[]>;
  get<T extends { id: string }>(ref: CollectionRef<T>, id: string): Promise<T | undefined>;
  insert<T extends { id: string }>(ref: CollectionRef<T>, row: T, options?: WriteOptions): Promise<T>;
  update<T extends { id: string }>(ref: CollectionRef<T>, id: string, change: (row: T) => T, options?: WriteOptions): Promise<T>;
  /** Insère ou remplace (documents de configuration uniques). */
  put<T extends { id: string }>(ref: CollectionRef<T>, row: T, options?: WriteOptions): Promise<T>;
}

const err = (kind: 'conflict' | 'not_found', message: string) => new ApiError(kind, message, { source: 'health', status: kind === 'conflict' ? 409 : 404 });

export async function runUnit<R>(fn: (unit: Unit) => Promise<R>, options: { db?: () => Promise<LocalDatabase>; now?: () => Date; context?: () => LocalContext } = {}): Promise<R> {
  const db = await (options.db ?? getLocalDatabase)();
  const ctx = options.context ? options.context() : (await import('./context')).getLocalContext();
  const now = options.now ? options.now() : new Date();
  const iso = now.toISOString();
  return db.run('readwrite', async (tx: Tx) => {
    const seeded = new Set<string>();
    const ready = async <T extends { id: string }>(ref: CollectionRef<T>) => {
      if (seeded.has(ref.name)) return;
      seeded.add(ref.name);
      await seedCollection(tx, ref.name, ctx, ref.seed, iso);
    };
    const unit: Unit = {
      ctx,
      now,
      async list(ref) {
        await ready(ref);
        return (await tx.listRecords(ref.name, ctx.facilityId)).map((e) => e.data as never);
      },
      async get(ref, id) {
        await ready(ref);
        return (await tx.getRecord(ref.name, ctx.facilityId, id))?.data as never;
      },
      async insert(ref, row, o) {
        await ready(ref);
        if (await tx.getRecord(ref.name, ctx.facilityId, row.id)) throw err('conflict', `${ref.name}/${row.id} existe déjà`);
        await writeRecord(tx, ref.name, ctx, row, undefined, { action: o?.action ?? 'create', reason: o?.reason }, iso);
        return row;
      },
      async update(ref, id, change, o) {
        await ready(ref);
        const previous = await tx.getRecord(ref.name, ctx.facilityId, id);
        if (!previous) throw err('not_found', `${ref.name}/${id} introuvable`);
        const next = change(structuredClone(previous.data as never));
        if ((next as { id: string }).id !== id) throw new Error("L'identifiant d'une ligne ne peut pas changer");
        await writeRecord(tx, ref.name, ctx, next, previous, { action: o?.action ?? 'update', reason: o?.reason }, iso);
        return next;
      },
      async put(ref, row, o) {
        await ready(ref);
        const previous = await tx.getRecord(ref.name, ctx.facilityId, row.id);
        await writeRecord(tx, ref.name, ctx, row, previous, { action: o?.action ?? (previous ? 'update' : 'create'), reason: o?.reason }, iso);
        return row;
      },
    };
    return fn(unit);
  });
}
