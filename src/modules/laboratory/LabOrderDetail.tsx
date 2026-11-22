import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/badge';
import { FormField } from '@/components/forms/form-field';
import { Input, Select, Textarea } from '@/components/forms/controls';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { ActionDialog } from '../finance/ActionDialog';
import { InvoiceStatusBadge } from '../finance/InvoiceStatusBadge';
import { useMoney } from '../finance/use-finance';
import { lab } from './lab';
import type { LabFlag, LabOrder, LabResultValue } from './lab-rules';
import type { LabOrderView } from './lab-service';
import { LabStatusBadge } from './LabStatusBadge';
import { useLabMutation } from './use-lab';
import { Avatar } from '@/components/ui/avatar';

type Action = 'exception' | 'collect' | 'cancel' | 'results' | 'amend' | null;
const FLAGS: readonly LabFlag[] = ['unspecified', 'normal', 'abnormal'];

function useAct<I>(fn: (i: I) => Promise<LabOrderView>, title: string, onDone: () => void) {
  return useLabMutation(fn, { successTitle: title, onDone });
}

const blank = (order: LabOrder): LabResultValue[] =>
  order.tests.map((x) => order.results.find((r) => r.code === x.code) ?? { code: x.code, value: '', unit: '', referenceRange: '', flag: 'unspecified', comment: '' });

