import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { describeBusinessError } from '../_shared/business-error';
import { FINANCE_AVAILABLE } from '../finance/use-finance';
import { rx } from './rx';

export const RX_AVAILABLE = FINANCE_AVAILABLE;

export function useRxList() {
  const { activeFacilityId } = usePreferences();
  return useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'prescriptions', 'list'), queryFn: () => rx.list(), enabled: RX_AVAILABLE });
}

export function useRxMutation<I, R>(run: (input: I) => Promise<R>, options: { successTitle: string; onDone?: (result: R) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  return useMutation({
    mutationFn: run,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'prescriptions') });
      toast({ tone: 'success', title: options.successTitle });
      options.onDone?.(result);
    },
    onError: (error) => {
      const business = describeBusinessError(t, error);
      toast({ tone: 'danger', title: business ?? t('module.saveFailed'), description: business ? undefined : t('module.saveFailedHint') });
    },
  });
}
