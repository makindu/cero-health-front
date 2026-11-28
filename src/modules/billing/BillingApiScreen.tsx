import { Ban, CircleCheck, FileClock, Hourglass, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Select, Input, Textarea } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { useToast } from '@/components/feedback/toast';
import { NewInvoiceApiDialog } from './NewInvoiceApiDialog';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/tables/data-table';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { PersonName } from '@/components/ui/avatar';
import { ApiError } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { useFormatters } from '@/core/i18n/useFormatters';
import { decimalsOf } from '@/core/money/money';
import { apiFx } from '../exchange/fx-api';
import { exactTenderText, rateMap, tenderCheck } from '../exchange/fx-math';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { useMoney } from '../finance/use-finance';
import { ReceiptPrintDialog, type ReceiptContent } from '../_shared/receipt/ReceiptPrintDialog';
import { METHODS, PAGE, apiBilling, stateOf, type BillingLink, type BillingPayment, type GroupReceipt, type PatientBalance, type LinkState, type Method } from './billing-api';
import { MixedPayForm } from './MixedPayForm';
import { paymentReceipt } from './payment-receipt';
import { checkAmount } from './billing-rules';

const STATE_STYLE: Record<LinkState, { tone: StatusTone; icon: typeof Ban; label: string }> = {
  awaiting: { tone: 'info', icon: FileClock, label: 'À encaisser' },
  partial: { tone: 'warning', icon: Hourglass, label: 'Payée en partie' },
  paid: { tone: 'success', icon: CircleCheck, label: 'Payée' },
  cancelled: { tone: 'neutral', icon: Ban, label: 'Annulée' },
};
export const SOURCES: Record<string, string> = { consultation: 'Consultation', lab_order: 'Examen', dispensation: 'Pharmacie', direct: 'Vente directe' };
const METHOD_LABEL: Record<string, string> = { cash: 'Espèces', mobile_money: 'Mobile money', card: 'Carte', transfer: 'Virement' };

export function StateBadge({ link }: { link: BillingLink }) {
  const { t } = useTranslation('finance');
  const s = STATE_STYLE[stateOf(link)];
  return <StatusBadge tone={s.tone} icon={s.icon}>{t(`apiBilling.state.${stateOf(link)}`, { defaultValue: s.label })}</StatusBadge>;
}

