import { useTranslation } from 'react-i18next';
import { ActionFormDialog } from '../_shared/action-form-dialog';
import { useServiceOptions } from './service-options';
import { PRIORITIES, triageService } from '../nursing/data';
import { finance } from '../finance/finance';
import { patientRepo } from '../patients/data';
import { resolvePatient } from '../patients/local-rules';
import { appointmentService } from './data';
import { isDestinationAllowed } from './walkin';

/**
 * Accueil d'un patient sans rendez-vous : identification, motif, degré d'urgence, puis orientation
 * vers le triage infirmier ou directement vers un service. Sans API, rien n'est enregistré (mode démo).
 * Contrats cibles proposés : POST /health/triage (source = walkIn) ou POST /health/appointments (walkIn = true).
 */
export function WalkInDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('appointments');
  const serviceOptions = useServiceOptions();
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
        { name: 'service', label: t('walkIn.service'), type: 'select', options: serviceOptions, hint: t('walkIn.serviceHint') },
        { name: 'practitioner', label: t('walkIn.practitioner'), type: 'practitioner', hint: t('walkIn.practitionerHint'), span: 2 },
      ]}
      defaultValues={{ urgency: 'standard', destination: 'triage' }}
      validate={async (v) => {
        if (!isDestinationAllowed(v.urgency ?? '', v.destination ?? '')) return { message: t('walkIn.triageRequired') };
        if (v.destination === 'service' && !v.service) return { message: t('walkIn.serviceRequired') };
        // Frais de consultation : on prévient AVANT d'orienter (jamais pour une urgence vitale, qui ne doit pas attendre la caisse).
        if (v.urgency !== 'immediate' && v.urgency !== 'veryUrgent') {
          try {
            const patient = resolvePatient(v.patient ?? '', await patientRepo.list());
            const fee = await finance.feeStatusFor(patient.id);
            if (fee.state !== 'valid') return { message: t(fee.state === 'expired' ? 'walkIn.feeExpired' : 'walkIn.feeNone', { name: patient.fullName }), overridable: true };
          } catch {
            /* patient introuvable ou finance indisponible : le contrôle métier de l'enregistrement fait foi */
          }
        }
        return null;
      }}
      overrideLabel={t('walkIn.feeProceed')}
      execute={(v) =>
        v.destination === 'triage'
          ? triageService.create({ patient: v.patient ?? '', reason: v.reason ?? '', priority: v.urgency ?? 'standard', source: 'walkIn' })
          : appointmentService.create({ patient: v.patient ?? '', reason: v.reason ?? '', service: v.service ?? '', urgency: v.urgency ?? 'standard', walkIn: 'true', practitioner: v.practitioner ?? '' })
      }
    />
  );
}
