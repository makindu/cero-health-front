import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { queryKeys } from '@/core/api/query-client';
import { env } from '@/core/config/env';
import { decimalsOf } from '@/core/money/money';
import { useFormatters } from '@/core/i18n/useFormatters';
import { usePreferences } from '@/core/preferences/preferences-store';
import { describeBusinessError } from '../_shared/business-error';
import { patientRepo } from '../patients/data';
import { finance } from './finance';

export const FINANCE_AVAILABLE = env.localMode;

export function useFinanceSnapshot() {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'finance', 'snapshot'),
    queryFn: () => finance.snapshot(),
    enabled: FINANCE_AVAILABLE,
  });
}

export function useFeeStatus(patientId: string | undefined) {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'finance', 'fee', patientId),
    queryFn: () => finance.feeStatusFor(patientId ?? ''),
    enabled: FINANCE_AVAILABLE && Boolean(patientId),
  });
}

/** Montant en unités mineures → texte monétaire localisé. */
export function useMoney() {
  const f = useFormatters();
  return (minor: number, currency = 'USD'): string => f.currency(minor / 10 ** decimalsOf(currency), currency);
}

/**
 * Mutation financière : invalide les écrans financiers, affiche un refus métier traduit ou un échec générique.
 * Ne présente jamais comme enregistré ce qui a été refusé.
 */
export function useFinanceMutation<I, R>(run: (input: I) => Promise<R>, options: { successTitle: string; onDone?: (result: R) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  return useMutation({
    mutationFn: run,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'finance') });
      toast({ tone: 'success', title: options.successTitle });
      options.onDone?.(result);
    },
    onError: (error) => {
      const business = describeBusinessError(t, error);
      toast({ tone: 'danger', title: business ?? t('module.saveFailed'), description: business ? undefined : t('module.saveFailedHint') });
    },
  });
}

/** Texte d'un refus métier (clé `common:business.*`) ou null. */
export function useBusinessMessage(): (error: unknown) => string | null {
  const { t } = useTranslation();
  return (error) => describeBusinessError(t, error);
}

/** Patients actifs (lecture locale) pour les sélecteurs de la facturation et des assurances. */
export function usePatients() {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'finance', 'patients'),
    queryFn: () => patientRepo.list(),
    enabled: FINANCE_AVAILABLE,
  });
}
