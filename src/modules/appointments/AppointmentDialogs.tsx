import { useTranslation } from 'react-i18next';
import { useFormatters } from '@/core/i18n/useFormatters';
import { ActionFormDialog, type ValidationProblem } from '../_shared/action-form-dialog';
import { SERVICE_KEYS } from '../_shared/demo-people';
import { appointmentService, type Appointment } from './data';
import { findConflicts, localDayKey, nextFreeSlot, timeKey, toIso } from './scheduling';

const REASONS = ['firstVisit', 'followUp', 'control', 'vaccination', 'prenatal'] as const;
const CHANGE_REASONS = ['patientRequest', 'practitionerUnavailable', 'facilityClosure', 'other'] as const;
const DURATIONS = ['20', '30', '45', '60'] as const;

/**
 * Contrôle de conflit AVANT envoi : lit les rendez-vous du praticien le jour voulu via le contrat de liste existant.
 * C'est un confort : l'API doit refuser un chevauchement (409), message alors affiché par la fenêtre.
 * Si la lecture échoue, on ne bloque pas (le serveur reste l'arbitre).
 */
export function useSlotCheck() {
  const { t } = useTranslation('appointments');
  const f = useFormatters();
  return async (practitioner: string, startsAt: string, durationMin: number, ignoreId?: string): Promise<ValidationProblem | null> => {
    const day = localDayKey(startsAt);
    let existing: Appointment[];
    try {
      existing = (
        await appointmentService.list({ page: 1, perPage: 200, search: '', filters: { from: day, to: day, practitioner }, sort: null })
      ).rows;
    } catch {
      return null;
    }
    const candidate = { practitioner, startsAt, durationMin, ignoreId };
    const conflicts = findConflicts(existing, candidate);
    if (conflicts.length === 0) return null;
    const free = nextFreeSlot(existing, candidate);
    return {
      message: (
        <div className="space-y-1">
          <p className="font-medium">{t('conflict.title', { name: practitioner })}</p>
          <ul className="list-disc ps-5">
            {conflicts.map((c) => (
              <li key={c.id}>
                {f.time(c.startsAt)} – {f.time(new Date(new Date(c.startsAt).getTime() + c.durationMin * 60000))} · {c.patientName}
              </li>
            ))}
          </ul>
          <p>{free ? t('conflict.suggest', { time: f.time(free) }) : t('conflict.noneLeft')}</p>
        </div>
      ),
    };
  };
}

const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function AppointmentCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('appointments');
  const check = useSlotCheck();
  const serviceOptions = SERVICE_KEYS.map((key) => ({ value: key, label: t(`services.${key}`) }));
  return (
    <ActionFormDialog
      open={open}
      onClose={onClose}
      invalidate={['appointments']}
      title={t('create.title')}
      submitLabel={t('create.submit')}
      fields={[
        { name: 'patient', label: t('fields.patient'), type: 'patient', required: true, hint: t('fields.patientHint'), span: 2 },
        { name: 'service', label: t('fields.service'), type: 'select', required: true, options: serviceOptions },
        { name: 'practitioner', label: t('fields.practitioner'), type: 'practitioner', required: true },
        { name: 'date', label: t('fields.date'), type: 'date', required: true },
        { name: 'time', label: t('fields.time'), type: 'time', required: true },
        { name: 'duration', label: t('fields.duration'), type: 'select', required: true, options: DURATIONS.map((d) => ({ value: d, label: t('detail.minutes', { count: Number(d) }) })) },
        { name: 'reason', label: t('fields.reason'), type: 'select', required: true, options: REASONS.map((r) => ({ value: r, label: t(`reason.${r}`) })) },
      ]}
      defaultValues={{ duration: '30' }}
      validate={(v) => check(v.practitioner ?? '', toIso(v.date ?? '', v.time ?? '00:00'), num(v.duration, 30))}
      // Contrat cible proposé : POST /health/appointments { …, startsAt, durationMin } ; 409 si le créneau est pris.
      execute={(v) => appointmentService.create({ ...v, startsAt: toIso(v.date ?? '', v.time ?? '00:00'), durationMin: String(num(v.duration, 30)) })}
    />
  );
}

