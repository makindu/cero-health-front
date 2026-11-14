import type { DatabaseDump, LocalDatabase } from './database';
import { SCHEMA_VERSION } from './schema';

export const BACKUP_FORMAT = 'cero-health-local-backup';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: 1;
  schemaVersion: number;
  createdAt: string;
  /** Rappel affiché à l'ouverture : ce fichier n'est PAS une sauvegarde sécurisée serveur. */
  notice: string;
  counts: { records: number; audit: number };
  dump: DatabaseDump;
}

export class BackupError extends Error {
  constructor(readonly code: 'invalid_json' | 'invalid_format' | 'too_new' | 'invalid_content', message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export async function createBackup(db: LocalDatabase, now: Date = new Date()): Promise<BackupFile> {
  const dump = await db.dump();
  return {
    format: BACKUP_FORMAT,
    formatVersion: 1,
    schemaVersion: SCHEMA_VERSION,
    createdAt: now.toISOString(),
    notice: 'Sauvegarde locale CERO HEALTH (mode local). Contient des données de l’appareil ; à conserver en lieu sûr.',
    counts: { records: dump.records.length, audit: dump.audit.length },
    dump,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Valide un fichier de sauvegarde AVANT toute restauration. Aucune donnée n'est touchée en cas d'erreur. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('invalid_json', 'Le fichier n’est pas un JSON valide.');
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT || raw.formatVersion !== 1) {
    throw new BackupError('invalid_format', 'Ce fichier n’est pas une sauvegarde CERO HEALTH.');
  }
  if (typeof raw.schemaVersion !== 'number' || raw.schemaVersion > SCHEMA_VERSION) {
    throw new BackupError('too_new', 'Cette sauvegarde provient d’une version plus récente de l’application.');
  }
  const dump = raw.dump;
  if (!isObj(dump) || !Array.isArray(dump.records) || !Array.isArray(dump.meta) || !Array.isArray(dump.audit)) {
    throw new BackupError('invalid_content', 'Contenu de sauvegarde incomplet.');
  }
  const seen = new Set<string>();
  for (const r of dump.records) {
    if (!isObj(r) || !isStr(r.collection) || !isStr(r.facilityId) || !isStr(r.id) || !isObj(r.data) || typeof r.version !== 'number') {
      throw new BackupError('invalid_content', 'Enregistrement invalide dans la sauvegarde.');
    }
    const key = `${r.collection}|${r.facilityId}|${r.id}`;
    if (seen.has(key)) throw new BackupError('invalid_content', 'Enregistrement en double dans la sauvegarde.');
    seen.add(key);
  }
  for (const m of dump.meta) {
    if (!isObj(m) || !isStr(m.key)) throw new BackupError('invalid_content', 'Métadonnée invalide dans la sauvegarde.');
  }
  return raw as unknown as BackupFile;
}

/** Remplace TOUTES les données locales par celles de la sauvegarde (après validation et confirmation de l'utilisateur). */
export async function restoreBackup(db: LocalDatabase, text: string): Promise<BackupFile> {
  const backup = parseBackup(text);
  await db.replaceAll(backup.dump);
  return backup;
}

/** Réinitialise le jeu de démonstration : efface tout, le semis repart de zéro à la prochaine lecture. */
export async function resetLocalData(db: LocalDatabase): Promise<void> {
  await db.deleteAll();
  await db.run('readwrite', (tx) => tx.putMeta('schemaVersion', SCHEMA_VERSION));
}
