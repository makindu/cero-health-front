import { ClipboardCheck, PackageCheck, Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '@/core/i18n/useFormatters';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { CommandButton } from '../_shared/command-button';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { PrescriptionStatusBadge } from './columns';
import { prescriptionService, type Prescription } from './data';
import { formatQty } from '@/utils/numbers';

/** Contenu de la fiche d'une prescription (partagé avec la pharmacie). */
export function PrescriptionDetail({ prescription: p }: { prescription: Prescription }) {
  const { t } = useTranslation('prescriptions');
  const f = useFormatters();
  return (
    <div className="space-y-5">
      <DetailSection title={t('detail.summary')}>
        <DescriptionList
          items={[
            { label: t('columns.patient'), value: `${p.patientName} (${p.patientId})` },
            { label: t('detail.reference'), value: p.id },
            { label: t('columns.date'), value: f.dateTime(p.date) },
            { label: t('columns.practitioner'), value: p.practitioner },
            { label: t('columns.status'), value: <PrescriptionStatusBadge status={p.status} /> },
          ]}
        />
      </DetailSection>
      <DetailSection title={t('detail.items')}>
        <ul className="divide-y divide-border text-sm">
          {p.items.map((item, index) => (
            <li key={`${item.label}-${index}`} className="flex justify-between py-1.5">
              <span>{item.label}</span>
              <span className="tabular-nums text-muted-foreground">× {formatQty(item.quantity)}</span>
            </li>
          ))}
        </ul>
      </DetailSection>
      <DetailSection title={t('detail.actions')}>
        <div className="flex flex-wrap gap-2">
          {p.status === 'toValidate' && (
            <CommandButton
              name="prescriptions"
              service={prescriptionService}
              id={p.id}
              action="validate"
              label={t('actions.validate')}
              permission={PERMISSIONS.prescriptions.validate}
              confirmTitle={t('actions.validateTitle')}
              confirmDescription={t('actions.validateBody')}
              icon={<ClipboardCheck className="size-4" />}
            />
          )}
          {p.status === 'validated' && (
            <CommandButton
              name="prescriptions"
              service={prescriptionService}
              id={p.id}
              action="dispense"
              label={t('actions.dispense')}
              permission={PERMISSIONS.prescriptions.dispense}
              confirmTitle={t('actions.dispenseTitle')}
              confirmDescription={t('actions.dispenseBody')}
              icon={<PackageCheck className="size-4" />}
              variant="primary"
            />
          )}
          {(p.status === 'toValidate' || p.status === 'validated') && (
            <CommandButton
              name="prescriptions"
              service={prescriptionService}
              id={p.id}
              action="cancel"
              variant="danger"
              label={t('actions.cancel')}
              permission={PERMISSIONS.prescriptions.create}
              confirmTitle={t('actions.cancelTitle')}
              confirmDescription={t('actions.cancelBody')}
              icon={<Ban className="size-4" />}
            />
          )}
        </div>
      </DetailSection>
    </div>
  );
}
