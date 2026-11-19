import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { isoDay } from '@/utils/dates';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { createResourceService, localRepositoryFor } from '../_shared/resource-service';
import { applyPatientUpdate, buildPatient, latestVisit, markMerged, planMerge } from './local-rules';
import { DEMO_PATIENT_COUNT, SERVICE_KEYS, demoPerson, pick, type ServiceKey } from '../_shared/demo-people';

export interface Patient {
  id: string;
  /** Numéro de dossier (papier ou ancien système) : distinct de l'identifiant technique. */
  fileNumber: string;
  fullName: string;
  sex: 'F' | 'M';
  birthDate: string;
  phone: string;
  address: string;
  service: ServiceKey;
  status: 'active' | 'inactive';
  insurer: string;
  emergencyContact: string;
  registeredAt: string;
  lastVisit: string | null;
  /** Adresse e-mail (notifications : rendez-vous, factures impayées, résultats). */
  email?: string;
  /** Poids de naissance en grammes. */
  birthWeightGrams?: number;
  /** Catégorie du patient (obligations de paiement) ; absente = « privé ». */
  categoryId?: string;
  /** Mode local : dossier fusionné dans un autre (désactivé, jamais supprimé). */
  mergedInto?: string;
}

/** FICTIF. Numéros de téléphone volontairement invalides. */
export const DEMO_PATIENTS: readonly Patient[] = Array.from({ length: DEMO_PATIENT_COUNT }, (_, i) => {
  const person = demoPerson(i);
  // Deux cas de doublons VOLONTAIRES pour la démonstration : même téléphone (n°21 ↔ n°4), même numéro de dossier (n°23 ↔ n°6).
  const phoneIndex = i === 20 ? 3 : i;
  const fileIndex = i === 22 ? 5 : i;
  return {
    id: person.id,
    fileNumber: `DOS-DEMO-${String(fileIndex + 1).padStart(4, '0')}`,
    fullName: person.fullName,
    sex: person.sex,
    birthDate: `${1950 + ((i * 7) % 65)}-${String((i % 12) + 1).padStart(2, '0')}-${String(((i * 5) % 27) + 1).padStart(2, '0')}`,
    phone: `+000 000 00${String(phoneIndex).padStart(2, '0')}`,
    address: `Avenue démo ${i + 1}`,
    service: pick(SERVICE_KEYS, i),
    status: i % 9 === 8 ? 'inactive' : 'active',
    insurer: i % 3 === 0 ? 'Assureur démo' : '',
    emergencyContact: `Proche démo ${i + 1} · +000 000 01${String(i).padStart(2, '0')}`,
    registeredAt: isoDay(-400 + i * 11),
    lastVisit: i % 5 === 4 ? null : isoDay(-(i % 20)),
  };
});

export const patientRepo = localRepositoryFor<Patient>(HEALTH_ENDPOINTS.patients.collection, DEMO_PATIENTS);

const newPatientId = (): string => `PAT-LOC-${globalThis.crypto.randomUUID().slice(0, 8).toUpperCase()}`;

export const patientService = createResourceService<Patient>({
  source: 'health',
  endpoint: HEALTH_ENDPOINTS.patients.collection,
  demoRows: DEMO_PATIENTS,
  local: {
    create: async (input, ctx, repo) => buildPatient(input, await repo.list(), ctx.now, newPatientId()),
    update: async (row, input, ctx, repo) => applyPatientUpdate(row, input, await repo.list(), ctx.now),
    commands: {
      merge: async (keep, payload, _ctx, repo) => {
        const plan = planMerge(keep, payload, await repo.list());
        // Ordre sûr et rejouable : 1) rattacher les références, 2) désactiver les doublons, 3) la fiche conservée est renvoyée.
        const { repointPatientReferences } = await import('./merge-local');
        await repointPatientReferences(plan, keep);
        let lastVisit = keep.lastVisit;
        for (const id of plan.duplicateIds) {
          const updated = await repo.update(id, (row) => markMerged(row, keep.id), { action: 'merge', reason: payload.reason });
          lastVisit = latestVisit(lastVisit, updated.lastVisit);
        }
        return { ...keep, lastVisit };
      },
    },
    permissions: { create: PERMISSIONS.patients.create, update: PERMISSIONS.patients.update, commands: { merge: PERMISSIONS.patients.merge } },
  },
  searchText: (p) => `${p.fullName} ${p.id} ${p.fileNumber} ${p.phone}`,
  matchFilter: (p, filter, value) => {
    // Dates d'inscription : bornes incluses, au format AAAA-MM-JJ.
    if (filter === 'registeredFrom') return p.registeredAt.slice(0, 10) >= value;
    if (filter === 'registeredTo') return p.registeredAt.slice(0, 10) <= value;
    return String((p as unknown as Record<string, unknown>)[filter]) === value;
  },
  sortValue: (p, column) => (column === 'age' ? p.birthDate : String((p as unknown as Record<string, unknown>)[column] ?? '')),
});
