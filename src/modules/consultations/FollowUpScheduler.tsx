import { CalendarPlus, CalendarSearch } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { ActionFormDialog, type ValidationProblem } from '../_shared/action-form-dialog';
import { useResourceItem } from '../_shared/use-resource';
import { RescheduleDialog, useSlotCheck } from '../appointments/AppointmentDialogs';
import { AppointmentStatusBadge } from '../appointments/columns';
import { appointmentService } from '../appointments/data';
import { addDays, localDayKey, toIso } from '../appointments/scheduling';
import { Panel } from './clinical/fields';
import type { Consultation } from './data';

const REASONS = ['followUp', 'control', 'vaccination', 'prenatal'] as const;
const DURATIONS = ['20', '30', '45', '60'] as const;

export interface FollowUpValue { startsAt: string; appointmentId: string }

/**
 * Prochain rendez-vous depuis la consultation : date ET heure obligatoires, créneau vérifié (praticien libre, patient libre),
 * et le rendez-vous est créé dans le calendrier — il n'est plus une simple note. Le lien est conservé dans le dossier.
 */
export function FollowUpScheduler({ consultation, value, readOnly, onScheduled }: {
  consultation: Pick<Consultation, 'id' | 'patientId' | 'practitioner' | 'service'>;
  value: FollowUpValue;
  readOnly: boolean;
  /** Appelé quand le rendez-vous vient d'être créé : l'appelant enregistre le dossier pour ne pas perdre le lien. */
  onScheduled: (next: FollowUpValue) => void | Promise<void>;
}) {
  const { t } = useTranslation('consultations');
  const f = useFormatters();
  const check = useSlotCheck();
  const [dialog, setDialog] = useState<'new' | 'reschedule' | null>(null);
  const linked = useResourceItem('appointments', appointmentService, value.appointmentId || undefined);
  const item = linked.data?.item;
  const active = item !== undefined && item.status !== 'cancelled' && item.status !== 'noShow';
  const legacy = !value.appointmentId && value.startsAt !== '';
  const today = localDayKey(new Date());

  const validate = async (v: Record<string, string>): Promise<ValidationProblem | null> => {
    const startsAt = toIso(v.date ?? '', v.time ?? '');
    if (!v.date || !v.time || Number.isNaN(Date.parse(startsAt))) return { message: t('clinical.followUp.dateTimeRequired') };
    if (Date.parse(startsAt) <= Date.now()) return { message: t('clinical.followUp.pastSlot') };
    return check(v.practitioner ?? '', startsAt, Number(v.duration ?? '30'));
  };

  async function created(v: Record<string, string>): Promise<void> {
    const startsAt = toIso(v.date ?? '', v.time ?? '');
    const day = localDayKey(startsAt);
    const matches = (await appointmentService.list({ page: 1, perPage: 200, search: '', filters: { from: day, to: day, patientId: consultation.patientId }, sort: null })).rows
      .filter((a) => a.startsAt === startsAt && a.practitioner === v.practitioner && a.status === 'scheduled');
    const found = matches[matches.length - 1];
    await onScheduled({ startsAt: found?.startsAt ?? startsAt, appointmentId: found?.id ?? '' });
  }

  return (
    <Panel title={t('clinical.followUp.title')}>
      {value.appointmentId && linked.isPending && <p className="text-sm text-muted-foreground">…</p>}
      {active && item && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid="followup-summary">
          <span className="font-medium">{f.dateTime(item.startsAt)}</span>
          <span>{t('clinical.followUp.duration', { count: item.durationMin })}</span>
          <span>{item.practitioner}</span>
          <AppointmentStatusBadge status={item.status} />
        </div>
      )}
      {item && !active && <p role="status" className="text-sm text-warning-ink">{t('clinical.followUp.cancelled', { when: f.dateTime(item.startsAt) })}</p>}
      {legacy && !item && <p className="text-sm text-muted-foreground">{t('clinical.followUp.legacy', { date: value.startsAt })}</p>}
      {!active && !legacy && !(value.appointmentId && linked.isPending) && <p className="text-sm text-muted-foreground">{t('clinical.followUp.none')}</p>}
      <div className="flex flex-wrap gap-2">
        {!readOnly && !active && (
          <Can permission={PERMISSIONS.appointments.create} fallback={<p className="text-xs text-muted-foreground">{t('clinical.followUp.noPermission')}</p>}>
            <Button leftIcon={<CalendarPlus className="size-4" />} onClick={() => setDialog('new')}>{t('clinical.followUp.schedule')}</Button>
          </Can>
        )}
        {!readOnly && active && item && (
          <Can permission={PERMISSIONS.appointments.update}>
            <Button variant="outline" onClick={() => setDialog('reschedule')}>{t('clinical.followUp.reschedule')}</Button>
          </Can>
        )}
        <Link to="/appointments" className={buttonVariants('outline')}><CalendarSearch aria-hidden className="size-4" />{t('clinical.followUp.openCalendar')}</Link>
      </div>
      <p className="text-xs text-muted-foreground">{t('clinical.followUp.hint')}</p>
      <ActionFormDialog
        open={dialog === 'new'}
        onClose={() => setDialog(null)}
        invalidate={['appointments']}
        title={t('clinical.followUp.dialogTitle')}
        description={t('clinical.followUp.dialogHint')}
        submitLabel={t('clinical.followUp.submit')}
        fields={[
          { name: 'practitioner', label: t('appointments:fields.practitioner'), type: 'practitioner', required: true },
          { name: 'reason', label: t('appointments:fields.reason'), type: 'select', required: true, options: REASONS.map((r) => ({ value: r, label: t(`appointments:reason.${r}`) })) },
          { name: 'date', label: t('appointments:fields.date'), type: 'date', required: true },
          { name: 'time', label: t('appointments:fields.time'), type: 'time', required: true },
          { name: 'duration', label: t('appointments:fields.duration'), type: 'select', required: true, options: DURATIONS.map((d) => ({ value: d, label: t('appointments:detail.minutes', { count: Number(d) }) })) },
        ]}
        defaultValues={{ practitioner: consultation.practitioner, reason: 'followUp', date: addDays(today, 7), time: '09:00', duration: '30' }}
        validate={validate}
        onDone={created}
        execute={(v) => appointmentService.create({
          patient: consultation.patientId, service: consultation.service, practitioner: v.practitioner ?? '', reason: v.reason ?? 'followUp',
          startsAt: toIso(v.date ?? '', v.time ?? ''), durationMin: v.duration ?? '30', fromConsultation: consultation.id,
        })}
      />
      {dialog === 'reschedule' && item && <RescheduleDialog appointment={item} open onClose={() => setDialog(null)} />}
    </Panel>
  );
}
