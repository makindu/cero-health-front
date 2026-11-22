import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { ApiError } from '@/core/api';
import { isoDay } from '@/utils/dates';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { createResourceService, localRepositoryFor, type ApiMapping } from '../_shared/resource-service';
import { applyPatientUpdate, buildPatient, latestVisit, markMerged, planMerge } from './local-rules';
import { DEMO_PATIENT_COUNT, SERVICE_KEYS, demoPerson, pick, type ServiceKey } from '../_shared/demo-people';

/** Le serveur garde le poids de naissance en grammes ; l'interface le saisit et l'affiche en kilogrammes (ex. 3,2). */
export const gramsToKgText = (grams: number | undefined): string =>
  grams === undefined ? '' : String(Math.round(grams) / 1000).replace('.', ',');

export function kgTextToGrams(text: string | undefined): number | null {
  const raw = (text ?? '').trim().replace(',', '.');
  if (raw === '') return null;
  const kg = Number(raw);
  if (!Number.isFinite(kg) || kg <= 0 || kg > 20) {
    throw new ApiError('validation', 'Saisissez le poids de naissance en kilogrammes, par exemple 3,2.', { source: 'health', status: 422, code: 'invalid_input' });
  }
  return Math.round(kg * 1000);
}

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

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const orNull = (v: string | undefined): string | null => (v && v.trim() !== '' ? v.trim() : null);

/** Correspondance avec l'API réelle (module Health du serveur). Les champs absents du serveur restent vides. */
const PATIENT_API: ApiMapping<Patient> = {
  endpoint: '/patients',
  fromApi: (r) => ({
    id: str(r.id),
    fileNumber: str(r.file_number) || str(r.patient_number),
    fullName: str(r.full_name),
    sex: r.sex === 'M' ? 'M' : 'F',
    birthDate: str(r.birth_date),
    phone: str(r.phone),
    address: str(r.address),
    service: SERVICE_KEYS[0] as ServiceKey, // non fourni par le serveur pour l'instant
    status: r.status === 'inactive' ? 'inactive' : 'active',
    insurer: str(r.insurer),
    emergencyContact: [str(r.emergency_contact_name), str(r.emergency_contact_phone)].filter(Boolean).join(' · '),
    registeredAt: str(r.registered_on) || str(r.created_at).slice(0, 10),
    lastVisit: null, // non fourni par le serveur pour l'instant
    email: str(r.email) || undefined,
    birthWeightGrams: typeof r.birth_weight_grams === 'number' ? r.birth_weight_grams : undefined,
    categoryId: str(r.category_code) || undefined,
    mergedInto: r.merged_into_patient_id ? str(r.merged_into_patient_id) : undefined,
  }),
  toApi: (i) => {
    const body: Record<string, unknown> = {
      full_name: orNull(i.fullName),
      sex: orNull(i.sex),
      birth_date: orNull(i.birthDate),
      phone: orNull(i.phone),
      email: orNull(i.email),
      address: orNull(i.address),
      insurer: orNull(i.insurer),
      file_number: orNull(i.fileNumber),
      emergency_contact_name: orNull(i.emergencyContact),
      birth_weight_grams: kgTextToGrams(i.birthWeightKg),
    };
    // Code de catégorie : envoyé seulement s'il est renseigné (le serveur vérifie qu'il existe pour l'établissement).
    if (orNull(i.categoryId)) body.category_code = i.categoryId;
    return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  },
  filterMap: { sex: 'sex', status: 'status', registeredFrom: 'registered_from', registeredTo: 'registered_to', service: null },
  sortMap: { fullName: 'full_name', registeredAt: 'registered_on', age: 'birth_date' },
};

export const patientService = createResourceService<Patient>({
  source: 'health',
  endpoint: HEALTH_ENDPOINTS.patients.collection,
  api: PATIENT_API,
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
