import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { isoAt } from '@/utils/dates';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { assertPermission } from '@/core/local/session';
import { createResourceService, localRepositoryFor, type LocalWriteContext } from '../_shared/resource-service';
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
const NURSE_COMMANDS = ['start-triage', 'send-to-care', 'transfer', 'discharge'] as const;

export const triageService = createResourceService<TriageEntry>({
  source: 'health',
  endpoint: HEALTH_ENDPOINTS.triage.collection,
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
