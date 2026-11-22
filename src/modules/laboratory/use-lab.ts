import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { describeBusinessError } from '../_shared/business-error';
import { FINANCE_AVAILABLE } from '../finance/use-finance';
import { ApiError } from '@/core/api';
import { referenceFromApi } from '../_shared/reference-data';
import { lab } from './lab';

export const LAB_AVAILABLE = FINANCE_AVAILABLE || referenceFromApi();

export function useLabOrders() {
  const { activeFacilityId } = usePreferences();
  return useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'laboratory', 'orders'), queryFn: () => lab.list(), enabled: LAB_AVAILABLE });
}

export function useLabCatalog() {
  const { activeFacilityId } = usePreferences();
  return useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'laboratory', 'catalog'), queryFn: () => lab.catalog(), enabled: LAB_AVAILABLE });
}

/** Mutation laboratoire : invalide aussi les écrans financiers (la demande crée / annule une facture). */
export function useLabMutation<I, R>(run: (input: I) => Promise<R>, options: { successTitle: string; onDone?: (result: R) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  return useMutation({
    mutationFn: run,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'laboratory') });
      void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'finance') });
      toast({ tone: 'success', title: options.successTitle });
      options.onDone?.(result);
    },
    onError: (error) => {
      const business = describeBusinessError(t, error);
      const server = !business && error instanceof ApiError && error.status && error.status < 500 ? error.message : undefined;
      toast({ tone: 'danger', title: business ?? server ?? t('module.saveFailed'), description: business || server ? undefined : t('module.saveFailedHint') });
    },
  });
}
