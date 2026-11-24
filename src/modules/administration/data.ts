import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { DEMO_STAFF, SERVICE_KEYS, staffFor, type ServiceKey } from '../_shared/demo-people';
import { createResourceService, localRepositoryFor, type ApiMapping, type ResourceService } from '../_shared/resource-service';
import { resetReference } from '../_shared/reference-data';
import { applyStaffUpdate, buildStaff, setStaffStatus, activeDoctors } from './staff-rules';

export type RoleId = 'doctor' | 'nurse' | 'pharmacist' | 'labTech' | 'cashier' | 'admin';
export const ROLE_IDS: readonly RoleId[] = ['doctor', 'nurse', 'pharmacist', 'labTech', 'cashier', 'admin'];

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: RoleId;
  status: 'active' | 'suspended';
  lastLogin: string | null;
  /** Profil praticien (médecins) : service d'exercice, spécialité, numéro d'inscription à l'ordre. */
  service?: ServiceKey;
  specialty?: string;
  registrationNumber?: string;
  createdAt?: string;
}

const OTHERS: readonly { name: string; role: RoleId }[] = [
  { name: 'Infirmier Démo', role: 'nurse' },
  { name: 'Pharmacien Démo', role: 'pharmacist' },
  { name: 'Laborantin Démo', role: 'labTech' },
  { name: 'Caissier Démo', role: 'cashier' },
  { name: 'Administrateur Démo', role: 'admin' },
];

/** FICTIF. Cinq médecins (un par service) et un membre par autre catégorie. Adresses en « .invalid ». */
export const DEMO_USERS: readonly UserAccount[] = [
  ...DEMO_STAFF.map((m, i): UserAccount => ({
    id: m.id, name: m.name, email: `medecin${i + 1}@demo.invalid`, role: 'doctor', status: 'active', lastLogin: null,
    service: m.service, specialty: 'Fictive (démo)', registrationNumber: `DEMO-ORD-${String(i + 1).padStart(3, '0')}`,
  })),
  ...OTHERS.map((o, i): UserAccount => ({
    id: `DEMO-U-${String(DEMO_STAFF.length + i + 1).padStart(2, '0')}`, name: o.name, email: `${o.role.toLowerCase()}@demo.invalid`, role: o.role, status: 'active', lastLogin: null,
  })),
];

/**
 * Annuaire du personnel. Mode local : annuaire persistant SANS mot de passe ni compte de connexion (il alimente les listes de
 * médecins). L'identité et les accès réels relèveront de CERO ID CORE (contrat à confirmer).
 */
export const staffRepo = localRepositoryFor<UserAccount>(HEALTH_ENDPOINTS.administration.staff, DEMO_USERS);
const newStaffId = (): string => `STAFF-${globalThis.crypto.randomUUID().slice(0, 8).toUpperCase()}`;

export const userService = createResourceService<UserAccount>({
  source: 'health',
  endpoint: HEALTH_ENDPOINTS.administration.staff,
  demoRows: DEMO_USERS,
  local: {
    create: async (input, ctx, repo) => buildStaff(input, await repo.list(), newStaffId(), ctx.now),
    update: async (row, input, _ctx, repo) => applyStaffUpdate(row, input, await repo.list()),
    commands: {
      suspend: (row) => setStaffStatus(row, 'suspended'),
      reactivate: (row) => setStaffStatus(row, 'active'),
    },
    permissions: { create: PERMISSIONS.administration.manageUsers, update: PERMISSIONS.administration.manageUsers, commands: { suspend: PERMISSIONS.administration.manageUsers, reactivate: PERMISSIONS.administration.manageUsers } },
  },
  searchText: (u) => `${u.name} ${u.email} ${u.specialty ?? ''} ${u.registrationNumber ?? ''}`,
  sortValue: (u, column) => String((u as unknown as Record<string, unknown>)[column] ?? ''),
});

/** Médecins actifs (local : annuaire persistant ; sinon : médecins fictifs de démonstration). */
export async function listDoctors(): Promise<UserAccount[]> {
  return activeDoctors(await staffRepo.list());
}

export interface HospitalService {
  id: string;
  key: (typeof SERVICE_KEYS)[number];
  head: string;
  beds: number;
  status: 'active' | 'inactive';
  /** API réelle : nom saisi, code et type de l'unité de soin. */
  name?: string;
  code?: string;
  unitType?: string;
  /** Dépôt de stock du service (API) : d'où sont prélevés les produits consommés lors des visites. */
  depositId?: string;
}

