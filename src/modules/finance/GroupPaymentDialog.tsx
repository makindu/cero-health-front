import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/forms/form-field';
import { Input, Select } from '@/components/forms/controls';
import { allocateGroupPayment, unpaidDues } from '@/core/billing/group-payment';
import type { PaymentMethod } from '@/core/billing/invoice';
import { ActionDialog } from './ActionDialog';
import { finance } from './finance';
import type { InvoiceView } from './finance-service';
import { useFinanceMutation, useMoney } from './use-finance';

const METHODS: readonly PaymentMethod[] = ['cash', 'mobileMoney', 'card', 'transfer'];
const toMinor = (text: string): number => Math.round(Number(text.replace(',', '.')) * 100);

/**
 * Règlement groupé : toutes les factures impayées du patient sont présentées comme UN solde, mais le paiement est ventilé
 * facture par facture (la plus ancienne d'abord) : chaque facture garde son reçu, son solde et son statut.
 */
export function GroupPaymentDialog({ invoices, onClose }: { invoices: InvoiceView[]; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const ledger = invoices.flatMap((v) => v.ledger);
  const dues = unpaidDues(invoices.map((v) => v.invoice), ledger);
  const total = dues.reduce((s, d) => s + d.due, 0);
  const currency = invoices[0]?.invoice.currency ?? '';
  const [submissionId] = useState(() => globalThis.crypto.randomUUID());
  const [amount, setAmount] = useState(total ? (total / 100).toFixed(2) : '');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const pay = useFinanceMutation(finance.recordGroupPayment, { successTitle: t('group.done'), onDone: onClose });
  const minor = toMinor(amount);
  const valid = Number.isFinite(minor) && minor > 0 && minor <= total && (method === 'cash' || reference.trim().length > 0);
  const shares = valid ? allocateGroupPayment(dues, minor) : [];
  const patientId = invoices[0]?.invoice.patientId ?? '';
  return (
    <ActionDialog open onClose={onClose} title={t('group.title')} submitLabel={t('group.submit')} pending={pay.isPending} canSubmit={valid}
      description={t('group.description', { count: dues.length, amount: money(total, currency) })}
      onSubmit={() => pay.mutate({ patientId, amount: minor, method, reference, submissionId })}>
      <FormField label={t('form.amount', { currency })} required hint={t('group.amountHint')}>
        {(c) => <Input {...c} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </FormField>
      <FormField label={t('columns.method')} required>
        {(c) => <Select {...c} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{METHODS.map((x) => <option key={x} value={x}>{t(`methods.${x}`)}</option>)}</Select>}
      </FormField>
      {method !== 'cash' && (
        <FormField label={t('detail.reference')} required hint={t('form.referenceHint')}>
          {(c) => <Input {...c} value={reference} onChange={(e) => setReference(e.target.value)} />}
        </FormField>
      )}
      <div className="rounded-md border border-border p-3 text-sm">
        <p className="mb-1 font-medium">{t('group.allocation')}</p>
        <ul className="space-y-0.5">
          {(shares.length > 0 ? shares : dues.map((d) => ({ ...d, amount: 0 }))).map((s) => (
            <li key={s.invoiceId} className="flex justify-between gap-2">
              <code className="text-xs">{s.number}</code>
              <span className="tabular-nums">{shares.length > 0 ? `${money(s.amount, currency)} / ${money(s.due, currency)}` : money(s.due, currency)}</span>
            </li>
          ))}
        </ul>
      </div>
    </ActionDialog>
  );
}
