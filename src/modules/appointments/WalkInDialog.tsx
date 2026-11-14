import { useTranslation } from 'react-i18next';
import { ActionFormDialog } from '../_shared/action-form-dialog';
import { SERVICE_KEYS } from '../_shared/demo-people';
import { PRIORITIES, triageService } from '../nursing/data';
import { appointmentService } from './data';
import { isDestinationAllowed } from './walkin';

/**
 * Accueil d'un patient sans rendez-vous : identification, motif, degré d'urgence, puis orientation
 * vers le triage infirmier ou directement vers un service. Sans API, rien n'est enregistré (mode démo).
 * Contrats cibles proposés : POST /health/triage (source = walkIn) ou POST /health/appointments (walkIn = true).
 */
export function WalkInDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('appointments');
  return (
    <ActionFormDialog
      open={open}
      onClose={onClose}
      invalidate={['appointments', 'triage']}
      title={t('walkIn.title')}
      description={t('walkIn.description')}
      submitLabel={t('walkIn.submit')}
      fields={[
        { name: 'patient', label: t('fields.patient'), type: 'patient', required: true, hint: t('fields.patientHint'), span: 2 },
        { name: 'reason', label: t('walkIn.reason'), type: 'textarea', required: true, span: 2 },
        { name: 'urgency', label: t('walkIn.urgency'), type: 'select', required: true, options: PRIORITIES.map((p) => ({ value: p, label: t(`walkIn.priority.${p}`) })) },
        {
          name: 'destination',
          label: t('walkIn.destination'),
          type: 'select',
          required: true,
          options: [
            { value: 'triage', label: t('walkIn.toTriage') },
            { value: 'service', label: t('walkIn.toService') },
          ],
        },
        { name: 'service', label: t('walkIn.service'), type: 'select', options: SERVICE_KEYS.map((k) => ({ value: k, label: t(`services.${k}`) })), hint: t('walkIn.serviceHint') },
      ]}
      defaultValues={{ urgency: 'standard', destination: 'triage' }}
      validate={async (v) => {
        if (!isDestinationAllowed(v.urgency ?? '', v.destination ?? '')) return { message: t('walkIn.triageRequired') };
        if (v.destination === 'service' && !v.service) return { message: t('walkIn.serviceRequired') };
        return null;
      }}
      execute={(v) =>
        v.destination === 'triage'
          ? triageService.create({ patient: v.patient ?? '', reason: v.reason ?? '', priority: v.urgency ?? 'standard', source: 'walkIn' })
          : appointmentService.create({ patient: v.patient ?? '', reason: v.reason ?? '', service: v.service ?? '', urgency: v.urgency ?? 'standard', walkIn: 'true' })
      }
    />
  );
}
