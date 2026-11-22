import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { isoAt } from '@/utils/dates';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { assertPermission } from '@/core/local/session';
import { ApiError } from '@/core/api';
import { createResourceService, localRepositoryFor, type ApiMapping, type LocalWriteContext, type ResourceService } from '../_shared/resource-service';
import { ensureReference, findStaff, staffById, staffByUserId } from '../_shared/reference-data';
import { patientRepo } from '../patients/data';
import { applyTriageCommand, buildTriageEntry } from './local-rules';
import { demoPerson, pick } from '../_shared/demo-people';

export type TriagePriority = 'immediate' | 'veryUrgent' | 'urgent' | 'standard' | 'nonUrgent';
export type TriageStatus = 'waiting' | 'inTriage' | 'inCare' | 'transferred' | 'discharged';
export type TriageCategory = 'injury' | 'fever' | 'pregnancy' | 'followUp' | 'other';

export interface TriageEntry {
  id: string;
  patientId: string;
  patientName: string;
  arrivedAt: string;
  priority: TriagePriority;
  category: TriageCategory;
  status: TriageStatus;
  nurse: string;
  /** Mode local : motif saisi à l'accueil et provenance (passage sans rendez-vous). */
  reason?: string;
  source?: string;
  /** Mode API : validation des soins par un médecin (l'infirmier ne démarre aucun soin sans elle). */
  careValidated?: { at: string; by: string; instructions?: string };
}

export const PRIORITIES: readonly TriagePriority[] = ['immediate', 'veryUrgent', 'urgent', 'standard', 'nonUrgent'];

/** FICTIF : file d'attente de démonstration (aucune donnée clinique). */
export const DEMO_TRIAGE: readonly TriageEntry[] = Array.from({ length: 16 }, (_, i) => {
  const person = demoPerson((i * 4 + 2) % 24);
  return {
    id: `DEMO-T-${String(i + 1).padStart(3, '0')}`,
    patientId: person.id,
    patientName: person.fullName,
    arrivedAt: isoAt(0, 7 + Math.floor(i / 2), (i % 2) * 25),
    priority: pick(PRIORITIES, i * 2 + (i % 3)),
    category: pick<TriageCategory>(['injury', 'fever', 'pregnancy', 'followUp', 'other'], i),
    status: pick<TriageStatus>(['waiting', 'waiting', 'inTriage', 'inCare', 'waiting', 'transferred', 'discharged'], i),
    nurse: `Infirmier démo ${(i % 3) + 1}`,
  };
});

export const triageRepo = localRepositoryFor<TriageEntry>(HEALTH_ENDPOINTS.triage.collection, DEMO_TRIAGE);

const newId = (): string => `TRI-LOC-${globalThis.crypto.randomUUID().slice(0, 8).toUpperCase()}`;
const NURSE_COMMANDS = ['start-triage', 'send-to-care', 'transfer', 'discharge', 'send-to-doctor'] as const;

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const CATEGORY_CODES: readonly string[] = ['injury', 'fever', 'pregnancy', 'followUp', 'other'];

/** API réelle : /triage-entries. Le serveur fixe le statut, l'infirmier et les heures ; l'interface n'envoie que la saisie. */
export const TRIAGE_API: ApiMapping<TriageEntry> = {
  endpoint: '/triage-entries',
  fromApi: (r) => {
    const patient = (r.patient ?? null) as { full_name?: string } | null;
    return {
      id: text(r.id),
      patientId: text(r.patient_id),
      patientName: patient?.full_name ?? `Patient n°${text(r.patient_id)}`,
      arrivedAt: text(r.arrived_at),
      priority: text(r.priority) as TriagePriority,
      category: text(r.category) as TriageCategory,
      status: text(r.status) as TriageStatus,
      nurse: staffById(text(r.nurse_staff_id))?.name ?? '',
      reason: r.reason ? text(r.reason) : undefined,
      source: r.source ? text(r.source) : undefined,
      ...(r.care_validated_at
        ? { careValidated: { at: text(r.care_validated_at), by: staffByUserId(text(r.care_validated_by_user_id))?.name ?? '', ...(r.care_instructions ? { instructions: text(r.care_instructions) } : {}) } }
        : {}),
    };
  },
  toApi: (i) => {
    const patient = Number(i.patient);
    if (!Number.isInteger(patient) || patient <= 0) {
      throw new ApiError('validation', 'Choisissez un patient dans la liste.', { source: 'health', status: 422, code: 'invalid_input' });
    }
    const body: Record<string, unknown> = {
      patient_id: patient,
      priority: i.priority || 'standard',
      category: CATEGORY_CODES.includes(i.category ?? '') ? i.category : 'other',
      source: i.source || 'walkIn',
    };
    if (i.reason?.trim()) body.reason = i.reason.trim().slice(0, 255);
    return body;
  },
  // Le serveur nomme l'étape « start-care » là où l'interface dit « send-to-care ».
  commandPath: (id, action) => `/triage-entries/${encodeURIComponent(id)}/actions/${action === 'send-to-care' ? 'start-care' : action}`,
  commandBody: (action, p) => {
    if (action === 'reprioritize' && p.priority) return { priority: p.priority };
    if (action === 'validate-care') return p.instructions?.trim() ? { instructions: p.instructions.trim().slice(0, 500) } : {};
    if (action === 'send-to-doctor') {
      const doctor = findStaff(p.practitioner ?? '');
      if (!doctor) {
        throw new ApiError('validation', 'Choisissez un médecin dans la liste.', { source: 'health', status: 422, code: 'invalid_input' });
      }
      return { practitioner_staff_id: Number(doctor.id) };
    }
    return {};
  },
  sortMap: { priority: 'priority', arrivedAt: 'arrived_at' },
};

const baseTriageService = createResourceService<TriageEntry>({
  source: 'health',
  endpoint: HEALTH_ENDPOINTS.triage.collection,
  api: TRIAGE_API,
  demoRows: DEMO_TRIAGE,
  local: {
    create: async (input, ctx, repo) => {
      // L'accueil peut orienter un cas vers le triage (passage sans rendez-vous) sans avoir le droit de saisie infirmière.
      assertPermission(input.source === 'walkIn' ? PERMISSIONS.appointments.checkIn : PERMISSIONS.nursing.record);
      return buildTriageEntry(input, ctx, await patientRepo.list(), await repo.list(), newId());
    },
    commands: Object.fromEntries(NURSE_COMMANDS.map((action) => [action, (row: TriageEntry, _payload: Record<string, string>, ctx: LocalWriteContext) => applyTriageCommand(row, action, ctx)])),
    permissions: { commands: Object.fromEntries(NURSE_COMMANDS.map((action) => [action, PERMISSIONS.nursing.record])) },
  },
  searchText: (e) => `${e.patientName} ${e.patientId} ${e.id}`,
  sortValue: (e, column) =>
    column === 'priority' ? PRIORITIES.indexOf(e.priority) : String((e as unknown as Record<string, unknown>)[column] ?? ''),
});

const prepared =
  <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
  async (...args: A): Promise<R> => {
    await ensureReference();
    return fn(...args);
  };

export const triageService: ResourceService<TriageEntry> = {
  ...baseTriageService,
  list: prepared(baseTriageService.list),
  get: prepared(baseTriageService.get),
  create: prepared(baseTriageService.create),
  command: prepared(baseTriageService.command),
};
