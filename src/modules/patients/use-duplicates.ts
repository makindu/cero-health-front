import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api';
import { usePreferences } from '@/core/preferences/preferences-store';
import { patientService, type Patient } from './data';
import { findDuplicatesOf } from './duplicates';

/** Dossiers qui partagent le téléphone ou le numéro de dossier du patient affiché (recherche via le contrat de liste). */
export function usePatientDuplicates(patient: Patient | undefined) {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'patients', 'duplicates', patient?.id),
    enabled: Boolean(patient),
    queryFn: async () => {
      if (!patient) return [];
      const searches = [patient.fileNumber, patient.phone].filter(Boolean);
      const pages = await Promise.all(
        searches.map((search) => patientService.list({ page: 1, perPage: 20, search, filters: {}, sort: null })),
      );
      return findDuplicatesOf(patient, pages.flatMap((page) => page.rows));
    },
  });
}
