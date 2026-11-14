import { useTranslation } from 'react-i18next';
import { useFormatters } from '@/core/i18n/useFormatters';
import { ResourcePage } from '../_shared/ResourcePage';
import { SERVICE_KEYS } from '../_shared/demo-people';
import { AppointmentDetail } from './AppointmentDetail';
import { APPOINTMENT_STATUSES, useAppointmentColumns } from './columns';
import { appointmentService, type Appointment } from './data';

/** Liste filtrable des rendez-vous (recherche, période, statut, service, praticien). */
export function AppointmentsList() {
  const { t } = useTranslation('appointments');
  const f = useFormatters();
  const columns = useAppointmentColumns();
  const serviceOptions = SERVICE_KEYS.map((key) => ({ value: key, label: t(`services.${key}`) }));

  return (
    <ResourcePage<Appointment>
      embedded
      name="appointments"
      service={appointmentService}
      title={t('title')}
      searchLabel={t('search')}
      columns={columns}
      defaultSort={{ columnId: 'startsAt', direction: 'asc' }}
      initialFilters={{ period: 'today' }}
      filters={[
        {
          id: 'period',
          label: t('filters.period'),
          options: [
            { value: 'today', label: t('period.today') },
            { value: 'upcoming', label: t('period.upcoming') },
            { value: 'past', label: t('period.past') },
          ],
        },
        { id: 'status', label: t('filters.status'), options: APPOINTMENT_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })) },
        { id: 'service', label: t('filters.service'), options: serviceOptions },
      ]}
      detailTitle={(a) => `${a.patientName} · ${f.dateTime(a.startsAt)}`}
      detailPerson={(a) => a.patientName}
      renderDetail={(a) => <AppointmentDetail appointment={a} />}
    />
  );
}
