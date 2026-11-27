import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-client';
import { env } from '@/core/config/env';
import { usePreferences } from '@/core/preferences/preferences-store';
import { fetchStaff, referenceFromApi } from '../_shared/reference-data';
import { activeDoctors } from './staff-rules';
import { DEMO_USERS, listDoctors } from './data';

/** Praticien proposé dans les listes (médecin référent, prescripteur…). */
export interface Practitioner { id: string; name: string; specialty?: string; registrationNumber?: string }

/**
 * Praticiens actifs pour les listes de praticiens.
 * API réelle : les médecins, infirmiers ET sages-femmes actifs du personnel de l'établissement (le serveur les accepte comme praticien).
 * Local : annuaire persistant ; sinon : médecins fictifs de démonstration.
 */
export function useDoctors() {
  const { activeFacilityId } = usePreferences();
  return useQuery<Practitioner[]>({
    queryKey: queryKeys.scoped(activeFacilityId, 'staff', 'doctors', referenceFromApi() ? 'api' : 'local'),
    queryFn: async () => {
      if (referenceFromApi()) {
        const [doctors, nurses, midwives] = await Promise.all([fetchStaff('doctor'), fetchStaff('nurse'), fetchStaff('midwife')]);
        return [...doctors, ...nurses, ...midwives].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ id: s.id, name: s.name, specialty: s.specialty, registrationNumber: s.registrationNumber }));
      }
      return env.localMode ? listDoctors() : activeDoctors(DEMO_USERS);
    },
    staleTime: 30_000,
  });
}
