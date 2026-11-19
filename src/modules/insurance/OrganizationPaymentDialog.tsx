import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, Select } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import type { PaymentMethod } from '@/core/billing/invoice';
import { distributeLump, groupByMember, organizationDues, spreadOldestFirst, type LumpStrategy, type MemberDue } from '@/core/billing/org-settlement';
import { ActionDialog } from '../finance/ActionDialog';
import { finance } from '../finance/finance';
import { useFinanceMutation, useMoney } from '../finance/use-finance';
import type { FinanceSnapshot } from './types';

const METHODS: readonly PaymentMethod[] = ['transfer', 'cash', 'mobileMoney', 'card'];
const STRATEGIES: readonly LumpStrategy[] = ['oldest', 'member', 'proportional'];

/** Texte saisi → unités mineures ; NaN si illisible. Vide = 0. */
const parse = (text: string): number => (text.trim() === '' ? 0 : Math.round(Number(text.replace(',', '.')) * 100));
const fmt = (minor: number): string => (minor / 100).toFixed(2);
const fold = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Paiement groupé d'un organisme (assureur, mutuelle, entreprise…) : la liste de ses membres avec, pour chacun, le total de ses factures
 * ouvertes et un champ « montant à payer ». Trois façons de procéder, combinables : saisir membre par membre, détailler facture par facture,
 * ou saisir la somme globale reçue et la répartir (anciennes d'abord, membre par membre, proportionnellement) puis ajuster.
 * Chaque facture reçoit sa propre écriture de règlement ; le tout est enregistré en une seule opération (tout ou rien).
 */
export function OrganizationPaymentDialog({ data, organizationId, period, onClose }: {
  data: FinanceSnapshot;
  organizationId: string;
  period: { from?: string; to?: string };
  onClose: () => void;
}) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const org = data.organizations.find((o) => o.id === organizationId);
  const currency = data.invoices[0]?.invoice.currency ?? '';
  const members = useMemo(() => groupByMember(organizationDues(data.invoices, organizationId, period)), [data, organizationId, period]);
  const [submissionId] = useState(() => globalThis.crypto.randomUUID());
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [invText, setInvText] = useState<Record<string, string>>({});
  const [memText, setMemText] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [lump, setLump] = useState('');
  const [strategy, setStrategy] = useState<LumpStrategy>('oldest');
  const [lumpError, setLumpError] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('transfer');
  const [reference, setReference] = useState('');
  const pay = useFinanceMutation(finance.settleOrganizationBatch, { successTitle: t('orgPay.done'), onDone: onClose });

  const visible = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return members;
    return members.filter((m) => fold(m.patientName).includes(q) || m.invoices.some((i) => fold(i.number).includes(q)));
  }, [members, query]);

  const memberPaid = (m: MemberDue): number => m.invoices.reduce((s, i) => s + (amounts[i.invoiceId] ?? 0), 0);
  const totalDue = members.reduce((s, m) => s + m.total, 0);
  const totalPay = members.reduce((s, m) => s + memberPaid(m), 0);
  const payingMembers = members.filter((m) => memberPaid(m) > 0).length;
  const payingInvoices = members.reduce((s, m) => s + m.invoices.filter((i) => (amounts[i.invoiceId] ?? 0) > 0).length, 0);

  const badText = (text: string | undefined, max: number): boolean => {
    if (text === undefined) return false;
    const v = parse(text);
    return !Number.isFinite(v) || v < 0 || v > max;
  };
  const hasError = members.some((m) => badText(memText[m.patientId], m.total) || m.invoices.some((i) => badText(invText[i.invoiceId], i.due)));

  /** Remplace d'un coup les montants des membres donnés (les autres restent intacts). */
  function apply(target: readonly MemberDue[], next: { invoiceId: string; amount: number }[]): void {
    const ids = new Set(target.flatMap((m) => m.invoices.map((i) => i.invoiceId)));
    setAmounts((prev) => {
      const out = Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.has(id)));
      for (const n of next) if (n.amount > 0) out[n.invoiceId] = n.amount;
      return out;
    });
    setInvText((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.has(id))));
    setMemText((prev) => Object.fromEntries(Object.entries(prev).filter(([pid]) => !target.some((m) => m.patientId === pid))));
  }

  function typeMember(m: MemberDue, text: string): void {
    const v = parse(text);
    if (Number.isFinite(v) && v >= 0 && v <= m.total) {
      apply([m], v === 0 ? [] : spreadOldestFirst(m.invoices, v));
    }
    setMemText((prev) => ({ ...prev, [m.patientId]: text }));
  }
  function typeInvoice(m: MemberDue, invoiceId: string, due: number, text: string): void {
    const v = parse(text);
    setInvText((prev) => ({ ...prev, [invoiceId]: text }));
    setMemText((prev) => Object.fromEntries(Object.entries(prev).filter(([pid]) => pid !== m.patientId)));
    setAmounts((prev) => {
      const out = { ...prev };
      if (Number.isFinite(v) && v > 0 && v <= due) out[invoiceId] = v;
      else delete out[invoiceId];
      return out;
    });
  }
  const payFull = (list: readonly MemberDue[]): void => apply(list, list.flatMap((m) => m.invoices.map((i) => ({ invoiceId: i.invoiceId, amount: i.due }))));

  function spread(): void {
    const v = parse(lump);
    const due = visible.reduce((s, m) => s + m.total, 0);
    if (!Number.isFinite(v) || v <= 0) { setLumpError(t('orgPay.amountError', { due: money(due, currency) })); return; }
    if (v > due) { setLumpError(t('orgPay.lump.tooBig', { due: money(due, currency) })); return; }
    setLumpError('');
    apply(visible, distributeLump(visible, v, strategy));
  }

  const allocations = Object.entries(amounts).map(([invoiceId, amount]) => ({ invoiceId, amount }));
  const needsRef = method !== 'cash';
  const canSubmit = totalPay > 0 && !hasError && (!needsRef || reference.trim().length > 0);

  return (
    <ActionDialog open wide onClose={onClose} title={t('orgPay.title', { name: org?.name ?? '' })} submitLabel={t('orgPay.submit')} pending={pay.isPending} canSubmit={canSubmit}
      dirty={totalPay > 0 || lump !== ''}
      description={t('orgPay.description', { members: members.length, invoices: members.reduce((s, m) => s + m.invoices.length, 0), amount: money(totalDue, currency) })}
      onSubmit={() => pay.mutate({ organizationId, allocations, method, reference, submissionId })}>
      {members.length === 0 ? <p className="text-sm text-muted-foreground">{t('orgPay.empty')}</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label={t('columns.method')} required>
              {(c) => <Select {...c} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{METHODS.map((x) => <option key={x} value={x}>{t(`methods.${x}`)}</option>)}</Select>}
            </FormField>
            {needsRef && (
              <FormField label={t('detail.reference')} required hint={t('form.referenceHint')} className="sm:col-span-2">
                {(c) => <Input {...c} value={reference} onChange={(e) => setReference(e.target.value)} />}
              </FormField>
            )}
          </div>

          <fieldset className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <legend className="px-1 text-sm font-medium">{t('orgPay.lump.label')}</legend>
            <FormField label={t('orgPay.lump.label')} hint={t('orgPay.lump.hint')} error={lumpError || undefined}>
              {(c) => <Input {...c} inputMode="decimal" value={lump} onChange={(e) => { setLump(e.target.value); setLumpError(''); }} />}
            </FormField>
            <FormField label={t('orgPay.lump.strategy')}>
              {(c) => <Select {...c} value={strategy} onChange={(e) => setStrategy(e.target.value as LumpStrategy)}>{STRATEGIES.map((x) => <option key={x} value={x}>{t(`orgPay.lump.${x}`)}</option>)}</Select>}
            </FormField>
            <Button variant="outline" onClick={spread} disabled={lump.trim() === ''}>{t('orgPay.lump.apply')}</Button>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2">
            <Input type="search" className="max-w-xs" aria-label={t('orgPay.search')} placeholder={t('orgPay.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
            <Button variant="outline" size="sm" onClick={() => payFull(visible)}>{t('orgPay.payAll')}</Button>
            <Button variant="ghost" size="sm" onClick={() => { apply(members, []); setLump(''); }}>{t('orgPay.clear')}</Button>
          </div>

          <div className="max-h-[45vh] overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface text-start text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t('orgPay.columns.member')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('orgPay.columns.due')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('orgPay.columns.pay')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('orgPay.columns.rest')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-muted-foreground">{t('orgPay.noMatch')}</td></tr>}
                {visible.map((m) => {
                  const expanded = open[m.patientId] === true;
                  const memberError = badText(memText[m.patientId], m.total);
                  const sum = memberPaid(m);
                  return (
                    <Fragment key={m.patientId}>
                      <tr className="border-t border-border align-top">
                        <td className="px-3 py-2">
                          <button type="button" className="flex items-center gap-1 text-start font-medium" aria-expanded={expanded}
                            aria-label={t(expanded ? 'orgPay.collapse' : 'orgPay.expand', { name: m.patientName })}
                            onClick={() => setOpen((p) => ({ ...p, [m.patientId]: !expanded }))}>
                            {expanded ? <ChevronDown aria-hidden className="size-4" /> : <ChevronRight aria-hidden className="size-4" />}
                            {m.patientName}
                          </button>
                          <span className="ms-5 text-xs text-muted-foreground">{t('orgPay.invoiceCount', { count: m.invoices.length })}</span>
                        </td>
                        <td className="px-3 py-2 text-end tabular-nums">{money(m.total, currency)}</td>
                        <td className="px-3 py-2 text-end">
                          <div className="flex items-center justify-end gap-1">
                            <Input className="w-32 text-end" inputMode="decimal" aria-label={t('orgPay.amountFor', { name: m.patientName })} aria-invalid={memberError || undefined}
                              value={memText[m.patientId] ?? (sum > 0 ? fmt(sum) : '')} onChange={(e) => typeMember(m, e.target.value)} />
                            <Button variant="ghost" size="sm" onClick={() => payFull([m])}>{t('orgPay.payMember')}</Button>
                          </div>
                          {memberError && <p role="alert" className="mt-1 text-xs text-danger-ink">{t('orgPay.amountError', { due: money(m.total, currency) })}</p>}
                        </td>
                        <td className="px-3 py-2 text-end tabular-nums">{money(m.total - sum, currency)}</td>
                      </tr>
                      {expanded && m.invoices.map((i) => {
                        const err = badText(invText[i.invoiceId], i.due);
                        const v = amounts[i.invoiceId] ?? 0;
                        return (
                          <tr key={i.invoiceId} className="bg-background">
                            <td className="py-1.5 pe-3 ps-8"><code className="text-xs">{i.number}</code></td>
                            <td className="px-3 py-1.5 text-end tabular-nums">{money(i.due, currency)}</td>
                            <td className="px-3 py-1.5 text-end">
                              <Input className="w-32 text-end" inputMode="decimal" aria-label={`${t('orgPay.amountFor', { name: m.patientName })} — ${i.number}`} aria-invalid={err || undefined}
                                value={invText[i.invoiceId] ?? (v > 0 ? fmt(v) : '')} onChange={(e) => typeInvoice(m, i.invoiceId, i.due, e.target.value)} />
                              {err && <p role="alert" className="mt-1 text-xs text-danger-ink">{t('orgPay.amountError', { due: money(i.due, currency) })}</p>}
                            </td>
                            <td className="px-3 py-1.5 text-end tabular-nums">{money(i.due - v, currency)}</td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p role="status" className="rounded-md bg-info-soft px-3 py-2 text-sm text-info-ink">
            {t('orgPay.summary', { amount: money(totalPay, currency), members: payingMembers, invoices: payingInvoices, rest: money(totalDue - totalPay, currency) })}
          </p>
        </>
      )}
    </ActionDialog>
  );
}
