import type { AuditEntry, DatabaseDump, Envelope, LocalDatabase, MetaEntry, Tx } from './database';

/** Version du schéma IndexedDB (tables/index). Les évolutions de FORME des données utilisent schema.ts (migrations). */
export const IDB_NAME = 'cero-health-local';
export const IDB_VERSION = 1;
const RECORDS = 'records';
const META = 'meta';
const AUDIT = 'audit';

/** L'identifiant d'audit est attribué par IndexedDB (autoIncrement). */
function withoutId(entry: AuditEntry): Omit<AuditEntry, 'id'> {
  const copy = { ...entry };
  delete copy.id;
  return copy;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Erreur IndexedDB'));
  });
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = factory.open(IDB_NAME, IDB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(RECORDS)) {
        const store = db.createObjectStore(RECORDS, { keyPath: ['collection', 'facilityId', 'id'] });
        store.createIndex('byCollectionFacility', ['collection', 'facilityId']);
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(AUDIT)) {
        const audit = db.createObjectStore(AUDIT, { keyPath: 'id', autoIncrement: true });
        audit.createIndex('byFacility', 'facilityId');
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error('Ouverture IndexedDB impossible'));
    open.onblocked = () => reject(new Error('IndexedDB bloqué par un autre onglet'));
  });
}

/** Implémentation IndexedDB (sans dépendance). Dans `run`, n'attendre que les opérations de `Tx` (sinon la transaction se ferme). */
export async function createIndexedDbDatabase(factory: IDBFactory = indexedDB): Promise<LocalDatabase> {
  const db = await openDatabase(factory);
  let queue: Promise<unknown> = Promise.resolve();

  const makeTx = (t: IDBTransaction): Tx => ({
    async getRecord(collection, facilityId, id) {
      return (await request(t.objectStore(RECORDS).get([collection, facilityId, id]))) as Envelope | undefined;
    },
    async listRecords(collection, facilityId) {
      return (await request(t.objectStore(RECORDS).index('byCollectionFacility').getAll([collection, facilityId]))) as Envelope[];
    },
    async putRecord(envelope) {
      await request(t.objectStore(RECORDS).put(envelope));
    },
    async getMeta<T>(key: string) {
      const row = (await request(t.objectStore(META).get(key))) as MetaEntry | undefined;
      return row?.value as T | undefined;
    },
    async putMeta(key, value) {
      await request(t.objectStore(META).put({ key, value }));
    },
    async appendAudit(entry) {
      await request(t.objectStore(AUDIT).add(withoutId(entry)));
    },
  });

  async function runTransaction<R>(mode: 'readonly' | 'readwrite', fn: (tx: Tx) => Promise<R>): Promise<R> {
    const t = db.transaction([RECORDS, META, AUDIT], mode);
    const done = new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error ?? new Error('Transaction IndexedDB en erreur'));
      t.onabort = () => reject(t.error ?? new Error('Transaction IndexedDB annulée'));
    });
    done.catch(() => undefined);
    let result: R;
    try {
      result = await fn(makeTx(t));
    } catch (error) {
      // Annulation : aucune écriture partielle n'est conservée.
      try {
        t.abort();
      } catch {
        /* déjà terminée */
      }
      await done.catch(() => undefined);
      throw error;
    }
    await done;
    return result;
  }

  return {
    kind: 'indexeddb',
    persistent: true,
    run<R>(mode: 'readonly' | 'readwrite', fn: (tx: Tx) => Promise<R>): Promise<R> {
      if (mode === 'readonly') return runTransaction(mode, fn);
      const task = queue.then(() => runTransaction(mode, fn));
      queue = task.catch(() => undefined);
      return task;
    },
    async dump(): Promise<DatabaseDump> {
      const t = db.transaction([RECORDS, META, AUDIT], 'readonly');
      const [records, meta, audit] = await Promise.all([
        request(t.objectStore(RECORDS).getAll()),
        request(t.objectStore(META).getAll()),
        request(t.objectStore(AUDIT).getAll()),
      ]);
      return { records: records as Envelope[], meta: meta as MetaEntry[], audit: audit as AuditEntry[] };
    },
    async replaceAll(dump) {
      await queue;
      // Toutes les écritures partagent la même transaction : tout ou rien.
      const t = db.transaction([RECORDS, META, AUDIT], 'readwrite');
      const done = new Promise<void>((resolve, reject) => {
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error ?? new Error('Restauration en erreur'));
        t.onabort = () => reject(t.error ?? new Error('Restauration annulée'));
      });
      t.objectStore(RECORDS).clear();
      t.objectStore(META).clear();
      t.objectStore(AUDIT).clear();
      for (const r of dump.records) t.objectStore(RECORDS).put(r);
      for (const m of dump.meta) t.objectStore(META).put(m);
      for (const a of dump.audit) {
        t.objectStore(AUDIT).add(withoutId(a));
      }
      await done;
    },
    async deleteAll() {
      await queue;
      const t = db.transaction([RECORDS, META, AUDIT], 'readwrite');
      const done = new Promise<void>((resolve, reject) => {
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      });
      t.objectStore(RECORDS).clear();
      t.objectStore(META).clear();
      t.objectStore(AUDIT).clear();
      await done;
    },
    close() {
      db.close();
    },
  };
}
