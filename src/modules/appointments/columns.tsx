import { Ban, CalendarCheck, CalendarClock, CircleCheck, CircleUserRound, Hourglass, Stethoscope, UserX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Column } from '@/components/tables/data-table';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import { useFormatters } from '@/core/i18n/useFormatters';
import type { Appointment, AppointmentStatus } from './data';

const STATUS_STYLE: Record<AppointmentStatus, { tone: StatusTone; icon: typeof Ban }> = {
  scheduled: { tone: 'neutral', icon: CalendarClock },
  confirmed: { tone: 'info', icon: CalendarCheck },
  arrived: { tone: 'warning', icon: CircleUserRound },
  waiting: { tone: 'warning', icon: Hourglass },
  inProgress: { tone: 'info', icon: Stethoscope },
  done: { tone: 'success', icon: CircleCheck },
  cancelled: { tone: 'neutral', icon: Ban },
  noShow: { tone: 'danger', icon: UserX },
};

export const APPOINTMENT_STATUSES = Object.keys(STATUS_STYLE) as AppointmentStatus[];

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const { t } = useTranslation('appointments');
  const style = STATUS_STYLE[status];
  return (
    <StatusBadge tone={style.tone} icon={style.icon}>
      {t(`status.${status}`)}
    </StatusBadge>
  );
}

/** Colonnes communes à la page des rendez-vous et à l'onglet « Rendez-vous » d'un patient. */
export function useAppointmentColumns(options: { withPatient?: boolean } = {}): Column<Appointment>[] {
  const { t } = useTranslation('appointments');
  const f = useFormatters();
  const { withPatient = true } = options;
  return [
    {
      id: 'startsAt',
      header: t('columns.date'),
      cell: (a) => f.dateTime(a.startsAt),
      sortable: true,
      primary: !withPatient,
    },
    ...(withPatient
      ? [{ id: 'patientName', header: t('columns.patient'), cell: (a: Appointment) => a.patientName, sortable: true, primary: true }]
      : []),
    { id: 'service', header: t('columns.service'), cell: (a) => t(`services.${a.service}`) },
    { id: 'practitioner', header: t('columns.practitioner'), cell: (a) => a.practitioner },
    { id: 'reason', header: t('columns.reason'), cell: (a) => t(`reason.${a.reason}`) },
    { id: 'status', header: t('columns.status'), cell: (a) => <AppointmentStatusBadge status={a.status} /> },
  ];
}