export function LabOrderDetail({ view, onClose }: { view: LabOrderView | undefined; onClose: () => void }) {
  const { t } = useTranslation('laboratory');
  const f = useFormatters();
  const money = useMoney();
  const [action, setAction] = useState<Action>(null);
  const [text, setText] = useState('');
  const [values, setValues] = useState<LabResultValue[]>([]);
  const done = (): void => { setAction(null); setText(''); };
  // Les hooks sont appelés dans un ordre fixe, quel que soit l'ordre ouvert.
  const mException = useAct(lab.grantPaymentException, t('done.exception'), done);
  const mCollect = useAct(lab.collect, t('done.collect'), done);
  const mStart = useAct(lab.start, t('done.start'), done);
  const mResults = useAct(lab.enterResults, t('done.results'), done);
  const mReopen = useAct(lab.reopenResults, t('done.reopen'), done);
  const mValidate = useAct(lab.validate, t('done.validate'), done);
  const mAmend = useAct(lab.amend, t('done.amend'), done);
  const mCancel = useAct(lab.cancel, t('done.cancel'), done);

  if (!view) return <Dialog open={false} onClose={onClose} ariaLabel={t('detail.order')} />;
  const { order, invoice } = view;
  const open = (a: Action): void => { setText(''); setValues(blank(order)); setAction(a); };
  const setVal = (i: number, patch: Partial<LabResultValue>): void => setValues(values.map((v, k) => (k === i ? { ...v, ...patch } : v)));
  const orderId = order.id;
  const label = (code: string): string => order.tests.find((x) => x.code === code)?.label ?? code;
  const when = (iso: string): string => f.dateTime(iso);

  return (
    <Dialog open onClose={onClose} title={`${order.number} — ${order.patientName}`} leading={<Avatar name={order.patientName} size="lg" />} description={t('detail.description')}>
      <div className="space-y-5">
        <DetailSection title={t('detail.summary')}>
          <DescriptionList items={[
            { label: t('columns.status'), value: <LabStatusBadge status={order.status} /> },
            { label: t('columns.priority'), value: t(`priority.${order.priority}`) },
            { label: t('detail.requestedBy'), value: `${order.requestedBy} · ${when(order.requestedAt)}` },
            { label: t('detail.consultation'), value: order.consultationId },
            { label: t('create.note'), value: order.clinicalNote },
            { label: t('detail.tests'), value: order.tests.map((x) => x.label).join(', ') },
          ]} />
        </DetailSection>

        {!view.serverSide && <DetailSection title={t('detail.payment')}>
          {invoice ? (
            <DescriptionList items={[
              { label: t('detail.invoice'), value: <span className="inline-flex items-center gap-2">{invoice.invoice.number} <InvoiceStatusBadge status={invoice.status} /></span> },
              { label: t('detail.patientShare'), value: money(invoice.balances.patientDue, invoice.invoice.currency) },
              { label: t('detail.remaining'), value: money(Math.max(0, invoice.balances.patientBalance), invoice.invoice.currency) },
              { label: t('detail.collectGate'), value: <StatusBadge tone={view.paymentCleared ? 'success' : 'warning'}>{t(`payment.${view.paymentState}`)}</StatusBadge> },
            ]} />
          ) : <p className="text-sm text-danger-ink">{t('detail.noInvoice')}</p>}
          {order.paymentException && (
            <p className="rounded-md bg-warning-soft p-3 text-sm text-warning-ink">{t('detail.exceptionBy', { by: order.paymentException.by, reason: order.paymentException.reason })}</p>
          )}
          {order.cancellation?.refundPending && <p className="rounded-md bg-warning-soft p-3 text-sm text-warning-ink">{t('detail.refundPending')}</p>}
        </DetailSection>}

        {(order.collected || order.results.length > 0) && (
          <DetailSection title={t('detail.results')}>
            {order.collected && <p className="text-xs text-muted-foreground">{t('detail.collectedBy', { by: order.collected.by, at: when(order.collected.at) })}{order.collected.sampleNote ? ` — ${order.collected.sampleNote}` : ''}</p>}
            {order.results.length > 0 && (
              <table className="w-full text-sm">
                <thead><tr className="text-start text-xs text-muted-foreground"><th className="py-1 text-start">{t('detail.test')}</th><th className="text-start">{t('detail.value')}</th><th className="text-start">{t('detail.reference')}</th><th className="text-start">{t('detail.flag')}</th></tr></thead>
                <tbody>
                  {order.results.map((r) => (
                    <tr key={r.code} className="border-t border-border">
                      <td className="py-1">{label(r.code)}</td>
                      <td className="tabular-nums">{r.value} {r.unit}</td>
                      <td>{r.referenceRange || '—'}</td>
                      <td>{t(`flag.${r.flag}`)}{r.comment ? ` · ${r.comment}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {order.resultsEnteredBy && <p className="text-xs text-muted-foreground">{t('detail.enteredBy', { by: order.resultsEnteredBy.by, at: when(order.resultsEnteredBy.at) })}</p>}
            {order.validation && <p className="text-xs text-muted-foreground">{t('detail.validatedBy', { by: order.validation.by, at: when(order.validation.at) })}</p>}
            {order.amendments.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer">{t('detail.amendments', { count: order.amendments.length })}</summary>
                <ul className="mt-1 space-y-1">
                  {order.amendments.map((a, i) => (
                    <li key={i}>{when(a.at)} · {a.by} · {a.reason} — {t('detail.previous')} : {a.previous.map((p) => `${label(p.code)} ${p.value} ${p.unit}`).join(' ; ')}</li>
                  ))}
                </ul>
              </details>
            )}
          </DetailSection>
        )}

        {order.cancellation && <p className="text-sm">{t('detail.cancelledBy', { by: order.cancellation.by, reason: order.cancellation.reason })}</p>}

        <DetailSection title={t('detail.actions')}>
          <div className="flex flex-wrap gap-2">
            {order.status === 'requested' && (
              <>
                <Can permission={P.laboratory.collect}><Button onClick={() => open('collect')} disabled={!view.paymentCleared}>{t('actions.collect')}</Button></Can>
                {!view.serverSide && !view.paymentCleared && !order.paymentException && <Can permission={P.laboratory.exception}><Button variant="outline" onClick={() => open('exception')}>{t('actions.exception')}</Button></Can>}
                <Can permission={P.laboratory.order}><Button variant="outline" onClick={() => open('cancel')}>{t('actions.cancel')}</Button></Can>
              </>
            )}
            {order.status === 'collected' && <Can permission={P.laboratory.resultsEnter}><Button loading={mStart.isPending} onClick={() => mStart.mutate({ orderId })}>{t('actions.start')}</Button></Can>}
            {order.status === 'inProgress' && <Can permission={P.laboratory.resultsEnter}><Button onClick={() => open('results')}>{t('actions.enter')}</Button></Can>}
            {order.status === 'resultEntered' && (
              <>
                <Can permission={P.laboratory.resultsEnter}><Button variant="outline" loading={mReopen.isPending} onClick={() => mReopen.mutate({ orderId })}>{t('actions.reopen')}</Button></Can>
                <Can permission={P.laboratory.resultsValidate}><Button loading={mValidate.isPending} onClick={() => mValidate.mutate({ orderId })}>{t('actions.validate')}</Button></Can>
              </>
            )}
            {order.status === 'validated' && <Can permission={P.laboratory.resultsValidate}><Button variant="outline" onClick={() => open('amend')}>{t('actions.amend')}</Button></Can>}
          </div>
          {!view.serverSide && !view.paymentCleared && order.status === 'requested' && <p className="text-xs text-muted-foreground">{t('detail.gateHint')}</p>}
        </DetailSection>
      </div>

      <ActionDialog open={action === 'collect'} onClose={() => setAction(null)} title={t('actions.collectTitle')} submitLabel={t('actions.collect')} pending={mCollect.isPending}
        onSubmit={() => mCollect.mutate({ orderId, sampleNote: text })}>
        <FormField label={t('actions.sampleNote')}>{(c) => <Input {...c} value={text} onChange={(e) => setText(e.target.value)} />}</FormField>
      </ActionDialog>
      <ActionDialog open={action === 'exception'} onClose={() => setAction(null)} title={t('actions.exceptionTitle')} description={t('actions.exceptionBody')} submitLabel={t('actions.exception')} pending={mException.isPending} canSubmit={text.trim() !== ''}
        onSubmit={() => mException.mutate({ orderId, reason: text })}>
        <FormField label={t('actions.reason')} required>{(c) => <Textarea {...c} rows={2} value={text} onChange={(e) => setText(e.target.value)} />}</FormField>
      </ActionDialog>
      <ActionDialog open={action === 'cancel'} onClose={() => setAction(null)} tone="danger" title={t('actions.cancelTitle')} description={t('actions.cancelBody')} submitLabel={t('actions.cancel')} pending={mCancel.isPending} canSubmit={text.trim() !== ''}
        onSubmit={() => mCancel.mutate({ orderId, reason: text })}>
        <FormField label={t('actions.reason')} required>{(c) => <Textarea {...c} rows={2} value={text} onChange={(e) => setText(e.target.value)} />}</FormField>
      </ActionDialog>
      <ActionDialog open={action === 'results' || action === 'amend'} onClose={() => setAction(null)} title={action === 'amend' ? t('actions.amendTitle') : t('actions.enterTitle')} description={t('actions.enterBody')}
        submitLabel={action === 'amend' ? t('actions.amend') : t('actions.save')} pending={mResults.isPending || mAmend.isPending} canSubmit={action === 'amend' ? text.trim() !== '' && values.every((v) => v.value.trim() !== '') : true}
        onSubmit={() => (action === 'amend' ? mAmend.mutate({ orderId, values, reason: text }) : mResults.mutate({ orderId, values }))}>
        {values.map((v, i) => (
          <fieldset key={v.code} className="space-y-2 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">{label(v.code)}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              <FormField label={t('detail.value')}>{(c) => <Input {...c} value={v.value} onChange={(e) => setVal(i, { value: e.target.value })} />}</FormField>
              <FormField label={t('detail.unit')}>{(c) => <Input {...c} value={v.unit} onChange={(e) => setVal(i, { unit: e.target.value })} />}</FormField>
              <FormField label={t('detail.reference')}>{(c) => <Input {...c} value={v.referenceRange} onChange={(e) => setVal(i, { referenceRange: e.target.value })} />}</FormField>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <FormField label={t('detail.flag')}>
                {(c) => <Select {...c} value={v.flag} onChange={(e) => setVal(i, { flag: e.target.value as LabFlag })}>{FLAGS.map((x) => <option key={x} value={x}>{t(`flag.${x}`)}</option>)}</Select>}
              </FormField>
              <FormField label={t('detail.comment')}>{(c) => <Input {...c} value={v.comment} onChange={(e) => setVal(i, { comment: e.target.value })} />}</FormField>
            </div>
          </fieldset>
        ))}
        {action === 'amend' && <FormField label={t('actions.reason')} required>{(c) => <Textarea {...c} rows={2} value={text} onChange={(e) => setText(e.target.value)} />}</FormField>}
      </ActionDialog>
    </Dialog>
  );
}
