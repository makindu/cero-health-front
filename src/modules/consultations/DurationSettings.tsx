import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { queryKeys } from '@/core/api/query-client';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { referenceFromApi } from '../_shared/reference-data';
import { apiBilling } from '../billing/billing-api';
import { ActionFormDialog } from '../_shared/action-form-dialog';
import { BusinessRuleError } from '../_shared/business-error';
import { CONSULTATION_DURATION_KEY, DEFAULT_CONSULTATION_DAYS, useInvalidateSetting, useSetting, validDuration, writeSetting } from '../settings/app-settings';

/** Réglage de la durée d'une consultation (écran Administration). N'affecte que les consultations ouvertes APRÈS la modification. */
export function DurationSettings() {
  const { t } = useTranslation('consultations');
  const [open, setOpen] = useState(false);
  const setting = useSetting(CONSULTATION_DURATION_KEY, String(DEFAULT_CONSULTATION_DAYS));
  const refresh = useInvalidateSetting(CONSULTATION_DURATION_KEY);
  // API réelle : la durée est un réglage de l'établissement ENREGISTRÉ EN BASE (partagé par tous les postes). Mode local : appareil.
  const api = referenceFromApi();
  const { activeFacilityId } = usePreferences();
  const queryClient = useQueryClient();
  const serverKey = queryKeys.scoped(activeFacilityId, 'billing', 'settings');
  const server = useQuery({ queryKey: serverKey, queryFn: apiBilling.settings, enabled: api });
  const current = api ? String(server.data?.consultationValidityDays ?? DEFAULT_CONSULTATION_DAYS) : (setting.data ?? String(DEFAULT_CONSULTATION_DAYS));
  return (
    <Can permission={PERMISSIONS.administration.manageSettings}>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="text-sm font-semibold">{t('duration.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('duration.hint')}</p>
          </div>
          <Button variant="outline" leftIcon={<Clock className="size-4" />} onClick={() => setOpen(true)}>{t('duration.button', { count: Number(current) })}</Button>
        </div>
      </Card>
      {open && (
        <ActionFormDialog
          open
          onClose={() => setOpen(false)}
          invalidate={['consultations']}
          title={t('duration.title')}
          description={t('duration.hint')}
          submitLabel={t('duration.submit')}
          fields={[{ name: 'days', label: t('duration.field'), type: 'number', required: true }]}
          defaultValues={{ days: current }}
          execute={async (v) => {
            const days = validDuration(v.days);
            if (days === null) throw new BusinessRuleError('consultationDurationInvalid');
            if (api) {
              await apiBilling.setConsultationValidity(days);
              await queryClient.invalidateQueries({ queryKey: serverKey });
            } else {
              await writeSetting(CONSULTATION_DURATION_KEY, String(days));
              await refresh();
            }
            return { isDemo: false };
          }}
        />
      )}
    </Can>
  );
}
