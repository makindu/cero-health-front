import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { describeBusinessError } from '../_shared/business-error';
import { FINANCE_AVAILABLE } from '../finance/use-finance';
import { pharmacy } from './pharmacy';

export const PHARMACY_AVAILABLE = FINANCE_AVAILABLE;

function usePharmacyQuery<T>(part: string, fn: () => Promise<T>) {
  const { activeFacilityId } = usePreferences();
  return useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'pharmacy', part), queryFn: fn, enabled: PHARMACY_AVAILABLE });
}
export const usePharmacyQueue = () => usePharmacyQuery('queue', () => pharmacy.queue());
export const useDispensations = () => usePharmacyQuery('dispensations', () => pharmacy.dispensations());
export const usePharmacyStock = () => usePharmacyQuery('stock', () => pharmacy.stock());

/** Invalide pharmacie, prescriptions et finance : une dispensation touche les trois. */
export function usePharmacyMutation<I, R>(run: (input: I) => Promise<R>, options: { successTitle: string; onDone?: (result: R) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  return useMutation({
    mutationFn: run,
    onSuccess: (result) => {
      for (const scope of ['pharmacy', 'prescriptions', 'finance']) void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, scope) });
      toast({ tone: 'success', title: options.successTitle });
      options.onDone?.(result);
    },
    onError: (error) => {
      const business = describeBusinessError(t, error);
      toast({ tone: 'danger', title: business ?? t('module.saveFailed'), description: business ? undefined : t('module.saveFailedHint') });
    },
  });
}
