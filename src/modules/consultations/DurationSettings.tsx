import { Clock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { ActionFormDialog } from '../_shared/action-form-dialog';
import { BusinessRuleError } from '../_shared/business-error';
import { CONSULTATION_DURATION_KEY, DEFAULT_CONSULTATION_DAYS, useInvalidateSetting, useSetting, validDuration, writeSetting } from '../settings/app-settings';

/** Réglage de la durée d'une consultation. N'affecte que les consultations ouvertes APRÈS la modification. */
export function DurationSettings() {
  const { t } = useTranslation('consultations');
  const [open, setOpen] = useState(false);
  const setting = useSetting(CONSULTATION_DURATION_KEY, String(DEFAULT_CONSULTATION_DAYS));
  const refresh = useInvalidateSetting(CONSULTATION_DURATION_KEY);
  const current = setting.data ?? String(DEFAULT_CONSULTATION_DAYS);
  return (
    <Can permission={PERMISSIONS.administration.manageSettings}>
      <Button variant="outline" leftIcon={<Clock className="size-4" />} onClick={() => setOpen(true)}>{t('duration.button', { count: Number(current) })}</Button>
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
            await writeSetting(CONSULTATION_DURATION_KEY, String(days));
            await refresh();
            return { isDemo: false };
          }}
        />
      )}
    </Can>
  );
}
