import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/forms/form-field';
import { Textarea } from '@/components/forms/controls';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { ActionDialog } from '../finance/ActionDialog';
import { rx } from './rx';
import type { Rx } from './rx-rules';
import { RxStatusBadge } from './RxStatusBadge';
import { useRxMutation } from './use-rx';
import { formatQty } from '@/utils/numbers';

export function RxDetail({ prescription, onClose }: { prescription: Rx | undefined; onClose: () => void }) {
  const { t } = useTranslation('prescriptions');
  const f = useFormatters();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const validate = useRxMutation(rx.validate, { successTitle: t('done.validate') });
  const cancel = useRxMutation(rx.cancel, { successTitle: t('done.cancel'), onDone: () => { setCancelling(false); setReason(''); } });
  if (!prescription) return <Dialog open={false} onClose={onClose} ariaLabel={t('detail.prescription')} />;
  const p = prescription;
  return (
    <Dialog open onClose={onClose} title={`${p.number} — ${p.patientName}`} description={t('detail.description')}>
      <div className="space-y-5">
        <DetailSection title={t('detail.summary')}>
          <DescriptionList items={[
            { label: t('columns.status'), value: <RxStatusBadge status={p.status} /> },
            { label: t('columns.practitioner'), value: `${p.prescriber} · ${f.dateTime(p.prescribedAt)}` },
            { label: t('create.consultation'), value: p.consultationId },
            { label: t('create.note'), value: p.note },
            { label: t('detail.validatedBy'), value: p.validation ? `${p.validation.by} · ${f.dateTime(p.validation.at)}` : '' },
            { label: t('detail.cancelledBy'), value: p.cancellation ? `${p.cancellation.by} · ${p.cancellation.reason}` : '' },
          ]} />
        </DetailSection>
        <DetailSection title={t('detail.items')}>
          <ul className="divide-y divide-border text-sm">
            {p.items.map((i, k) => (
              <li key={k} className="py-2">
                <div className="flex justify-between font-medium"><span>{i.label}</span><span className="tabular-nums">× {formatQty(i.quantity)}{i.unit ? ` ${i.unit}` : ''}</span></div>
                <div className="text-xs text-muted-foreground">{[i.dosage, i.frequency, i.duration].filter(Boolean).join(' · ')}{i.instructions ? ` — ${i.instructions}` : ''}</div>
              </li>
            ))}
          </ul>
        </DetailSection>
        <DetailSection title={t('detail.actions')}>
          <div className="flex flex-wrap gap-2">
            {p.status === 'toValidate' && <Can permission={P.prescriptions.validate}><Button loading={validate.isPending} onClick={() => validate.mutate({ id: p.id })}>{t('actions.validate')}</Button></Can>}
            {p.status !== 'cancelled' && <Can permission={[P.prescriptions.create, P.prescriptions.validate]}><Button variant="outline" onClick={() => setCancelling(true)}>{t('actions.cancel')}</Button></Can>}
          </div>
          <p className="text-xs text-muted-foreground">{t('detail.dispenseNotice')}</p>
        </DetailSection>
      </div>
      <ActionDialog open={cancelling} onClose={() => setCancelling(false)} tone="danger" title={t('actions.cancelTitle')} description={t('actions.cancelBody')} submitLabel={t('actions.cancel')} pending={cancel.isPending} canSubmit={reason.trim() !== ''}
        onSubmit={() => cancel.mutate({ id: p.id, reason })}>
        <FormField label={t('actions.reason')} required>{(c) => <Textarea {...c} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormField>
      </ActionDialog>
    </Dialog>
  );
}
