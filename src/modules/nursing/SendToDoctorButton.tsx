import { Stethoscope } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { ActionFormDialog } from '../_shared/action-form-dialog';
import { triageService, type TriageEntry } from './data';

/**
 * Fin du triage : l'infirmier choisit le médecin qui verra le patient.
 * Le triage est clos et le patient apparaît aussitôt dans « Ma file d'attente » de ce médecin (mise à jour en direct).
 */
export function SendToDoctorButton({ entry }: { entry: TriageEntry }) {
  const { t } = useTranslation('nursing');
  const [open, setOpen] = useState(false);
  return (
    <Can permission={PERMISSIONS.nursing.record}>
      <Button size="sm" variant="primary" leftIcon={<Stethoscope className="size-4" />} onClick={() => setOpen(true)}>
        {t('sendToDoctor.button')}
      </Button>
      <ActionFormDialog
        open={open}
        onClose={() => setOpen(false)}
        invalidate={['triage', 'appointments']}
        title={t('sendToDoctor.title')}
        description={t('sendToDoctor.hint', { name: entry.patientName })}
        submitLabel={t('sendToDoctor.submit')}
        fields={[{ name: 'practitioner', label: t('sendToDoctor.doctor'), type: 'practitioner', required: true, span: 2 }]}
        execute={(v) => triageService.command(entry.id, 'send-to-doctor', { practitioner: v.practitioner ?? '' })}
      />
    </Can>
  );
}
