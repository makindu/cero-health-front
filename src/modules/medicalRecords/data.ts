import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { isoDay } from '@/utils/dates';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { env } from '@/core/config/env';
import { BusinessRuleError } from '../_shared/business-error';
import { createResourceService, localRepositoryFor } from '../_shared/resource-service';
import { patientRepo } from '../patients/data';
import { resolvePatient } from '../patients/local-rules';
import { RecordError, applyAction, buildRecord, createRecord, patientsWithoutRecord, type RecordAction } from './record-rules';
import { SERVICE_KEYS, demoPerson, pick, type ServiceKey } from '../_shared/demo-people';

export type RecordStatus = 'active' | 'archived' | 'locked';
export type Completeness = 'complete' | 'partial' | 'incomplete';

export interface MedicalRecord {
  id: string;
  patientId: string;
  patientName: string;
  service: ServiceKey;
  openedAt: string;
  lastUpdate: string;
  status: RecordStatus;
  completeness: Completeness;
  /** Dernier accès au contenu clinique (mode local : écrit par la commande « access », tracée dans le journal d'audit). */
  lastAccess?: { at: string; by: string };
  /** Dernière impression ou dernier export (mode local : écrit par la commande « export », tracée dans le journal d'audit). */
  lastExport?: { at: string; by: string; format: 'print' | 'xlsx' };
  /** Nombre d'éléments par section : indication administrative, SANS contenu clinique. */
  counts: { consultations: number; prescriptions: number; labOrders: number; documents: number };
}

/** FICTIF. Aucun contenu clinique : uniquement des métadonnées administratives. */
export const DEMO_RECORDS: readonly MedicalRecord[] = Array.from({ length: 24 }, (_, i) => {
  const person = demoPerson(i);
  return {
    id: `DEMO-D-${String(i + 1).padStart(3, '0')}`,
    patientId: person.id,
    patientName: person.fullName,
    service: pick(SERVICE_KEYS, i),
    openedAt: isoDay(-300 + i * 9),
    lastUpdate: isoDay(-(i % 30)),
    status: pick<RecordStatus>(['active', 'active', 'active', 'archived', 'locked'], i),
    completeness: pick<Completeness>(['complete', 'partial', 'incomplete', 'complete'], i),
    counts: { consultations: (i % 6) + 1, prescriptions: i % 5, labOrders: i % 4, documents: (i * 2) % 7 },
  };
});

export const recordRepo = localRepositoryFor<MedicalRecord>(HEALTH_ENDPOINTS.medicalRecords.collection, DEMO_RECORDS);

/** Mode local : chaque patient actif a son dossier permanent. Ouvert à la demande, sans doublon (identifiant déterministe, insertion refusée si présent). */
export async function ensureRecords(now: Date = new Date()): Promise<number> {
  const [patients, records] = await Promise.all([patientRepo.list(), recordRepo.list()]);
  let created = 0;
  for (const patient of patientsWithoutRecord(patients, records)) {
    try {
      await recordRepo.insert(buildRecord(patient, now), { action: 'record:open' });
      created += 1;
    } catch {
      // ouvert entre-temps par un autre onglet : le dossier existe, c'est le but
    }
  }
  return created;
}

function wrapRecord<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof RecordError) throw new BusinessRuleError(`record.${e.code}`, {}, e.code === 'wrongStatus' || e.code === 'alreadyExists' ? 'conflict' : 'validation');
    throw e;
  }
}

const act = (action: RecordAction) => (row: MedicalRecord, _payload: Record<string, string>, ctx: { now: Date }): MedicalRecord => {
  return wrapRecord(() => applyAction(row, action, ctx.now));
};

const baseService = createResourceService<MedicalRecord>({
  source: 'health',
  endpoint: HEALTH_ENDPOINTS.medicalRecords.collection,
  demoRows: DEMO_RECORDS,
  searchText: (r) => `${r.patientName} ${r.patientId} ${r.id}`,
  local: {
    // Ouverture manuelle d'un dossier (le plus souvent inutile : les dossiers s'ouvrent seuls, voir ensureRecords).
    create: async (input, ctx, repo) => {
      const patient = resolvePatient(input.patient ?? '', await patientRepo.list());
      const existing = await repo.list();
      return wrapRecord(() => createRecord(patient, existing, ctx.now));
    },
    // Ouvrir le contenu = un accès nominatif : il laisse une trace (journal d'audit + dernier accès sur le dossier). Aucun contenu clinique n'est copié dans le dossier.
    commands: {
      access: (row, _payload, ctx) => ({ ...row, lastAccess: { at: ctx.now.toISOString(), by: ctx.actor.name } }),
      export: (row, payload, ctx) => {
        if (payload.format !== 'print' && payload.format !== 'xlsx') throw new BusinessRuleError('record.formatInvalid', {}, 'validation');
        return { ...row, lastExport: { at: ctx.now.toISOString(), by: ctx.actor.name, format: payload.format } };
      },
      archive: act('archive'), lock: act('lock'), reopen: act('reopen'),
    },
    permissions: { create: PERMISSIONS.medicalRecords.manage, commands: { access: PERMISSIONS.medicalRecords.view, export: PERMISSIONS.medicalRecords.export, archive: PERMISSIONS.medicalRecords.manage, lock: PERMISSIONS.medicalRecords.manage, reopen: PERMISSIONS.medicalRecords.manage } },
  },
});

export const recordService: typeof baseService = {
  ...baseService,
  async list(params) {
    if (env.localMode) await ensureRecords();
    return baseService.list(params);
  },
};
