import type { LocalDatabase, Tx } from './database';

/**
 * Version de la FORME des données locales. À incrémenter quand la structure d'une entité change :
 * ajouter alors une migration (jamais de modification d'une migration déjà livrée).
 */
export const SCHEMA_VERSION = 1;
export const SCHEMA_META_KEY = 'schemaVersion';

export interface Migration {
  /** Version atteinte après cette migration. */
  to: number;
  description: string;
  run(tx: Tx): Promise<void>;
}

/** Aucune migration à ce jour (version 1 = première version du schéma local). */
export const MIGRATIONS: readonly Migration[] = [];

export class SchemaTooNewError extends Error {
  constructor(readonly found: number, readonly supported: number) {
    super(`Les données locales sont en version ${found}, cette application gère jusqu'à la version ${supported}.`);
    this.name = 'SchemaTooNewError';
  }
}

/**
 * Applique, dans UNE transaction, les migrations manquantes. Refuse (sans rien modifier) des données plus récentes que l'application.
 */
export async function migrate(
  db: LocalDatabase,
  migrations: readonly Migration[] = MIGRATIONS,
  target: number = SCHEMA_VERSION,
): Promise<{ from: number; to: number }> {
  return db.run('readwrite', async (tx) => {
    const stored = await tx.getMeta<number>(SCHEMA_META_KEY);
    const from = stored ?? target;
    if (from > target) throw new SchemaTooNewError(from, target);
    let current = from;
    for (const migration of [...migrations].sort((a, b) => a.to - b.to)) {
      if (migration.to > current && migration.to <= target) {
        await migration.run(tx);
        current = migration.to;
      }
    }
    await tx.putMeta(SCHEMA_META_KEY, target);
    return { from, to: target };
  });
}
