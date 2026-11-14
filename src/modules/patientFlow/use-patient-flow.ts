import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-client';
import { env } from '@/core/config/env';
import { usePreferences } from '@/core/preferences/preferences-store';
import { patientFlow } from './patient-flow';

export const PATIENT_FLOW_AVAILABLE = env.localMode;

/** Actualisé toutes les 20 s et au retour sur l'onglet : les autres modules ne préviennent pas ce tableau. */
export function usePatientFlow() {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'patientFlow', 'snapshot'),
    queryFn: () => patientFlow.snapshot(),
    enabled: PATIENT_FLOW_AVAILABLE,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });
}