/** Types d'unité de soin acceptés par le serveur (health.care_unit_types). */
export const CARE_UNIT_TYPES = ['reception', 'consultation', 'emergency', 'maternity', 'pediatrics', 'laboratory', 'imaging', 'pharmacy', 'inpatient', 'surgery', 'other'] as const;

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Code technique tiré du nom (lettres, chiffres, tiret ; 30 caractères au plus) quand l'utilisateur n'en fournit pas. */
export function careUnitCode(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

/** Services de l'établissement = unités de soin de l'API (/care-units) : elles alimentent rendez-vous, consultations, triage. */
export const HOSPITAL_SERVICE_API: ApiMapping<HospitalService> = {
  endpoint: '/care-units',
  fromApi: (r) => {
    const code = text(r.code);
    return {
      id: text(r.id),
      key: ((SERVICE_KEYS as readonly string[]).includes(code) ? code : 'generalMedicine') as HospitalService['key'],
      head: '',
      beds: Number(r.capacity) || 0,
      status: r.is_active === false ? 'inactive' : 'active',
      name: text(r.name),
      code,
      unitType: text(r.unit_type),
      depositId: r.deposit_id ? text(r.deposit_id) : undefined,
    };
  },
  toApi: (i) => {
    const name = (i.name ?? '').trim();
    const body: Record<string, unknown> = {
      name,
      code: (i.code ?? '').trim() || careUnitCode(name),
      unit_type: i.unitType || 'other',
    };
    const beds = (i.beds ?? '').trim();
    if (beds !== '' && Number.isInteger(Number(beds)) && Number(beds) >= 0) body.capacity = Number(beds);
    return body;
  },
};

export const DEMO_SERVICES: readonly HospitalService[] = SERVICE_KEYS.map((key, i) => ({
  id: `DEMO-V-${i + 1}`,
  key,
  head: staffFor(key),
  beds: key === 'emergency' ? 0 : 6,
  status: 'active',
}));

const baseHospitalServiceService = createResourceService<HospitalService>({
  source: 'health',
  endpoint: HEALTH_ENDPOINTS.administration.services,
  api: HOSPITAL_SERVICE_API,
  demoRows: DEMO_SERVICES,
  sortValue: (s, column) => (column === 'beds' ? s.beds : String((s as unknown as Record<string, unknown>)[column] ?? '')),
});

export const hospitalServiceService: ResourceService<HospitalService> = {
  ...baseHospitalServiceService,
  // Un service créé doit apparaître tout de suite dans les listes de rendez-vous, consultations, etc.
  async create(input) {
    const result = await baseHospitalServiceService.create(input);
    resetReference();
    return result;
  },
};

export const facilityService = createResourceService<{ id: string }>({
  source: 'health',
  endpoint: HEALTH_ENDPOINTS.administration.facility,
  demoRows: [],
});

export const DEMO_FACILITY: Record<string, string> = {
  name: 'Établissement de démonstration',
  type: 'hospital',
  address: 'Adresse fictive',
  phone: '+000 000 0000',
  email: 'contact@demo.invalid',
  timeZone: 'Africa/Lubumbashi',
  currency: 'USD',
};

const P = PERMISSIONS;

/**
 * PROPOSITION de rôles types (non appliquée, à valider avec CERO ID CORE).
 * Sert uniquement à illustrer la matrice ; les vrais rôles viendront de l'API.
 */
export const DEMO_ROLES: Record<RoleId, readonly string[] | '*'> = {
  admin: '*',
  doctor: [P.dashboard.view, P.patients.view, P.patients.create, P.patients.update, P.appointments.view, P.appointments.update, P.medicalRecords.view, P.consultations.view, P.consultations.create, P.consultations.update, P.consultations.sign, P.consultations.close, P.nursing.view, P.prescriptions.view, P.prescriptions.create, P.laboratory.view, P.laboratory.order, P.hospitalization.view],
  nurse: [P.dashboard.view, P.patients.view, P.appointments.view, P.appointments.checkIn, P.medicalRecords.view, P.consultations.view, P.nursing.view, P.nursing.record, P.laboratory.collect, P.hospitalization.view, P.hospitalization.assignBed],
  pharmacist: [P.dashboard.view, P.patients.view, P.prescriptions.view, P.prescriptions.validate, P.prescriptions.dispense, P.pharmacy.view, P.pharmacy.dispense, P.inventory.view, P.inventory.receive],
  labTech: [P.dashboard.view, P.patients.view, P.laboratory.view, P.laboratory.collect, P.laboratory.resultsEnter, P.laboratory.resultsValidate],
  cashier: [P.dashboard.view, P.patients.view, P.billing.view, P.billing.create, P.billing.pay, P.cash.view, P.cash.record],
};
