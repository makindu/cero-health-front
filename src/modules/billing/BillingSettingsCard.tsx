import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { useToast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { apiDeposits } from '../administration/deposits-api';
import { apiBilling } from './billing-api';

/**
 * Réglages de facturation : le dépôt par défaut rattaché aux prestations sans stock propre (actes, consultations).
 * Laissé sur « Automatique », le serveur prend le dépôt des autres lignes de la facture, puis le premier de l'établissement.
 */
export function BillingSettingsCard() {
  const { t } = useTranslation('finance');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  const settingsKey = queryKeys.scoped(activeFacilityId, 'billing', 'settings');
  const settings = useQuery({ queryKey: settingsKey, queryFn: apiBilling.settings });
  const deposits = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'deposits', 'list'), queryFn: apiDeposits.list });
  const [value, setValue] = useState('');
  useEffect(() => { if (settings.data) setValue(settings.data.defaultDepositId ?? ''); }, [settings.data]);

  const save = useMutation({
    mutationFn: () => apiBilling.setDefaultDeposit(value),
    onSuccess: (s) => {
      queryClient.setQueryData(settingsKey, s);
      toast({ tone: 'success', title: t('apiBilling.settingsSaved', { defaultValue: 'Réglages enregistrés' }) });
    },
    onError: (error) => toast({ tone: 'danger', title: error instanceof ApiError ? error.message : t('module.saveFailed'), description: error instanceof ApiError ? undefined : t('module.saveFailedHint') }),
  });
  const dirty = settings.data !== undefined && value !== (settings.data.defaultDepositId ?? '');

  return (
    <Card>
      <form className="flex flex-wrap items-end gap-3 p-4" onSubmit={(e) => { e.preventDefault(); if (dirty && !save.isPending) save.mutate(); }}>
        <div className="min-w-64 flex-1">
          <h2 className="text-sm font-semibold">{t('apiBilling.settingsTitle', { defaultValue: 'Réglages de facturation' })}</h2>
          <p className="mb-2 text-sm text-muted-foreground">{t('apiBilling.settingsHint', { defaultValue: "Dépôt rattaché aux prestations sans stock propre. « Automatique » : le serveur choisit le dépôt de la facture, sinon le premier de l'établissement." })}</p>
          <FormField label={t('apiBilling.defaultDeposit', { defaultValue: 'Dépôt par défaut' })}>
            {(c) => (
              <Select {...c} value={value} disabled={settings.isPending || deposits.isPending} onChange={(e) => setValue(e.target.value)} className="max-w-sm">
                <option value="">{t('apiBilling.depositAuto', { defaultValue: 'Automatique' })}</option>
                {(deposits.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            )}
          </FormField>
        </div>
        <Button type="submit" loading={save.isPending} disabled={!dirty}>{t('actions.save', { defaultValue: 'Enregistrer' })}</Button>
      </form>
    </Card>
  );
}
