import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/badge';
import { FormField } from '@/components/forms/form-field';
import { Select, Textarea } from '@/components/forms/controls';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { ActionDialog } from '../finance/ActionDialog';
import { InvoiceStatusBadge } from '../finance/InvoiceStatusBadge';
import { useMoney } from '../finance/use-finance';
import { referenceFromApi, useStaffMembers } from '../_shared/reference-data';
import { pharmacy } from './pharmacy';
import type { DispensationView } from './pharmacy-service';
import { DispensationStatusBadge } from './StatusBadges';
import { usePharmacyMutation } from './use-pharmacy';
import { formatQty } from '@/utils/numbers';

export function DispensationDetail({ view, onClose }: { view: DispensationView | undefined; onClose: () => void }) {
  const { t } = useTranslation('pharmacy');
  const f = useFormatters();
  const money = useMoney();
  const [action, setAction] = useState<'exception' | 'cancel' | null>(null);
  const [text, setText] = useState('');
  const done = (): void => { setAction(null); setText(''); };
  const api = referenceFromApi();
  const staff = useStaffMembers().data ?? [];
  const witnesses = staff.filter((m) => ['doctor', 'nurse', 'midwife', 'pharmacist'].includes(m.type));
  const [witness, setWitness] = useState('');
  const mDispense = usePharmacyMutation(pharmacy.dispense, { successTitle: t('done.dispense'), onDone: () => setWitness('') });
  const mException = usePharmacyMutation(pharmacy.grantPaymentException, { successTitle: t('done.exception'), onDone: done });
  const mCancel = usePharmacyMutation(pharmacy.cancel, { successTitle: t('done.cancel'), onDone: done });
  if (!view) return <Dialog open={false} onClose={onClose} ariaLabel={t('dispensation.title')} />;
  const { dispensation: d, invoice } = view;
  return (
    <Dialog open onClose={onClose} title={`${d.number} — ${d.patientName}`} description={t('dispensation.description')}>
      <div className="space-y-5">
        <DetailSection title={t('dispensation.summary')}>
          <DescriptionList items={[
            { label: t('columns.status'), value: <DispensationStatusBadge status={d.status} /> },
            { label: t('columns.prescription'), value: d.rxNumber },
            { label: t('dispensation.preparedBy'), value: `${d.preparedBy} · ${f.dateTime(d.preparedAt)}` },
            { label: t('dispensation.dispensedBy'), value: d.dispensed ? `${d.dispensed.by} · ${f.dateTime(d.dispensed.at)}` : '' },
          ]} />
        </DetailSection>
        <DetailSection title={t('dispensation.lines')}>
          <ul className="divide-y divide-border text-sm">
            {d.lines.map((l, i) => (
              <li key={i} className="py-2">
                <div className="flex justify-between font-medium"><span>{l.itemLabel}</span><span className="tabular-nums">× {formatQty(l.quantity)}</span></div>
                {l.deviation && (
                  <div className="mt-1 rounded-md bg-warning-soft px-2 py-1 text-xs text-foreground">
                    <span className="font-medium">{l.deviation.kinds.map((x) => t(`prepare.deviation.${x}`)).join(' · ')}</span> — {l.deviation.reason}
                  </div>
                )}
                <div className="text-xs text-muted-foreground">{t('dispensation.forLine', { label: l.rxLabel })}{l.lots.length > 0 ? ` — ${l.lots.map((x) => `${x.lotNumber} ×${x.quantity}`).join(', ')}` : ''}</div>
              </li>
            ))}
          </ul>
        </DetailSection>
        <DetailSection title={t('dispensation.payment')}>
          {invoice ? (
            <DescriptionList items={[
              { label: t('dispensation.invoice'), value: <span className="inline-flex items-center gap-2">{invoice.invoice.number} <InvoiceStatusBadge status={invoice.status} /></span> },
              { label: t('dispensation.patientShare'), value: money(invoice.balances.patientDue, invoice.invoice.currency) },
              { label: t('dispensation.remaining'), value: money(Math.max(0, invoice.balances.patientBalance), invoice.invoice.currency) },
              { label: t('dispensation.gate'), value: <StatusBadge tone={view.paymentCleared ? 'success' : 'warning'}>{t(`payment.${view.paymentState}`)}</StatusBadge> },
            ]} />
          ) : api ? (
            <p className="text-sm"><StatusBadge tone={view.paymentCleared ? 'success' : 'warning'}>{t(`payment.${view.paymentState}`, { defaultValue: view.paymentState === 'waived' ? 'Sans paiement préalable' : view.paymentState === 'noInvoice' ? 'Pas de facture' : view.paymentState })}</StatusBadge></p>
          ) : <p className="text-sm text-danger-ink">{t('dispensation.noInvoice')}</p>}
          {d.paymentException && <p className="rounded-md bg-warning-soft p-3 text-sm text-warning-ink">{t('dispensation.exceptionBy', { by: d.paymentException.by, reason: d.paymentException.reason })}</p>}
          {d.cancellation && <p className="text-sm">{t('dispensation.cancelledBy', { by: d.cancellation.by, reason: d.cancellation.reason })}{d.cancellation.refundPending ? ` — ${t('dispensation.refundPending')}` : ''}</p>}
        </DetailSection>
        {d.status === 'prepared' && (
          <DetailSection title={t('dispensation.actions')}>
            {api && (
              <FormField label={t('dispensation.witness', { defaultValue: 'Second témoin (produit contrôlé)' })}>
                {(c) => (
                  <Select {...c} value={witness} onChange={(e) => setWitness(e.target.value)}>
                    <option value="">{t('dispensation.noWitness', { defaultValue: 'Aucun' })}</option>
                    {witnesses.map((m) => <option key={m.id} value={m.userId}>{m.name}</option>)}
                  </Select>
                )}
              </FormField>
            )}
            <div className="flex flex-wrap gap-2">
              <Can permission={P.pharmacy.dispense}>
                <Button loading={mDispense.isPending} disabled={!view.paymentCleared} onClick={() => mDispense.mutate({ id: d.id, ...(witness ? { witnessUserId: witness } : {}) })}>{t('dispensation.dispense')}</Button>
                <Button variant="outline" onClick={() => { setText(''); setAction('cancel'); }}>{t('dispensation.cancel')}</Button>
              </Can>
              {!view.paymentCleared && !d.paymentException && <Can permission={P.pharmacy.exception}><Button variant="outline" onClick={() => { setText(''); setAction('exception'); }}>{t('dispensation.exception')}</Button></Can>}
            </div>
            {!view.paymentCleared && <p className="text-xs text-muted-foreground">{t('dispensation.gateHint')}</p>}
          </DetailSection>
        )}
      </div>
      <ActionDialog open={action === 'exception'} onClose={() => setAction(null)} title={t('dispensation.exceptionTitle')} description={t('dispensation.exceptionBody')} submitLabel={t('dispensation.exception')} pending={mException.isPending} canSubmit={text.trim() !== ''}
        onSubmit={() => mException.mutate({ id: d.id, reason: text })}>
        <FormField label={t('common.reason')} required>{(c) => <Textarea {...c} rows={2} value={text} onChange={(e) => setText(e.target.value)} />}</FormField>
      </ActionDialog>
      <ActionDialog open={action === 'cancel'} onClose={() => setAction(null)} tone="danger" title={t('dispensation.cancelTitle')} description={t('dispensation.cancelBody')} submitLabel={t('dispensation.cancel')} pending={mCancel.isPending} canSubmit={text.trim() !== ''}
        onSubmit={() => mCancel.mutate({ id: d.id, reason: text })}>
        <FormField label={t('common.reason')} required>{(c) => <Textarea {...c} rows={2} value={text} onChange={(e) => setText(e.target.value)} />}</FormField>
      </ActionDialog>
    </Dialog>
  );
}
