import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { describeBusinessError } from '../_shared/business-error';
import { FINANCE_AVAILABLE } from '../finance/use-finance';
import { hospital, hospitalAccount } from './hospital';

export const HOSPITAL_AVAILABLE = FINANCE_AVAILABLE;

export function useHospitalBoard() {
  const { activeFacilityId } = usePreferences();
  return useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'hospital', 'board'), queryFn: () => hospital.board(), enabled: HOSPITAL_AVAILABLE });
}

/** Compte d'une admission ; sous la portée `finance` pour se rafraîchir dès qu'un paiement est encaissé. */
export function useAdmissionAccount(admissionId: string | undefined) {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'finance', 'admission-account', admissionId),
    queryFn: () => hospitalAccount.account(admissionId ?? ''),
    enabled: HOSPITAL_AVAILABLE && Boolean(admissionId),
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
      toast({ tone: 'danger', title: business ?? t('module.saveFailed'), description: business ? undefined : t('module.saveFailedHint') });
    },
  });
}
