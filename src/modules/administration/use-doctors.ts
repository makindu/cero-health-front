import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-client';
import { env } from '@/core/config/env';
import { usePreferences } from '@/core/preferences/preferences-store';
import { activeDoctors } from './staff-rules';
import { DEMO_USERS, listDoctors } from './data';

/** Médecins actifs pour les listes de praticiens (local : annuaire persistant ; sinon : médecins fictifs de démonstration). */
export function useDoctors() {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'staff', 'doctors'),
    queryFn: () => (env.localMode ? listDoctors() : Promise.resolve(activeDoctors(DEMO_USERS))),
  });
}
