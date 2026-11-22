import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { describeBusinessError } from '../_shared/business-error';
import { FINANCE_AVAILABLE } from '../finance/use-finance';
import { ApiError } from '@/core/api';
import { referenceFromApi } from '../_shared/reference-data';
import { hospital, hospitalAccount, visits } from './hospital';
import { apiHospital } from './hospital-api';

export const HOSPITAL_AVAILABLE = FINANCE_AVAILABLE || referenceFromApi();

export function useHospitalBoard() {
  const { activeFacilityId } = usePreferences();
  return useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'hospital', 'board'), queryFn: () => hospital.board(), enabled: HOSPITAL_AVAILABLE });
}

/** Demandes d'hospitalisation des médecins, à traiter par le service des admissions (rafraîchies aussi toutes les 30 s). */
export function useAdmissionRequests() {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'hospital', 'requests'),
    queryFn: () => apiHospital.requests(),
    enabled: HOSPITAL_AVAILABLE && referenceFromApi(),
    refetchInterval: 30_000,
  });
}

/** Compte d'une admission ; sous la portée `finance` pour se rafraîchir dès qu'un paiement est encaissé. */
export function useAdmissionAccount(admissionId: string | undefined) {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'finance', 'admission-account', admissionId),
    queryFn: () => hospitalAccount.account(admissionId ?? ''),
    enabled: HOSPITAL_AVAILABLE && !referenceFromApi() && Boolean(admissionId),
  });
}

/** Compte d'une admission en mode API (reste à facturer, factures du séjour, solde) ; rafraîchi par les signaux « hospital ». */
export function useApiAdmissionAccount(admissionId: string | undefined) {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'hospital', 'account', admissionId),
    queryFn: () => apiHospital.account(admissionId ?? ''),
    enabled: HOSPITAL_AVAILABLE && referenceFromApi() && Boolean(admissionId),
  });
}

/** Registre des visites et consommations d'une admission ; sous la portée `finance` pour suivre les factures (annulation, paiement). */
export function useVisitLedger(admissionId: string | undefined) {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'finance', 'visit-ledger', admissionId),
    queryFn: () => visits.ledger(admissionId ?? ''),
    enabled: HOSPITAL_AVAILABLE && !referenceFromApi() && Boolean(admissionId),
  });
}

export function useHospitalMutation<I, R>(run: (input: I) => Promise<R>, options: { successTitle: string; onDone?: (result: R) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  return useMutation({
    mutationFn: run,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'hospital') });
      void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'finance') });
      toast({ tone: 'success', title: options.successTitle });
      options.onDone?.(result);
    },
    onError: (error) => {
      // Un refus peut venir d'un lit pris entre-temps : on recharge le plan pour montrer l'état réel.
      void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'hospital') });
      const business = describeBusinessError(t, error);
      const server = !business && error instanceof ApiError && error.status && error.status < 500 ? error.message : undefined;
      toast({ tone: 'danger', title: business ?? server ?? t('module.saveFailed'), description: business || server ? undefined : t('module.saveFailedHint') });
    },
  });
}
