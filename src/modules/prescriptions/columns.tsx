import { Ban, CircleCheck, ClipboardCheck, ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Column } from '@/components/tables/data-table';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import { useFormatters } from '@/core/i18n/useFormatters';
import type { Prescription, PrescriptionStatus } from './data';

const STATUS_STYLE: Record<PrescriptionStatus, { tone: StatusTone; icon: typeof Ban }> = {
  toValidate: { tone: 'warning', icon: ClipboardList },
  validated: { tone: 'info', icon: ClipboardCheck },
  dispensed: { tone: 'success', icon: CircleCheck },
  cancelled: { tone: 'neutral', icon: Ban },
};
export const PRESCRIPTION_STATUSES = Object.keys(STATUS_STYLE) as PrescriptionStatus[];

export function PrescriptionStatusBadge({ status }: { status: PrescriptionStatus }) {
  const { t } = useTranslation('prescriptions');
  return (
    <StatusBadge tone={STATUS_STYLE[status].tone} icon={STATUS_STYLE[status].icon}>
      {t(`status.${status}`)}
    </StatusBadge>
  );
}

export function usePrescriptionColumns(): Column<Prescription>[] {
  const { t } = useTranslation('prescriptions');
  const f = useFormatters();
  return [
    { id: 'date', header: t('columns.date'), cell: (p) => f.dateTime(p.date), sortable: true },
    { id: 'patientName', header: t('columns.patient'), cell: (p) => <span className="font-medium">{p.patientName}</span>, sortable: true, primary: true },
    { id: 'practitioner', header: t('columns.practitioner'), cell: (p) => p.practitioner },
    { id: 'items', header: t('columns.items'), cell: (p) => t('itemsCount', { count: p.items.length }) },
    { id: 'status', header: t('columns.status'), cell: (p) => <PrescriptionStatusBadge status={p.status} /> },
  ];
}
