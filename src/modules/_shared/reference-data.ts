import { useQuery } from '@tanstack/react-query';
import { healthClient } from '@/core/api';
import { apiContext } from '@/core/api/api-context';
import { queryKeys } from '@/core/api/query-client';
import { env } from '@/core/config/env';
import { usePreferences } from '@/core/preferences/preferences-store';

/**
 * Données de référence de l'établissement actif, fournies par l'API HEALTH :
 * unités de soin (/care-units) et profils du personnel (/staff-profiles).
 * Les rendez-vous, le triage, les consultations… désignent le service et le praticien par ces identifiants.
 */
export interface CareUnit {
  id: string;
  code: string;
  name: string;
  type: string;
  active: boolean;
}

export interface StaffMember {
  /** Identifiant du profil de personnel (celui attendu par l'API). */
  id: string;
  userId: string;
  name: string;
  type: string;
  specialty?: string;
  registrationNumber?: string;
  careUnitId?: string;
}

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export const mapCareUnit = (r: Record<string, unknown>): CareUnit => ({
  id: text(r.id),
  code: text(r.code),
  name: text(r.name),
  type: text(r.unit_type),
  active: r.is_active !== false,
});

export const mapStaff = (r: Record<string, unknown>): StaffMember => ({
  id: text(r.id),
  userId: text(r.user_id),
  name: text(r.display_name) || text(r.professional_title) || `Personnel n°${text(r.id)}`,
  type: text(r.staff_type),
  specialty: text(r.specialty) || undefined,
  registrationNumber: text(r.registration_number) || undefined,
  careUnitId: r.care_unit_id === null || r.care_unit_id === undefined ? undefined : text(r.care_unit_id),
});

/** Vrai quand les données viennent de l'API réelle (ni mode local, ni aperçu fictif). */
export const referenceFromApi = (): boolean => !env.localMode && Boolean(env.api.health);

export async function fetchCareUnits(activeOnly = true): Promise<CareUnit[]> {
  const params: Record<string, string | number> = { per_page: 100 };
  if (activeOnly) params.is_active = 'true';
  const res = await healthClient.get<Record<string, unknown>[]>('/care-units', { params });
  return (Array.isArray(res.data) ? res.data : []).map(mapCareUnit);
}

export async function fetchStaff(staffType?: string, activeOnly = true): Promise<StaffMember[]> {
  const params: Record<string, string | number> = { per_page: 100 };
  if (activeOnly) params.is_active = 'true';
  if (staffType) params.staff_type = staffType;
  const res = await healthClient.get<Record<string, unknown>[]>('/staff-profiles', { params });
  return (Array.isArray(res.data) ? res.data : []).map(mapStaff);
}

/** Unités de soin actives de l'établissement (API uniquement). */
export function useCareUnits() {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'reference', 'care-units'),
    queryFn: () => fetchCareUnits(),
    enabled: referenceFromApi(),
    staleTime: 10_000,
  });
}

/** Personnel actif de l'établissement (API uniquement). */
export function useStaffMembers(staffType?: string) {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'reference', 'staff', staffType ?? 'all'),
    queryFn: () => fetchStaff(staffType),
    enabled: referenceFromApi(),
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Cache synchrone (traduction nom <-> identifiant dans les correspondances ApiMapping, qui ne sont pas asynchrones).
// Rempli par ensureReference() AVANT chaque lecture/écriture des modules qui en dépendent ; un cache par établissement.
// ---------------------------------------------------------------------------------------------------------------
interface Snapshot {
  facility: string | null;
  at: number;
  units: CareUnit[];
  staff: StaffMember[];
}
let snapshot: Snapshot | null = null;
let inflight: { facility: string | null; promise: Promise<void> } | null = null;
// Les unités et le personnel changent rarement : 5 min évitent de les recharger à chaque écran.
const TTL_MS = 300_000;

export async function ensureReference(): Promise<void> {
  if (!referenceFromApi()) return;
  const facility = apiContext.get().facilityId;
  if (snapshot && snapshot.facility === facility && Date.now() - snapshot.at < TTL_MS) return;
  // Appels simultanés (liste + détail + formulaire) : une seule requête partagée.
  if (inflight && inflight.facility === facility) return inflight.promise;
  const promise = (async () => {
    // Un rôle sans droit de lecture du personnel (ex. accueil) ne doit pas bloquer les rendez-vous : listes vides, noms de repli.
    const [units, staff] = await Promise.all([
      fetchCareUnits(false).catch((): CareUnit[] => []),
      fetchStaff(undefined, false).catch((): StaffMember[] => []),
    ]);
    snapshot = { facility, at: Date.now(), units, staff };
  })().finally(() => {
    inflight = null;
  });
  inflight = { facility, promise };
  return promise;
}

/** Réservé aux tests. */
export function setReferenceForTests(units: CareUnit[], staff: StaffMember[]): void {
  snapshot = { facility: apiContext.get().facilityId, at: Date.now(), units, staff };
}
export function resetReference(): void {
  snapshot = null;
  inflight = null;
}

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const unitById = (id: string): CareUnit | undefined => snapshot?.units.find((u) => u.id === id);
export const staffById = (id: string): StaffMember | undefined => snapshot?.staff.find((m) => m.id === id);
/** Auteur d'une écriture : le serveur ne donne que l'identifiant de l'utilisateur. */
export const staffByUserId = (userId: string): StaffMember | undefined => snapshot?.staff.find((m) => m.userId === userId);
/** Unité désignée par son identifiant numérique OU par son code (ex. « pediatrics »). */
export const findUnit = (value: string): CareUnit | undefined =>
  snapshot?.units.find((u) => u.id === value) ?? snapshot?.units.find((u) => fold(u.code) === fold(value));
/** Praticien désigné par son identifiant OU par son nom (insensible à la casse et aux accents). */
export const findStaff = (value: string): StaffMember | undefined =>
  snapshot?.staff.find((m) => m.id === value) ?? snapshot?.staff.find((m) => fold(m.name) === fold(value));
