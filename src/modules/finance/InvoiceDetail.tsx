import { Ban, HandCoins, Printer, ReceiptText, Undo2, Undo, ShieldCheck, Landmark, CircleX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/forms/form-field';
import { Input, Select, Textarea } from '@/components/forms/controls';
import type { LedgerEntry, PaymentMethod } from '@/core/billing/invoice';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { ActionDialog } from './ActionDialog';
import { finance } from './finance';
import type { InvoiceView } from './finance-service';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { invoiceHtml, printDocument, receiptHtml, type PrintLabels } from './print';
import { reasonText } from './reasons';
import { useFinanceMutation, useMoney } from './use-finance';
import { Avatar } from '@/components/ui/avatar';

const METHODS: readonly PaymentMethod[] = ['cash', 'mobileMoney', 'card', 'transfer'];
type Action =
  | { kind: 'pay' } | { kind: 'refund' } | { kind: 'cancel' } | { kind: 'credit' }
  | { kind: 'reverse'; entry: LedgerEntry } | { kind: 'settle'; organizationId: string } | { kind: 'reject'; organizationId: string };

const toMinor = (text: string): number => Math.round(Number(text.replace(',', '.')) * 100);

export function InvoiceDetail({ view, orgNames, onClose }: { view: InvoiceView | undefined; orgNames: Record<string, string>; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const f = useFormatters();
  const money = useMoney();
  const [action, setAction] = useState<Action | null>(null);

  if (!view) return <Dialog open={false} onClose={onClose} ariaLabel={t('detail.title')} />;
  const { invoice, balances: b, ledger, status } = view;
  const m = (n: number) => money(n, invoice.currency);
  const open = status !== 'cancelled';
  const labels = (): PrintLabels => ({
    facility: t('print.facility'), localNotice: t('print.localNotice'), invoice: t('print.invoice'), receipt: t('print.receipt'), number: t('print.number'),
    patient: t('columns.patient'), date: t('columns.date'), item: t('detail.item'), qty: t('detail.qty'), billable: t('detail.billable'), insurer: t('detail.insurer'),
    subscription: t('detail.subscription'), patientShare: t('detail.patientShare'), total: t('detail.total'), paid: t('detail.paid'), balance: t('detail.balance'),
    method: t('columns.method'), reference: t('detail.reference'), cashier: t('columns.cashier'), thanks: t('print.thanks'), organizationsDue: t('print.organizationsDue'),
    methods: Object.fromEntries(METHODS.map((x) => [x, t(`methods.${x}`)])),
  });
  const printInvoice = () => printDocument(invoiceHtml(invoice, b.patientPaid, b.patientBalance, orgNames, labels(), m, (iso) => f.date(iso)));
  const printReceipt = (e: LedgerEntry) => printDocument(receiptHtml(e, invoice, b.patientBalance, labels(), m, (iso) => f.dateTime(iso)));

  return (
    <>
      <Dialog open onClose={onClose} variant="detail" title={`${t('detail.title')} ${invoice.number}`} description={invoice.patientName} leading={<Avatar name={invoice.patientName} size="lg" />}
        footer={<Button variant="outline" leftIcon={<Printer className="size-4" />} onClick={printInvoice}>{t('actions.printInvoice')}</Button>}>
        <div className="space-y-6">
          <DetailSection title={t('detail.summary')}>
            <DescriptionList items={[
              { label: t('columns.status'), value: <InvoiceStatusBadge status={status} /> },
              { label: t('columns.date'), value: f.dateTime(invoice.createdAt) },
              { label: t('detail.createdBy'), value: invoice.createdBy },
              { label: t('detail.total'), value: m(invoice.totals.billable) },
              { label: t('detail.paid'), value: m(b.patientPaid) },
              { label: t('detail.balance'), value: <strong>{m(b.patientBalance)}</strong> },
              ...(invoice.credit ? [{ label: t('detail.credit'), value: `${m(invoice.credit.amount)} — ${invoice.credit.reason} (${invoice.credit.by})` }] : []),
              ...(invoice.cancellation ? [{ label: t('detail.cancellation'), value: `${invoice.cancellation.reason} (${invoice.cancellation.by}, ${f.dateTime(invoice.cancellation.at)})` }] : []),
            ]} />
          </DetailSection>

          <DetailSection title={t('detail.lines')}>
            <ul className="space-y-3">
              {invoice.lines.map((l) => (
                <li key={l.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex justify-between gap-2 font-medium"><span>{l.label} × {l.quantity}</span><span className="tabular-nums">{m(l.billable)}</span></div>
                  <div className="mt-1 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <span>{t('detail.insurer')} : {m(l.insurerShares.reduce((s, x) => s + x.amount, 0))}</span>
                    <span>{t('detail.subscription')} : {m(l.subscriptionShare)}</span>
                    <span>{t('detail.patientShare')} : {m(l.patientShare)}</span>
                  </div>
                  {l.needsAuthorization && <p className="mt-1 text-xs font-medium text-warning-ink">{t('detail.needsAuthorization')}</p>}
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-muted-foreground">{t('detail.justification')}</summary>
                    <ul className="mt-1 list-disc space-y-0.5 ps-5">
                      {l.justification.map((r, i) => <li key={`${r.code}-${i}`}>{reasonText(t, r, m)}</li>)}
                      <li>{l.rules.coordination ? t(`coordination.${l.rules.coordination}`, { defaultValue: l.rules.coordination }) : null}</li>
                      {l.rules.primary && <li>{t('detail.rulesSnapshot', { org: l.rules.primary.organizationName, contract: l.rules.primary.contractLabel, policy: l.rules.primary.policyNumber })}</li>}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          </DetailSection>

          {b.organizations.length > 0 && (
            <DetailSection title={t('detail.organizations')}>
              <ul className="space-y-2 text-sm">
                {b.organizations.map((o) => (
                  <li key={o.organizationId} className="rounded-md border border-border p-3">
                    <div className="font-medium">{orgNames[o.organizationId] ?? o.organizationId}</div>
                    <div className="mt-1 grid grid-cols-2 gap-x-3 text-xs text-muted-foreground sm:grid-cols-4">
                      <span>{t('detail.orgDue')} : {m(o.due)}</span><span>{t('detail.orgSettled')} : {m(o.settled)}</span>
                      <span>{t('detail.orgTransferred')} : {m(o.transferred)}</span><span>{t('detail.orgDisputed')} : {m(o.disputed)}</span>
                    </div>
                    <div className="mt-1 text-xs font-medium">{t('detail.orgOutstanding')} : {m(o.outstanding)}</div>
                    {open && o.outstanding > 0 && (
                      <Can permission={P.billing.settle}>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" leftIcon={<Landmark className="size-4" />} onClick={() => setAction({ kind: 'settle', organizationId: o.organizationId })}>{t('actions.settle')}</Button>
                          <Button size="sm" variant="outline" leftIcon={<CircleX className="size-4" />} onClick={() => setAction({ kind: 'reject', organizationId: o.organizationId })}>{t('actions.reject')}</Button>
                        </div>
                      </Can>
                    )}
                  </li>
                ))}
              </ul>
            </DetailSection>
          )}

          <DetailSection title={t('detail.ledger')}>
            {ledger.length === 0 ? <p className="text-sm text-muted-foreground">{t('detail.noLedger')}</p> : (
              <ul className="space-y-2 text-sm">
                {ledger.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2">
                    <span>
                      <strong>{t(`ledger.${e.kind}`)}</strong> · {m(e.amount)} · {f.dateTime(e.at)} · {e.cashier}
                      {e.method ? ` · ${t(`methods.${e.method}`)}` : ''}{e.reference ? ` · ${e.reference}` : ''}{e.reason ? ` · ${e.reason}` : ''}
                      {e.organizationId ? ` · ${orgNames[e.organizationId] ?? e.organizationId}` : ''}
                      {ledger.some((x) => x.reversalOf === e.id) ? ` · ${t('ledger.reversedMark')}` : ''}
                    </span>
                    <span className="flex gap-1">
                      {e.kind === 'payment' && <Button size="sm" variant="ghost" aria-label={t('actions.printReceipt')} leftIcon={<ReceiptText className="size-4" />} onClick={() => printReceipt(e)}>{t('actions.printReceipt')}</Button>}
                      {e.kind !== 'reversal' && !ledger.some((x) => x.reversalOf === e.id) && (
                        <Can permission={P.billing.reverse}><Button size="sm" variant="ghost" leftIcon={<Undo2 className="size-4" />} onClick={() => setAction({ kind: 'reverse', entry: e })}>{t('actions.reverse')}</Button></Can>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>

          {open && (
            <DetailSection title={t('detail.actions')}>
              <div className="flex flex-wrap gap-2">
                {b.patientBalance > 0 && <Can permission={P.billing.pay}><Button leftIcon={<HandCoins className="size-4" />} onClick={() => setAction({ kind: 'pay' })}>{t('actions.pay')}</Button></Can>}
                {b.patientPaid > 0 && <Can permission={P.billing.refund}><Button variant="outline" leftIcon={<Undo className="size-4" />} onClick={() => setAction({ kind: 'refund' })}>{t('actions.refund')}</Button></Can>}
                {b.patientBalance > 0 && !invoice.credit && <Can permission={P.billing.credit}><Button variant="outline" leftIcon={<ShieldCheck className="size-4" />} onClick={() => setAction({ kind: 'credit' })}>{t('actions.credit')}</Button></Can>}
                <Can permission={P.billing.cancel}><Button variant="danger" leftIcon={<Ban className="size-4" />} onClick={() => setAction({ kind: 'cancel' })}>{t('actions.cancel')}</Button></Can>
              </div>
            </DetailSection>
          )}
        </div>
      </Dialog>
      {action && <InvoiceActionDialog key={action.kind + ('entry' in action ? action.entry.id : 'organizationId' in action ? action.organizationId : '')} view={view} action={action} orgNames={orgNames} onClose={() => setAction(null)} />}
    </>
  );
}

function InvoiceActionDialog({ view, action, orgNames, onClose }: { view: InvoiceView; action: Action; orgNames: Record<string, string>; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const { invoice, balances: b } = view;
  const [submissionId] = useState(() => globalThis.crypto.randomUUID());
  const org = 'organizationId' in action ? b.organizations.find((o) => o.organizationId === action.organizationId) : undefined;
  const suggested = action.kind === 'pay' ? b.patientBalance : action.kind === 'refund' ? b.patientPaid : action.kind === 'settle' ? org?.outstanding ?? 0 : action.kind === 'reject' ? (org ? org.outstanding - org.disputed : 0) : 0;
  const [amount, setAmount] = useState(suggested ? (suggested / 100).toFixed(2) : '');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [transfer, setTransfer] = useState('no');
  const done = () => onClose();
  const ok = { onDone: done };

  const pay = useFinanceMutation(finance.recordPayment, { successTitle: t('done.payment'), ...ok });
  const refund = useFinanceMutation(finance.refund, { successTitle: t('done.refund'), ...ok });
  const cancel = useFinanceMutation(finance.cancelInvoice, { successTitle: t('done.cancel'), ...ok });
  const credit = useFinanceMutation(finance.authorizeCredit, { successTitle: t('done.credit'), ...ok });
  const reverse = useFinanceMutation(finance.reversePayment, { successTitle: t('done.reverse'), ...ok });
  const settle = useFinanceMutation(finance.settleOrganization, { successTitle: t('done.settle'), ...ok });
  const reject = useFinanceMutation(finance.rejectOrganization, { successTitle: t('done.reject'), ...ok });

  const minor = toMinor(amount);
  const needsAmount = ['pay', 'refund', 'settle', 'reject'].includes(action.kind);
  const needsMethod = ['pay', 'refund', 'settle'].includes(action.kind);
  const needsRef = ['pay', 'settle'].includes(action.kind) && method !== 'cash';
  const needsReason = ['refund', 'cancel', 'credit', 'reverse', 'reject'].includes(action.kind);
  const valid = (!needsAmount || (Number.isFinite(minor) && minor > 0)) && (!needsReason || reason.trim().length > 0) && (!needsRef || reference.trim().length > 0);
  const pending = [pay, refund, cancel, credit, reverse, settle, reject].some((x) => x.isPending);

  const submit = () => {
    const id = invoice.id;
    if (action.kind === 'pay') pay.mutate({ invoiceId: id, amount: minor, method, reference, submissionId });
    else if (action.kind === 'refund') refund.mutate({ invoiceId: id, amount: minor, method, reason, submissionId });
    else if (action.kind === 'cancel') cancel.mutate({ invoiceId: id, reason });
    else if (action.kind === 'credit') credit.mutate({ invoiceId: id, reason });
    else if (action.kind === 'reverse') reverse.mutate({ entryId: action.entry.id, reason, submissionId });
    else if (action.kind === 'settle') settle.mutate({ invoiceId: id, organizationId: action.organizationId, amount: minor, method, reference, submissionId });
    else reject.mutate({ invoiceId: id, organizationId: action.organizationId, amount: minor, reason, transferToPatient: transfer === 'yes', submissionId });
  };

  return (
    <ActionDialog open onClose={onClose} title={t(`actions.${action.kind}`)} submitLabel={t(`actions.${action.kind}`)} pending={pending} canSubmit={valid}
      tone={action.kind === 'cancel' ? 'danger' : 'primary'} onSubmit={submit}
      description={org ? orgNames[org.organizationId] : action.kind === 'reverse' ? `${t(`ledger.${action.entry.kind}`)} ${money(action.entry.amount, invoice.currency)}` : t('actions.balanceHint', { amount: money(b.patientBalance, invoice.currency) })}>
      {needsAmount && (
        <FormField label={t('form.amount', { currency: invoice.currency })} required>
          {(c) => <Input {...c} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </FormField>
      )}
      {needsMethod && (
        <FormField label={t('columns.method')} required>
          {(c) => <Select {...c} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{METHODS.map((x) => <option key={x} value={x}>{t(`methods.${x}`)}</option>)}</Select>}
        </FormField>
      )}
      {needsRef && (
        <FormField label={t('detail.reference')} required hint={t('form.referenceHint')}>
          {(c) => <Input {...c} value={reference} onChange={(e) => setReference(e.target.value)} />}
        </FormField>
      )}
      {action.kind === 'reject' && (
        <FormField label={t('form.rejectTransfer')}>
          {(c) => <Select {...c} value={transfer} onChange={(e) => setTransfer(e.target.value)}><option value="no">{t('form.rejectDispute')}</option><option value="yes">{t('form.rejectToPatient')}</option></Select>}
        </FormField>
      )}
      {needsReason && (
        <FormField label={t('form.reason')} required>
          {(c) => <Textarea {...c} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </FormField>
      )}
      {action.kind === 'cancel' && <p className="text-sm text-muted-foreground">{t('form.cancelHint')}</p>}
    </ActionDialog>
  );
}