/** Facturation en mode API : la liste vient du serveur, qui calcule les prix et refuse les paiements impossibles. */
export function BillingApiScreen() {
  const { t } = useTranslation('finance');
  const f = useFormatters();
  const money = useMoney();
  const { activeFacilityId } = usePreferences();
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'billing', 'list', status, source, page),
    queryFn: () => apiBilling.list({ status: status || undefined, sourceType: source || undefined, page }),
    placeholderData: keepPreviousData,
  });

  const columns: Column<BillingLink>[] = [
    { id: 'patient', header: t('columns.patient'), cell: (l) => <PersonName name={l.patientName} strong={false} />, primary: true },
    { id: 'source', header: t('apiBilling.source', { defaultValue: 'Acte' }), cell: (l) => t(`apiBilling.sources.${l.sourceType}`, { defaultValue: SOURCES[l.sourceType] ?? l.sourceType }) },
    { id: 'date', header: t('columns.date'), cell: (l) => f.date(l.createdAt) },
    { id: 'total', header: t('detail.total'), cell: (l) => money(l.totalMinor, l.currency), className: 'text-end tabular-nums' },
    { id: 'remaining', header: t('apiBilling.remaining', { defaultValue: 'Reste à payer' }), cell: (l) => money(l.remainingMinor, l.currency), className: 'text-end tabular-nums' },
    { id: 'status', header: t('columns.status'), cell: (l) => <StateBadge link={l} /> },
    { id: 'open', header: '', cell: (l) => <Button size="sm" variant="outline" onClick={() => setOpenId(l.id)}>{t('actions.open')}</Button> },
  ];

  return (
    <>
      <PageHeader title={t('billing.title')} description={t('apiBilling.subtitle', { defaultValue: 'Factures des consultations, examens et médicaments, et leurs paiements' })}
        actions={<Button onClick={() => setCreating(true)}>{t('new.button')}</Button>} />
      {creating && <NewInvoiceApiDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); if (id) setOpenId(id); }} />}
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <Select aria-label={t('columns.status')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-56">
            <option value="">{t('filters.allStatuses')}</option>
            <option value="active">{t('apiBilling.active', { defaultValue: 'Factures en cours' })}</option>
            <option value="cancelled">{t('apiBilling.state.cancelled', { defaultValue: 'Annulée' })}</option>
          </Select>
          <Select aria-label={t('apiBilling.source', { defaultValue: 'Acte' })} value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }} className="w-56">
            <option value="">{t('apiBilling.allSources', { defaultValue: 'Tous les actes' })}</option>
            {Object.keys(SOURCES).map((s) => <option key={s} value={s}>{t(`apiBilling.sources.${s}`, { defaultValue: SOURCES[s] })}</option>)}
          </Select>
        </div>
        <DataTable caption={t('billing.title')} columns={columns} rows={list.data?.rows ?? []} getRowId={(l) => l.id}
          loading={list.isPending} error={list.error} onRetry={() => void list.refetch()} emptyTitle={t('billing.empty')}
          emptyDescription={t('apiBilling.emptyHint', { defaultValue: 'Les factures se créent depuis la consultation, le laboratoire et la pharmacie.' })}
          pagination={{ page, perPage: PAGE, total: list.data?.total ?? 0, onPageChange: setPage }} />
      </Card>
      {openId && <LinkDetail id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

/** Règlement groupé : un seul montant pour toutes les factures dues du patient (le serveur répartit, la plus ancienne d'abord). */
function GroupPay({ patientId, balance, onDone, onPaid }: { patientId: string; balance: PatientBalance; onDone: () => void; onPaid: (r: GroupReceipt) => void }) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const toast = useToast();
  // Le total dû est déjà saisi ; le caissier peut le réduire pour un règlement partiel.
  const dueText = balance.outstandingMinor > 0 ? (balance.outstandingMinor / 10 ** decimalsOf(balance.currency)).toFixed(decimalsOf(balance.currency)) : '';
  const [amount, setAmount] = useState(dueText);
  const [method, setMethod] = useState<Method>('cash');
  const [attempt, setAttempt] = useState(() => globalThis.crypto.randomUUID());
  useEffect(() => { setAmount(dueText); }, [dueText]);
  const check = checkAmount(amount, balance.currency, balance.outstandingMinor);
  const pay = useMutation({
    mutationFn: (minor: number) => apiBilling.payGroup(patientId, minor, method, balance.currency, attempt),
    onSuccess: (r) => { toast({ tone: 'success', title: t('apiBilling.groupPaid', { defaultValue: 'Règlement enregistré' }), description: money(r.totalMinor, r.currency) }); setAttempt(globalThis.crypto.randomUUID()); onDone(); onPaid(r); },
    onError: (error) => toast({ tone: 'danger', title: error instanceof ApiError ? error.message : t('module.saveFailed'), description: error instanceof ApiError ? undefined : t('module.saveFailedHint') }),
  });
  return (
    <form className="space-y-3 rounded-md border border-border p-3" onSubmit={(e) => { e.preventDefault(); if (check.ok && !pay.isPending) pay.mutate(check.minor); }}>
      <h3 className="text-sm font-semibold">{t('apiBilling.groupTitle', { defaultValue: 'Régler tout le solde du patient' })}</h3>
      <p className="text-sm text-muted-foreground">{t('apiBilling.groupDue', { defaultValue: 'Total dû : {{amount}}', amount: money(balance.outstandingMinor, balance.currency) })}</p>
      <FormField label={t('form.amount', { currency: balance.currency })} required>
        {(c) => <Input {...c} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </FormField>
      <FormField label={t('columns.method')} required>
        {(c) => <Select {...c} value={method} onChange={(e) => setMethod(e.target.value as Method)}>{METHODS.map((m) => <option key={m} value={m}>{t(`apiBilling.methods.${m}`, { defaultValue: METHOD_LABEL[m] })}</option>)}</Select>}
      </FormField>
      <Button type="submit" loading={pay.isPending} disabled={!check.ok}>{t('apiBilling.groupPay', { defaultValue: 'Enregistrer le règlement groupé' })}</Button>
    </form>
  );
}

export function LinkDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const f = useFormatters();
  const money = useMoney();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  const key = queryKeys.scoped(activeFacilityId, 'billing', 'link', id);
  const link = useQuery({ queryKey: key, queryFn: () => apiBilling.show(id) });
  const l = link.data;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('cash');
  const [tender, setTender] = useState('');
  const [tenderText, setTenderText] = useState('');
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [showMixed, setShowMixed] = useState(false);
  const [receipt, setReceipt] = useState<{ id: string; content: ReceiptContent; reprint: boolean } | null>(null);
  // Une clé par tentative : tant qu'elle ne réussit pas, un nouvel envoi la rejoue sans doublon.
  const [attempt, setAttempt] = useState(() => globalThis.crypto.randomUUID());

  const fail = (error: unknown): void => toast({ tone: 'danger', title: error instanceof ApiError ? error.message : t('module.saveFailed'), description: error instanceof ApiError ? undefined : t('module.saveFailedHint') });
  const refresh = (): void => { void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'billing') }); };
  const methodText = (m: string): string => t(`apiBilling.methods.${m}`, { defaultValue: METHOD_LABEL[m] ?? m });
  const labels = {
    title: t('apiBilling.receiptTitle', { defaultValue: 'Reçu de paiement' }), patient: t('columns.patient'), act: t('apiBilling.source', { defaultValue: 'Acte' }),
    method: t('columns.method'), amount: t('apiBilling.receiptAmount', { defaultValue: 'Montant payé' }), remaining: t('apiBilling.remaining', { defaultValue: 'Reste à payer' }),
    invoices: t('apiBilling.receiptInvoices', { defaultValue: 'Factures réglées' }), footer: t('apiBilling.receiptFooter', { defaultValue: 'Merci.' }),
    total: t('detail.total'), paid: t('apiBilling.paidSoFar', { defaultValue: 'Déjà payé' }), change: t('apiBilling.mixed.change', { defaultValue: 'Monnaie rendue' }),
  };
  const receiptFor = (k: BillingLink, p: BillingPayment, remainingMinor?: number): ReceiptContent => paymentReceipt({
    id: p.id, patientName: k.patientName, actText: t(`apiBilling.sources.${k.sourceType}`, { defaultValue: SOURCES[k.sourceType] ?? k.sourceType }),
    methodText: methodText(p.method), amountText: money(p.amountMinor, k.currency), dateTimeText: f.dateTime(p.paidAt),
    remainingText: remainingMinor === undefined ? undefined : money(remainingMinor, k.currency),
    items: (l?.lines ?? []).map((x) => ({ text: `${x.description} × ${x.quantity}`, amountText: money(x.totalMinor, k.currency) })),
    totalText: (l?.lines.length ?? 0) > 0 ? money(k.totalMinor, k.currency) : undefined,
  }, labels);
  /** Règlement groupé : le reçu porte le total ; il s'accroche au premier paiement du groupe. */
  const printGroup = async (r: GroupReceipt): Promise<void> => {
    const first = r.shares[0];
    if (!l || !first) return;
    try {
      const k = await apiBilling.show(first.linkId);
      const anchor = k.payments.filter((x) => x.groupId === r.groupId).sort((a, b) => Number(a.id) - Number(b.id))[0];
      if (!anchor) return;
      const remaining = r.shares.reduce((sum, x) => sum + x.remainingMinor, 0);
      setReceipt({ id: anchor.id, reprint: false, content: paymentReceipt({ id: anchor.id, patientName: l.patientName, methodText: methodText(anchor.method), amountText: money(r.totalMinor, r.currency), remainingText: money(remaining, r.currency), invoiceCount: r.shares.length, dateTimeText: f.dateTime(anchor.paidAt) }, labels) });
    } catch { /* le règlement est déjà enregistré ; le reçu reste imprimable depuis la liste des paiements */ }
  };
  /** Paiement mixte : UN reçu pour toutes les remises du groupe (devise, taux, monnaie rendue). */
  const mixedReceiptFor = (k: BillingLink, all: BillingPayment[], groupId: string, remainingMinor?: number): { id: string; content: ReceiptContent } | null => {
    const group = all.filter((x) => x.groupId === groupId).sort((a, b) => Number(a.id) - Number(b.id));
    const first = group[0];
    if (!first) return null;
    const given = group.find((x) => (x.changeMinor ?? 0) > 0);
    return { id: first.id, content: paymentReceipt({
      id: first.id, patientName: k.patientName, actText: t(`apiBilling.sources.${k.sourceType}`, { defaultValue: SOURCES[k.sourceType] ?? k.sourceType }),
      methodText: '', dateTimeText: f.dateTime(first.paidAt), amountText: money(group.reduce((s, x) => s + x.amountMinor, 0), k.currency),
      remainingText: remainingMinor === undefined ? undefined : money(remainingMinor, k.currency),
      tenders: group.map((x) => {
        const cur = x.tenderCurrency ?? k.currency;
        const rate = x.tenderCurrency && x.tenderCurrency !== k.currency && x.fxRate ? ` (1 ${k.currency} = ${x.fxRate} ${x.tenderCurrency})` : '';
        return { label: `${methodText(x.method)} · ${cur}${rate}`, value: money(x.tenderMinor ?? x.amountMinor, cur) };
      }),
      changeText: given && given.changeCurrency ? money(given.changeMinor ?? 0, given.changeCurrency) : undefined,
      items: (l?.lines ?? []).map((x) => ({ text: `${x.description} × ${x.quantity}`, amountText: money(x.totalMinor, k.currency) })),
      totalText: (l?.lines.length ?? 0) > 0 ? money(k.totalMinor, k.currency) : undefined,
    }, labels) };
  };
  const onMixedPaid = (r: BillingLink): void => {
    refresh();
    const last = [...r.payments].sort((a, b) => Number(b.id) - Number(a.id))[0];
    const rc = last?.groupId ? mixedReceiptFor(r, r.payments, last.groupId, r.remainingMinor) : null;
    if (rc) setReceipt({ id: rc.id, reprint: false, content: rc.content });
  };
  const payWith = (minor: number): Promise<BillingLink> => (foreign ? apiBilling.payTender(id, tender, tenderMinorNow, method, attempt) : apiBilling.pay(id, minor, method, attempt));
  const pay = useMutation({
    mutationFn: payWith,
    onSuccess: (r) => {
      toast({ tone: 'success', title: t('apiBilling.paid', { defaultValue: 'Paiement enregistré' }) }); setAmount(r.remainingMinor > 0 ? (r.remainingMinor / 10 ** decimalsOf(r.currency)).toFixed(decimalsOf(r.currency)) : ''); setAttempt(globalThis.crypto.randomUUID()); refresh();
      const last = [...r.payments].sort((a, b) => Number(b.id) - Number(a.id))[0];
      if (last) setReceipt({ id: last.id, reprint: false, content: receiptFor(r, last, r.remainingMinor) });
    },
    onError: fail,
  });
  const cancel = useMutation({
    mutationFn: () => apiBilling.cancel(id, reason.trim()),
    onSuccess: () => { toast({ tone: 'success', title: t('apiBilling.cancelled', { defaultValue: 'Facture annulée' }) }); setCancelling(false); refresh(); },
    onError: fail,
  });

  const fx = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'exchange-rates'), queryFn: () => apiFx.overview(), enabled: can(P.billing.pay), staleTime: 60_000 });
  const rates = rateMap(fx.data);
  const currencies = Object.keys(rates);
  const foreign = Boolean(l && tender !== '' && tender !== l.currency && rates[tender] && rates[l.currency]);
  const tCheck = l && foreign ? tenderCheck(tenderText, tender, l.currency, l.remainingMinor, rates) : null;
  const tenderMinorNow = tCheck?.ok ? tCheck.tenderMinor : 0;
  const check = l ? checkAmount(amount, l.currency, l.remainingMinor) : null;
  const valid = foreign ? tCheck?.ok === true : check?.ok === true;
  const minor = check?.ok ? check.minor : 0;
  const chooseTender = (code: string): void => { setTender(code); if (l && code !== '' && code !== l.currency) setTenderText(exactTenderText(l.remainingMinor, l.currency, code, rates)); };
  // Le montant dû est déjà saisi : le caissier n'a qu'à choisir le mode, ou à réduire le montant pour un acompte.
  const remainingText = l && l.remainingMinor > 0 ? (l.remainingMinor / 10 ** decimalsOf(l.currency)).toFixed(decimalsOf(l.currency)) : '';
  useEffect(() => { setAmount(remainingText); }, [remainingText]);
  const canPay = l?.status === 'active' && l.remainingMinor > 0 && can(P.billing.pay);
  const balance = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'billing', 'balance', l?.patientId ?? ''),
    queryFn: () => apiBilling.balance(l?.patientId ?? ''),
    enabled: Boolean(l?.patientId) && can(P.billing.pay),
  });
  // Utile seulement s'il reste plus à régler que cette facture seule.
  const groupBalance = balance.data?.find((b) => b.currency === l?.currency && b.outstandingMinor > (l?.remainingMinor ?? 0));
  const canCancel = l?.status === 'active' && (can(P.billing.credit) || can('health.billing.exception'));

  return (
    <Dialog open onClose={onClose} variant="detail" title={l ? `${l.patientName}` : t('billing.title')}
      description={l ? t(`apiBilling.sources.${l.sourceType}`, { defaultValue: SOURCES[l.sourceType] ?? l.sourceType }) : undefined}
      footer={<Button variant="outline" onClick={onClose}>{t('common.close', { defaultValue: 'Fermer' })}</Button>}>
      {link.isPending && <p className="text-sm text-muted-foreground">{t('common.loading', { defaultValue: 'Chargement…' })}</p>}
      {link.error && <p className="text-sm text-danger-ink">{link.error instanceof ApiError ? link.error.message : t('module.saveFailed')}</p>}
      {l && (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted-foreground">{t('columns.status')}</dt><dd><StateBadge link={l} /></dd></div>
            <div><dt className="text-muted-foreground">{t('columns.date')}</dt><dd>{f.dateTime(l.createdAt)}</dd></div>
            <div><dt className="text-muted-foreground">{t('detail.total')}</dt><dd className="tabular-nums">{money(l.totalMinor, l.currency)}</dd></div>
            <div><dt className="text-muted-foreground">{t('apiBilling.paidSoFar', { defaultValue: 'Déjà payé' })}</dt><dd className="tabular-nums">{money(l.paidMinor, l.currency)}</dd></div>
            <div className="col-span-2"><dt className="text-muted-foreground">{t('apiBilling.remaining', { defaultValue: 'Reste à payer' })}</dt><dd className="text-lg font-semibold tabular-nums">{money(l.remainingMinor, l.currency)}</dd></div>
          </dl>
          {l.status === 'cancelled' && <p className="rounded-md border border-border p-3 text-sm">{t('apiBilling.cancelReason', { defaultValue: 'Motif d\'annulation : {{reason}}', reason: l.cancelReason })}</p>}

          <section aria-label={t('apiBilling.payments', { defaultValue: 'Paiements' })}>
            <h3 className="mb-2 text-sm font-semibold">{t('apiBilling.payments', { defaultValue: 'Paiements' })}</h3>
            {l.payments.length === 0 ? <p className="text-sm text-muted-foreground">{t('apiBilling.noPayment', { defaultValue: 'Aucun paiement pour le moment.' })}</p> : (
              <ul className="divide-y divide-border text-sm">
                {l.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                    <span>{f.dateTime(p.paidAt)} · {t(`apiBilling.methods.${p.method}`, { defaultValue: METHOD_LABEL[p.method] ?? p.method })}</span>
                    <span className="flex items-center gap-2"><span className="tabular-nums">{p.tenderCurrency && p.tenderCurrency !== l.currency && p.tenderMinor != null ? `${money(p.tenderMinor, p.tenderCurrency)} → ${money(p.amountMinor, l.currency)}` : money(p.amountMinor, l.currency)}</span>
                      <Button size="sm" variant="outline" aria-label={t('apiBilling.receipt', { defaultValue: 'Reçu' })} onClick={() => { const rc = p.groupId?.startsWith('mix-') ? mixedReceiptFor(l, l.payments, p.groupId) : null; setReceipt(rc ? { id: rc.id, reprint: true, content: rc.content } : { id: p.id, reprint: true, content: receiptFor(l, p) }); }}><Printer className="size-4" aria-hidden /> {t('apiBilling.receipt', { defaultValue: 'Reçu' })}</Button></span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canPay && (
            <form className="space-y-3 rounded-md border border-border p-3" onSubmit={(e) => { e.preventDefault(); if (valid && !pay.isPending) pay.mutate(minor); }}>
              <h3 className="text-sm font-semibold">{t('apiBilling.newPayment', { defaultValue: 'Encaisser' })}</h3>
              {currencies.length > 1 && (
                <FormField label={t('apiBilling.tenderCurrency', { defaultValue: 'Devise remise par le patient' })}>
                  {(c) => <Select {...c} value={foreign ? tender : l.currency} onChange={(e) => chooseTender(e.target.value)}>{currencies.map((code) => <option key={code} value={code}>{code}</option>)}</Select>}
                </FormField>
              )}
              {foreign ? (
                <FormField label={t('apiBilling.tenderAmount', { defaultValue: 'Montant remis en {{currency}}', currency: tender })} required
                  hint={tCheck?.ok
                    ? t('apiBilling.tenderApplied', { defaultValue: '= {{applied}} sur la facture · taux 1 {{base}} = {{rate}} {{tender}}', applied: money(tCheck.appliedMinor, l.currency), base: l.currency, rate: (rates[tender] / rates[l.currency]).toFixed(rates[tender] / rates[l.currency] < 1 ? 6 : 2), tender })
                    : t('apiBilling.tenderExact', { defaultValue: 'Pour solder la facture : {{amount}} {{tender}}', amount: exactTenderText(l.remainingMinor, l.currency, tender, rates), tender })}>
                  {(c) => <Input {...c} inputMode="decimal" value={tenderText} onChange={(e) => setTenderText(e.target.value)} />}
                </FormField>
              ) : (
                <FormField label={t('form.amount', { currency: l.currency })} required
                  hint={t('apiBilling.amountHint', { defaultValue: 'Au plus {{max}}', max: (l.remainingMinor / 10 ** decimalsOf(l.currency)).toFixed(decimalsOf(l.currency)) })}>
                  {(c) => <Input {...c} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
                </FormField>
              )}
              <FormField label={t('columns.method')} required>
                {(c) => <Select {...c} value={method} onChange={(e) => setMethod(e.target.value as Method)}>{METHODS.map((m) => <option key={m} value={m}>{t(`apiBilling.methods.${m}`, { defaultValue: METHOD_LABEL[m] })}</option>)}</Select>}
              </FormField>
              <Button type="submit" loading={pay.isPending} disabled={!valid}>{t('apiBilling.pay', { defaultValue: 'Enregistrer le paiement' })}</Button>
            </form>
          )}

          {canPay && currencies.length > 1 && (showMixed
            ? <MixedPayForm link={l} rates={rates} onPaid={onMixedPaid} />
            : <Button variant="ghost" size="sm" onClick={() => setShowMixed(true)}>{t('apiBilling.mixed.open', { defaultValue: 'Paiement mixte (plusieurs devises ou modes)…' })}</Button>)}

          {l.status === 'active' && groupBalance && can(P.billing.pay) && (showGroup
            ? <GroupPay patientId={l.patientId} balance={groupBalance} onDone={refresh} onPaid={(r) => void printGroup(r)} />
            : <Button variant="ghost" size="sm" onClick={() => setShowGroup(true)}>{t('apiBilling.groupOpen', { defaultValue: 'Régler tout le solde du patient…' })}</Button>)}

          {canCancel && (cancelling ? (
            <form className="space-y-3 rounded-md border border-border p-3" onSubmit={(e) => { e.preventDefault(); if (reason.trim() && !cancel.isPending) cancel.mutate(); }}>
              <FormField label={t('apiBilling.reason', { defaultValue: 'Motif de l\'annulation' })} required>
                {(c) => <Textarea {...c} value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} />}
              </FormField>
              <div className="flex gap-2">
                <Button type="submit" variant="danger" loading={cancel.isPending} disabled={reason.trim() === ''}>{t('apiBilling.confirmCancel', { defaultValue: 'Annuler la facture' })}</Button>
                <Button variant="outline" onClick={() => setCancelling(false)}>{t('common.cancel')}</Button>
              </div>
            </form>
          ) : <Button variant="outline" onClick={() => setCancelling(true)}>{t('apiBilling.cancel', { defaultValue: 'Annuler la facture…' })}</Button>)}
        </div>
      )}
      {receipt && <ReceiptPrintDialog kind="payment" id={receipt.id} content={receipt.content} reprint={receipt.reprint} onClose={() => setReceipt(null)} />}
    </Dialog>
  );
}
