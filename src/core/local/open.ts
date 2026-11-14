import type { LocalDatabase } from './database';
import { createIndexedDbDatabase } from './indexeddb-database';
import { createMemoryDatabase } from './memory-database';
import { migrate } from './schema';

let opening: Promise<LocalDatabase> | null = null;
let fallbackReason: string | null = null;

/** Raison d'un repli en mémoire (données NON conservées), ou null si IndexedDB est utilisé. */
export const getStorageFallbackReason = (): string | null => fallbackReason;

/** Ouvre (une seule fois) la base locale : IndexedDB si disponible, sinon mémoire — et le dit. Applique les migrations. */
export function getLocalDatabase(): Promise<LocalDatabase> {
  opening ??= (async () => {
    let db: LocalDatabase;
    try {
      if (typeof indexedDB === 'undefined') throw new Error('IndexedDB indisponible');
      db = await createIndexedDbDatabase();
    } catch (error) {
      fallbackReason = error instanceof Error ? error.message : 'IndexedDB indisponible';
      db = createMemoryDatabase();
    }
    await migrate(db);
    return db;
  })();
  opening.catch(() => {
    opening = null;
  });
  return opening;
}

/** Tests : injecte une base. */
export function setLocalDatabaseForTests(db: LocalDatabase | null): void {
  opening = db ? Promise.resolve(db) : null;
  fallbackReason = null;
}
