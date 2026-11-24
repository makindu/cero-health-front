import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { ApiError, healthClient } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { createResourceService, type ApiMapping, type ResourceService } from '../_shared/resource-service';
import { referenceFromApi, resetReference } from '../_shared/reference-data';

/** Types de personnel acceptés par le serveur (health.staff_types). */
export const STAFF_TYPES = ['doctor', 'nurse', 'midwife', 'lab_technician', 'pharmacist', 'receptionist', 'cashier', 'administrator', 'other'] as const;

export interface StaffProfile {
  id: string;
  userId: string;
  name: string;
  type: string;
  title: string;
  specialty: string;
  registrationNumber: string;
  careUnitId: string;
  active: boolean;
}

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const orUndefined = (v: string | undefined): string | undefined => (v && v.trim() !== '' ? v.trim() : undefined);

export const staffFromApi = (r: Record<string, unknown>): StaffProfile => ({
  id: text(r.id),
  userId: text(r.user_id),
  name: text(r.display_name) || text(r.professional_title) || `Personnel n°${text(r.id)}`,
  type: text(r.staff_type),
  title: text(r.professional_title),
  specialty: text(r.specialty),
  registrationNumber: text(r.registration_number),
  careUnitId: text(r.care_unit_id),
  active: r.is_active !== false,
});

/** Ligne de l'onglet Personnel : un membre CERO ID de l'établissement, avec son profil HEALTH s'il en a un. */
export interface StaffMemberRow extends StaffProfile {
  /** Identifiant du profil HEALTH (vide quand la personne n'en a pas encore). */
  profileId: string;
  /** Fonction propre à l'établissement (vide = seulement le type commun). */
  functionId: string;
  functionLabel: string;
  hasProfile: boolean;
  owner: boolean;
}

export const staffMemberFrom = (r: Record<string, unknown>): StaffMemberRow => {
  const hasProfile = r.profile_id !== null && r.profile_id !== undefined;
  return {
    ...staffFromApi({ ...r, id: r.user_id ?? r.id }),
    profileId: hasProfile ? text(r.profile_id) : '',
    functionId: text(r.function_id),
    functionLabel: text(r.function_label),
    hasProfile,
    owner: r.is_owner === true,
    active: r.is_active === true,
  };
};

export const STAFF_MEMBERS_API: ApiMapping<StaffMemberRow> = {
  endpoint: '/staff-members',
  fromApi: staffMemberFrom,
  toApi: () => ({}),
  filterMap: { type: 'staff_type', status: null },
  mapFilter: (id, value) => (id === 'status' ? { is_active: value === 'active' ? 'true' : 'false' } : undefined),
};

/** Personnel de l'établissement : liste des membres CERO ID (lecture seule — la gestion se fait dans CERO ID). */
export const staffMemberService: ResourceService<StaffMemberRow> = createResourceService<StaffMemberRow>({ source: 'health', endpoint: '/staff-members', api: STAFF_MEMBERS_API });

/** Corps d'un profil : les champs vides ne sont pas envoyés ; le compte (user_id) n'existe qu'à la création. */
export function staffBody(input: Record<string, string>, creating: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = { staff_type: input.type };
  if (creating) body.user_id = Number(input.userId);
  const title = orUndefined(input.title);
  const registration = orUndefined(input.registrationNumber);
  const specialty = orUndefined(input.specialty);
  const unit = orUndefined(input.careUnitId);
  if (title) body.professional_title = title;
  if (registration) body.registration_number = registration;
  if (specialty) body.specialty = specialty;
  if (unit) body.care_unit_id = Number(unit);
  return body;
}

export const STAFF_API: ApiMapping<StaffProfile> = {
  endpoint: '/staff-profiles',
  fromApi: staffFromApi,
  toApi: (i) => staffBody(i, true),
  toApiUpdate: (i) => staffBody(i, false),
  filterMap: { type: 'staff_type', status: null },
  mapFilter: (id, value) => (id === 'status' ? { is_active: value === 'active' ? 'true' : 'false' } : undefined),
};

const base = createResourceService<StaffProfile>({ source: 'health', endpoint: '/staff-profiles', api: STAFF_API });

/** Profils du personnel de l'établissement. Activer / désactiver = modification du profil (PATCH), jamais une suppression. */
export const staffProfileService: ResourceService<StaffProfile> = {
  ...base,
  async create(input) {
    const result = await base.create(input);
    resetReference();
    return result;
  },
  async command(id, action) {
    if (action !== 'activate' && action !== 'deactivate') return base.command(id, action);
    await healthClient.patch(`/staff-profiles/${encodeURIComponent(id)}`, { is_active: action === 'activate' });
    resetReference();
    return { isDemo: false };
  },
};

/** Membres de l'établissement qui n'ont pas encore de profil (pour en créer un). */
export function useStaffCandidates() {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'staff', 'candidates'),
    queryFn: async () => {
      const res = await healthClient.get<Record<string, unknown>[]>('/staff-profiles/candidates');
      return (Array.isArray(res.data) ? res.data : []).map((r) => ({ value: text(r.user_id), label: text(r.name) }));
    },
    enabled: referenceFromApi(),
    staleTime: 5_000,
  });
}

/** Saisie d'un profil de personnel. */
export interface StaffProfileInput {
  userId: string;
  /** Vide = création ; renseigné = modification de ce profil. */
  profileId: string;
  type: string;
  title: string;
  specialty: string;
  registrationNumber: string;
  careUnitId: string;
  /** Fonction propre à l'établissement (vide = aucune). */
  functionId: string;
  active: boolean;
}

/** Modification : un champ vidé est envoyé à null pour être effacé ; le compte n'est jamais renvoyé. */
export function staffUpdateBody(i: StaffProfileInput): Record<string, unknown> {
  const clean = (v: string): string | null => (v.trim() === '' ? null : v.trim());
  return {
    staff_type: i.type,
    function_id: i.functionId.trim() === '' ? null : Number(i.functionId),
    professional_title: clean(i.title),
    specialty: clean(i.specialty),
    registration_number: clean(i.registrationNumber),
    care_unit_id: i.careUnitId.trim() === '' ? null : Number(i.careUnitId),
    is_active: i.active,
  };
}

/** Un profil de plus ou un profil modifié, selon que le profil existe déjà. */
export async function saveStaffProfile(i: StaffProfileInput): Promise<void> {
  if (i.profileId) await healthClient.patch(`/staff-profiles/${encodeURIComponent(i.profileId)}`, staffUpdateBody(i));
  else {
    const body = staffBody({ userId: i.userId, type: i.type, title: i.title, specialty: i.specialty, registrationNumber: i.registrationNumber, careUnitId: i.careUnitId }, true);
    if (i.functionId) body.function_id = Number(i.functionId);
    await healthClient.post('/staff-profiles', body);
  }
  resetReference();
}

/** Enregistre un profil puis relit la liste du personnel, les listes de médecins et les candidats. */
export function useStaffMutation(options: { successTitle: string; onDone?: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  return useMutation({
    mutationFn: saveStaffProfile,
    onSuccess: () => {
      for (const scope of ['staff', 'reference']) void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, scope) });
      toast({ tone: 'success', title: options.successTitle });
      options.onDone?.();
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'staff') });
      const server = error instanceof ApiError && error.status && error.status < 500 ? error.message : undefined;
      toast({ tone: 'danger', title: server ?? t('module.saveFailed'), description: server ? undefined : t('module.saveFailedHint') });
    },
  });
}
