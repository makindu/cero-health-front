import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-client';
import { env } from '@/core/config/env';
import { usePreferences } from '@/core/preferences/preferences-store';
import { activeDoctors } from './staff-rules';
import { DEMO_USERS, listDoctors, type UserAccount } from './data';
import { fetchStaff, referenceFromApi } from '../_shared/reference-data';

/** Médecins actifs pour les listes de praticiens (API : profils du personnel de l'établissement ; local : annuaire persistant ; sinon : fictifs). */
export function useDoctors() {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'staff', 'doctors'),
    queryFn: async (): Promise<UserAccount[]> => {
      if (referenceFromApi()) {
        return (await fetchStaff('doctor')).map((s) => ({
          id: s.id,
          name: s.name,
          email: '',
          role: 'doctor' as const,
          status: 'active' as const,
          lastLogin: null,
          specialty: s.specialty,
          registrationNumber: s.registrationNumber,
        }));
      }
      return env.localMode ? listDoctors() : activeDoctors(DEMO_USERS);
    },
  });
}
