import { UserCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { ActionFormDialog } from '../_shared/action-form-dialog';
import { appointmentService, type Appointment } from './data';

/**
 * Patient sans médecin désigné : l'accueil doit choisir chez quel médecin il va avant de l'appeler.
 * Le patient entre ainsi dans la file d'attente de ce médecin (« Ma file d'attente ») ; son statut ne change pas.
 * Le serveur refuse d'ailleurs l'appel en consultation tant qu'aucun médecin n'est désigné.
 */
export function AssignPractitionerButton({ appointment, label, change = false }: { appointment: Appointment; label?: string; change?: boolean }) {
  const { t } = useTranslation('appointments');
  const [open, setOpen] = useState(false);
  return (
    <Can permission={PERMISSIONS.appointments.checkIn}>
      <Button size="sm" variant={change ? 'outline' : 'primary'} leftIcon={<UserCheck className="size-4" />} onClick={() => setOpen(true)}>
        {label ?? (change ? t('assign.change') : t('assign.button'))}
      </Button>
      <ActionFormDialog
        open={open}
        onClose={() => setOpen(false)}
        invalidate={['appointments', 'triage']}
        title={change ? t('assign.changeTitle') : t('assign.title')}
        description={t('assign.hint', { name: appointment.patientName })}
        submitLabel={change ? t('assign.changeSubmit') : t('assign.submit')}
        fields={[{ name: 'practitioner', label: t('fields.practitioner'), type: 'practitioner', required: true, span: 2 }]}
        defaultValues={change ? { practitioner: appointment.practitioner } : undefined}
        execute={(v) => appointmentService.command(appointment.id, 'assign', { practitioner: v.practitioner ?? '' })}
      />
    </Can>
  );
}
