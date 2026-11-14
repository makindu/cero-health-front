import type { AuditEntry, DatabaseDump, Envelope, LocalDatabase, MetaEntry, Tx } from './database';

const keyOf = (collection: string, facilityId: string, id: string) => `${collection}\u0000${facilityId}\u0000${id}`;

/** Base en mémoire : mêmes garanties que IndexedDB (atomicité, sérialisation), sans persistance. Sert aux tests et de repli. */
export function createMemoryDatabase(): LocalDatabase {
  let records = new Map<string, Envelope>();
  let meta = new Map<string, unknown>();
  let audit: AuditEntry[] = [];
  let queue: Promise<unknown> = Promise.resolve();

  const makeTx = (writable: boolean): Tx => ({
    async getRecord(collection, facilityId, id) {
      const found = records.get(keyOf(collection, facilityId, id));
      return found ? structuredClone(found) : undefined;
    },
    async listRecords(collection, facilityId) {
      return [...records.values()].filter((r) => r.collection === collection && r.facilityId === facilityId).map((r) => structuredClone(r));
    },
    async putRecord(envelope) {
      if (!writable) throw new Error('Transaction en lecture seule');
      records.set(keyOf(envelope.collection, envelope.facilityId, envelope.id), structuredClone(envelope));
    },
    async getMeta<T>(key: string) {
      return meta.has(key) ? (structuredClone(meta.get(key)) as T) : undefined;
    },
    async putMeta(key, value) {
      if (!writable) throw new Error('Transaction en lecture seule');
      meta.set(key, structuredClone(value));
    },
    async appendAudit(entry) {
      if (!writable) throw new Error('Transaction en lecture seule');
      audit.push({ ...structuredClone(entry), id: audit.length + 1 });
    },
  });

  return {
    kind: 'memory',
    persistent: false,
    run<R>(mode: 'readonly' | 'readwrite', fn: (tx: Tx) => Promise<R>): Promise<R> {
      const task = queue.then(async () => {
        if (mode === 'readonly') return fn(makeTx(false));
        const snapshot = { records: new Map(records), meta: new Map(meta), audit: [...audit] };
        try {
          return await fn(makeTx(true));
        } catch (error) {
          // Retour arrière complet : l'opération échouée ne laisse aucune trace partielle.
          records = snapshot.records;
          meta = snapshot.meta;
          audit = snapshot.audit;
          throw error;
        }
      });
      queue = task.catch(() => undefined);
      return task;
    },
    async dump(): Promise<DatabaseDump> {
      return {
        records: [...records.values()].map((r) => structuredClone(r)),
        meta: [...meta.entries()].map(([key, value]): MetaEntry => ({ key, value: structuredClone(value) })),
        audit: audit.map((a) => structuredClone(a)),
      };
    },
    async replaceAll(dump) {
      await queue;
      records = new Map(dump.records.map((r) => [keyOf(r.collection, r.facilityId, r.id), structuredClone(r)]));
      meta = new Map(dump.meta.map((m) => [m.key, structuredClone(m.value)]));
      audit = dump.audit.map((a, i) => ({ ...structuredClone(a), id: i + 1 }));
    },
    async deleteAll() {
      await queue;
      records = new Map();
      meta = new Map();
      audit = [];
    },
    close() {},
  };
}
