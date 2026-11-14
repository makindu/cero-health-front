import { useTranslation } from 'react-i18next';
import type { Column } from '@/components/tables/data-table';
import { useFormatters } from '@/core/i18n/useFormatters';
import { PatientHistoryTable } from '../_shared/PatientHistoryTable';
import { consultationService, type Consultation } from './data';
import { PersonName } from '@/components/ui/avatar';

/** Historique des consultations d'un patient (cadre administratif : date, praticien, motif, statut). */
export function PatientConsultations({ patientId, caption }: { patientId: string; caption: string }) {
  const { t } = useTranslation('consultations');
  const f = useFormatters();
  const columns: Column<Consultation>[] = [
    { id: 'date', header: t('columns.date'), cell: (c) => f.dateTime(c.date), primary: true },
    { id: 'practitioner', header: t('columns.practitioner'), cell: (c) => <PersonName name={c.practitioner} size="sm" strong={false} /> },
    { id: 'service', header: t('columns.service'), cell: (c) => t(`services.${c.service}`) },
    { id: 'reason', header: t('columns.reason'), cell: (c) => t(`reason.${c.reason}`) },
    { id: 'status', header: t('columns.status'), cell: (c) => t(`status.${c.status}`) },
  ];
  return <PatientHistoryTable name="consultations" service={consultationService} patientId={patientId} caption={caption} columns={columns} sortColumn="date" />;
}