/** Modification des informations d'un rendez-vous (service, praticien, créneau, durée, motif). */
export function AppointmentEditDialog({ appointment, open, onClose }: { appointment: Appointment; open: boolean; onClose: () => void }) {
  const { t } = useTranslation('appointments');
  const check = useSlotCheck();
  const serviceOptions = SERVICE_KEYS.map((key) => ({ value: key, label: t(`services.${key}`) }));
  return (
    <ActionFormDialog
      open={open}
      onClose={onClose}
      invalidate={['appointments']}
      title={t('edit.title')}
      description={t('edit.hint')}
      submitLabel={t('edit.submit')}
      fields={[
        { name: 'service', label: t('fields.service'), type: 'select', required: true, options: serviceOptions },
        { name: 'practitioner', label: t('fields.practitioner'), type: 'practitioner', required: true },
        { name: 'date', label: t('fields.date'), type: 'date', required: true },
        { name: 'time', label: t('fields.time'), type: 'time', required: true },
        { name: 'duration', label: t('fields.duration'), type: 'select', required: true, options: DURATIONS.map((d) => ({ value: d, label: t('detail.minutes', { count: Number(d) }) })) },
        { name: 'reason', label: t('fields.reason'), type: 'select', required: true, options: REASONS.map((r) => ({ value: r, label: t(`reason.${r}`) })) },
      ]}
      defaultValues={{
        service: appointment.service,
        practitioner: appointment.practitioner,
        date: localDayKey(appointment.startsAt),
        time: timeKey(appointment.startsAt),
        duration: String(appointment.durationMin),
        reason: appointment.reason,
      }}
      validate={(v) => check(v.practitioner ?? '', toIso(v.date ?? '', v.time ?? '00:00'), num(v.duration, 30), appointment.id)}
      // Contrat cible proposé : PUT /health/appointments/{id} ; 409 si le créneau est pris. Le serveur journalise l'ancien et le nouveau contenu.
      execute={(v) => appointmentService.update(appointment.id, { ...v, startsAt: toIso(v.date ?? '', v.time ?? '00:00'), durationMin: String(num(v.duration, 30)) })}
    />
  );
}

export function RescheduleDialog({ appointment, open, onClose }: { appointment: Appointment; open: boolean; onClose: () => void }) {
  const { t } = useTranslation('appointments');
  const check = useSlotCheck();
  return (
    <ActionFormDialog
      open={open}
      onClose={onClose}
      invalidate={['appointments']}
      title={t('reschedule.title')}
      description={t('reschedule.hint')}
      submitLabel={t('reschedule.submit')}
      fields={[
        { name: 'date', label: t('fields.date'), type: 'date', required: true },
        { name: 'time', label: t('fields.time'), type: 'time', required: true },
        { name: 'reason', label: t('reschedule.reason'), type: 'select', required: true, options: CHANGE_REASONS.map((r) => ({ value: r, label: t(`changeReason.${r}`) })), span: 2 },
        { name: 'note', label: t('reschedule.note'), type: 'textarea', span: 2 },
      ]}
      validate={(v) => check(appointment.practitioner, toIso(v.date ?? '', v.time ?? '00:00'), appointment.durationMin, appointment.id)}
      // Le serveur journalise : utilisateur, ancien créneau, nouveau créneau, motif.
      execute={(v) => appointmentService.command(appointment.id, 'reschedule', { startsAt: toIso(v.date ?? '', v.time ?? '00:00'), reason: v.reason ?? '', note: v.note ?? '' })}
    />
  );
}

export function CancelDialog({ appointment, open, onClose }: { appointment: Appointment; open: boolean; onClose: () => void }) {
  const { t } = useTranslation('appointments');
  return (
    <ActionFormDialog
      open={open}
      onClose={onClose}
      invalidate={['appointments']}
      title={t('cancel.title')}
      description={t('cancel.hint')}
      submitLabel={t('cancel.submit')}
      fields={[
        { name: 'reason', label: t('cancel.reason'), type: 'select', required: true, options: CHANGE_REASONS.map((r) => ({ value: r, label: t(`changeReason.${r}`) })), span: 2 },
        { name: 'note', label: t('reschedule.note'), type: 'textarea', span: 2 },
      ]}
      execute={(v) => appointmentService.command(appointment.id, 'cancel', { reason: v.reason ?? '', note: v.note ?? '' })}
    />
  );
}
