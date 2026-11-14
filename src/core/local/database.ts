/**
 * Couche de stockage local (mode local) — contrat commun à IndexedDB (navigateur) et à la base en mémoire (tests, repli).
 *
 * ⚠ Persistance locale ≠ sauvegarde sécurisée côté serveur : ces données ne vivent que sur CET appareil.
 *
 * Modèle : une seule table d'enregistrements « enveloppes » {collection, facilityId, id}. Ajouter une entité
 * n'exige donc AUCUN changement de schéma IndexedDB ; seules les évolutions de FORME des données passent par une migration.
 * Toutes les données sont rattachées à un établissement (facilityId) : aucune lecture ne mélange deux établissements.
 */

export interface Envelope<T = unknown> {
  collection: string;
  facilityId: string;
  id: string;
  data: T;
  /** Compteur de version (contrôle de concurrence optimiste, anti double soumission). */
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

/** Journal d'audit local : ajout seul, jamais modifié ni supprimé par l'application. */
export interface AuditEntry {
  id?: number;
  at: string;
  facilityId: string;
  actorId: string;
  actorName: string;
  /** Ex. « create », « update », « command:cancel ». */
  action: string;
  collection: string;
  recordId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export interface DatabaseDump {
  records: Envelope[];
  meta: MetaEntry[];
  audit: AuditEntry[];
}

/** Opérations disponibles DANS une transaction. N'attendre (await) que ces opérations à l'intérieur de `run`. */
export interface Tx {
  getRecord(collection: string, facilityId: string, id: string): Promise<Envelope | undefined>;
  listRecords(collection: string, facilityId: string): Promise<Envelope[]>;
  putRecord(envelope: Envelope): Promise<void>;
  getMeta<T = unknown>(key: string): Promise<T | undefined>;
  putMeta(key: string, value: unknown): Promise<void>;
  appendAudit(entry: AuditEntry): Promise<void>;
}

export interface LocalDatabase {
  readonly kind: 'indexeddb' | 'memory';
  /** Vrai si les données survivent à l'actualisation de la page. */
  readonly persistent: boolean;
  /**
   * Exécute `fn` dans UNE transaction atomique : si `fn` lève une erreur, rien n'est enregistré.
   * Les transactions en écriture sont sérialisées (pas d'écritures concurrentes entrelacées).
   */
  run<R>(mode: 'readonly' | 'readwrite', fn: (tx: Tx) => Promise<R>): Promise<R>;
  dump(): Promise<DatabaseDump>;
  /** Remplace TOUT le contenu (restauration) de façon atomique. */
  replaceAll(dump: DatabaseDump): Promise<void>;
  deleteAll(): Promise<void>;
  close(): void;
}
