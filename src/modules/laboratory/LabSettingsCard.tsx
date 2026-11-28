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
import { apiLabSettings } from './lab-settings-api';

type Choice = 'default' | 'yes' | 'no';

/**
 * Réglages du laboratoire de l'établissement : la validation d'un résultat doit-elle être faite par une autre personne que celle qui l'a saisi ?
 * Une personne qui a le droit « valider ses propres résultats » en est dispensée, quel que soit ce réglage.
 */
export function LabSettingsCard() {
  const { t } = useTranslation('administration');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  const key = queryKeys.scoped(activeFacilityId, 'lab', 'settings');
  const settings = useQuery({ queryKey: key, queryFn: apiLabSettings.get });
  const [choice, setChoice] = useState<Choice>('default');
  const current: Choice = settings.data ? (settings.data.overridden ? (settings.data.requireDistinctValidator ? 'yes' : 'no') : 'default') : 'default';
  useEffect(() => { if (settings.data) setChoice(current); }, [settings.data, current]);

  const save = useMutation({
    mutationFn: () => apiLabSettings.set(choice === 'default' ? null : choice === 'yes'),
    onSuccess: (s) => { queryClient.setQueryData(key, s); toast({ tone: 'success', title: t('lab.saved', { defaultValue: 'Réglage enregistré' }) }); },
    onError: (error) => toast({ tone: 'danger', title: error instanceof ApiError ? error.message : t('lab.saveFailed', { defaultValue: 'Enregistrement impossible' }) }),
  });
  const dirty = settings.data !== undefined && choice !== current;
  const defaultText = settings.data?.defaultRule ? t('lab.on', { defaultValue: 'oui' }) : t('lab.off', { defaultValue: 'non' });

  return (
    <Card>
      <form className="flex flex-wrap items-end gap-3 p-4" onSubmit={(e) => { e.preventDefault(); if (dirty && !save.isPending) save.mutate(); }}>
        <div className="min-w-64 flex-1">
          <h2 className="text-sm font-semibold">{t('lab.title', { defaultValue: 'Validation des résultats' })}</h2>
          <p className="mb-2 text-sm text-muted-foreground">{t('lab.hint', { defaultValue: 'Faut-il qu\'une autre personne valide un résultat saisi ? Les personnes qui ont le droit « valider ses propres résultats » en sont dispensées.' })}</p>
          <FormField label={t('lab.distinct', { defaultValue: 'Valideur différent de la personne qui a saisi' })}>
            {(c) => (
              <Select {...c} value={choice} disabled={settings.isPending} onChange={(e) => setChoice(e.target.value as Choice)} className="max-w-md">
                <option value="default">{t('lab.optDefault', { defaultValue: 'Règle par défaut de la plateforme (actuellement : {{value}})', value: defaultText })}</option>
                <option value="yes">{t('lab.optYes', { defaultValue: 'Oui : une autre personne doit valider' })}</option>
                <option value="no">{t('lab.optNo', { defaultValue: 'Non : la même personne peut saisir et valider' })}</option>
              </Select>
            )}
          </FormField>
        </div>
        <Button type="submit" loading={save.isPending} disabled={!dirty}>{t('lab.save', { defaultValue: 'Enregistrer' })}</Button>
      </form>
    </Card>
  );
}
