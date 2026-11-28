import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/feedback/spinner';
import { useToast } from '@/components/feedback/toast';
import { Input } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { NumberInput } from '@/components/forms/number-input';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ApiError } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { decimalsOf } from '@/core/money/money';
import { usePreferences } from '@/core/preferences/preferences-store';
import { minorToInput, parseCounted } from '../billing/CashClosureDialog';
import { useMoney } from '../finance/use-finance';
import { apiTreasury, type Handover } from './treasury-api';

const newKey = () => `tre-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
const localToday = (): string => new Date().toLocaleDateString('en-CA');
type Tab = 'handovers' | 'close' | 'funds';

/** Actions du serveur : on montre sa raison quand il refuse (écart sans explication, versement déjà reçu, versements encore à régler…). */
function useTreasuryToast() {
  const toast = useToast();
  const { t } = useTranslation('finance');

  return (error: unknown) => toast({ tone: 'danger', title: t('treasury.failed', { defaultValue: 'Action impossible' }), description: error instanceof ApiError ? error.message : undefined });
}

function HandoverRow({ h }: { h: Handover }) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const toast = useToast();
  const fail = useTreasuryToast();
  const qc = useQueryClient();
  const { activeFacilityId } = usePreferences();
  const [mode, setMode] = useState<'receive' | 'dispute' | null>(null);
  const [received, setReceived] = useState(minorToInput(h.declaredMinor, h.currency));
  const [note, setNote] = useState('');
  const key = useRef(newKey());
  const receivedMinor = parseCounted(received, h.currency);
  const gap = receivedMinor === null ? null : receivedMinor - h.declaredMinor;
  const done = () => {
    key.current = newKey();
    setMode(null);
    void qc.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'treasury') });
    void qc.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'dashboard') });
  };
  const accept = useMutation({
    mutationFn: () => apiTreasury.accept(h.id, receivedMinor ?? 0, note, key.current),
    onSuccess: () => { toast({ tone: 'success', title: t('treasury.received', { defaultValue: 'Versement reçu' }) }); done(); },
    onError: (e) => { key.current = newKey(); fail(e); },
  });
  const dispute = useMutation({
    mutationFn: () => apiTreasury.dispute(h.id, note, key.current),
    onSuccess: () => { toast({ tone: 'warning', title: t('treasury.disputed', { defaultValue: 'Versement contesté' }) }); done(); },
    onError: (e) => { key.current = newKey(); fail(e); },
  });
  const statusLabel = { pending: t('treasury.status.pending', { defaultValue: 'En attente' }), disputed: t('treasury.status.disputed', { defaultValue: 'Contesté' }), accepted: t('treasury.status.accepted', { defaultValue: 'Reçu' }) }[h.status];

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{h.fromUserName || '—'} <span className="text-muted-foreground">· {new Date(`${h.date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></p>
          <p className="text-xs text-muted-foreground">
            {statusLabel}
            {h.status === 'accepted' && h.differenceMinor !== null && h.differenceMinor !== 0 && ` · ${t('treasury.gap', { defaultValue: 'Écart' })} ${money(h.differenceMinor, h.currency)}`}
            {h.note && ` · ${h.note}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">{money(h.status === 'accepted' && h.receivedMinor !== null ? h.receivedMinor : h.declaredMinor, h.currency)}</span>
          {h.status !== 'accepted' && mode === null && (
            <>
              <Button size="sm" onClick={() => setMode('receive')}>{t('treasury.receive', { defaultValue: 'Recevoir' })}</Button>
              {h.status === 'pending' && <Button size="sm" variant="outline" onClick={() => setMode('dispute')}>{t('treasury.dispute', { defaultValue: 'Contester' })}</Button>}
            </>
          )}
        </div>
      </div>
      {mode === 'receive' && (
        <div className="space-y-2 rounded-lg border p-3">
          <FormField label={t('treasury.countedHere', { defaultValue: 'Montant compté' })} hint={`${t('treasury.declared', { defaultValue: 'Déclaré par le caissier' })} : ${money(h.declaredMinor, h.currency)}`} required>
            {(p) => <NumberInput {...p} decimal maxDecimals={decimalsOf(h.currency)} value={received} onValueChange={setReceived} />}
          </FormField>
          {gap !== null && gap !== 0 && <p role="status" className="text-sm font-medium text-danger">{gap < 0 ? t('closure.short', { defaultValue: 'Manque' }) : t('closure.over', { defaultValue: 'Excédent' })} : {money(Math.abs(gap), h.currency)}</p>}
          <FormField label={gap ? t('closure.noteGap', { defaultValue: 'Explication de l’écart' }) : t('closure.note', { defaultValue: 'Remarque (facultatif)' })} required={!!gap}>
            {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
          </FormField>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setMode(null)}>{t('common.cancel', { defaultValue: 'Annuler' })}</Button>
            <Button size="sm" loading={accept.isPending} disabled={receivedMinor === null || (!!gap && note.trim() === '')} onClick={() => accept.mutate()}>{t('treasury.confirmReceive', { defaultValue: 'Confirmer la réception' })}</Button>
          </div>
        </div>
      )}
      {mode === 'dispute' && (
        <div className="space-y-2 rounded-lg border p-3">
          <FormField label={t('treasury.disputeReason', { defaultValue: 'Motif de la contestation' })} required>{(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}</FormField>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setMode(null)}>{t('common.cancel', { defaultValue: 'Annuler' })}</Button>
            <Button size="sm" loading={dispute.isPending} disabled={note.trim() === ''} onClick={() => dispute.mutate()}>{t('treasury.confirmDispute', { defaultValue: 'Contester' })}</Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function HandoversTab() {
  const { t } = useTranslation('finance');
  const { activeFacilityId } = usePreferences();
  const q = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'treasury', 'handovers'), queryFn: () => apiTreasury.handovers() });
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data.length === 0) return <p className="text-sm text-muted-foreground">{t('treasury.noHandover', { defaultValue: 'Aucun versement pour le moment.' })}</p>;

  return <ul className="divide-y">{q.data.map((h) => <HandoverRow key={h.id} h={h} />)}</ul>;
}

export function CloseTab() {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const toast = useToast();
  const fail = useTreasuryToast();
  const qc = useQueryClient();
  const { activeFacilityId } = usePreferences();
  const [date, setDate] = useState(localToday());
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const key = useRef(newKey());
  const summary = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'treasury', 'summary', date), queryFn: () => apiTreasury.summary(date) });
  const codes = Object.keys(summary.data?.currencies ?? {});
  const open = codes.filter((c) => !summary.data?.currencies[c]?.closed);
  const textFor = (c: string) => counted[c] ?? minorToInput(summary.data?.currencies[c]?.expectedMinor ?? 0, c);
  const amounts = open.map((c) => ({ currency: c, minor: parseCounted(textFor(c), c), expected: summary.data?.currencies[c]?.expectedMinor ?? 0 }));
  const hasGap = amounts.some((a) => a.minor !== null && a.minor !== a.expected);
  const unsettled = summary.data?.unsettled ?? 0;
  const close = useMutation({
    mutationFn: () => apiTreasury.close(date, amounts.map((a) => ({ currency: a.currency, countedMinor: a.minor ?? 0 })), note, key.current),
    onSuccess: () => {
      toast({ tone: 'success', title: t('treasury.closed', { defaultValue: 'Caisse de l’établissement clôturée' }) });
      key.current = newKey();
      void qc.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'treasury') });
      void qc.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'dashboard') });
    },
    onError: (e) => { key.current = newKey(); fail(e); },
  });

  return (
    <div className="space-y-4">
      <FormField label={t('treasury.day', { defaultValue: 'Journée à clôturer' })}>{(p) => <Input {...p} type="date" max={localToday()} value={date} onChange={(e) => { setDate(e.target.value); setCounted({}); }} />}</FormField>
      {summary.isPending && <Skeleton className="h-32 w-full" />}
      {summary.isError && <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />}
      {summary.data && unsettled > 0 && <p role="alert" className="rounded-lg border border-danger p-3 text-sm text-danger">{t('treasury.unsettled', { defaultValue: '{{count}} versement(s) restent à recevoir ou à régler avant de clôturer.', count: unsettled })}</p>}
      {summary.data && codes.length === 0 && <p className="text-sm text-muted-foreground">{t('treasury.nothingDay', { defaultValue: 'Aucun versement de caissier ce jour-là.' })}</p>}
      {summary.data && codes.map((c) => {
        const s = summary.data.currencies[c];
        const a = amounts.find((x) => x.currency === c);
        const gap = a && a.minor !== null ? a.minor - a.expected : null;
        return (
          <section key={c} className="space-y-3 rounded-lg border p-3" aria-label={c}>
            <h3 className="text-sm font-semibold">{c}{s.closed && <span className="ms-2 text-xs font-normal text-muted-foreground">{t('treasury.alreadyClosed', { defaultValue: 'déjà clôturée' })}</span>}</h3>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
              <dt>{t('treasury.handoversReceived', { defaultValue: 'Versements reçus ce jour' })} ({s.accepted})</dt><dd className="text-end tabular-nums">{money(s.receivedMinor, c)}</dd>
              <dt className="font-medium">{t('treasury.expectedCash', { defaultValue: 'Solde réel de votre caisse' })}</dt><dd className="text-end font-semibold tabular-nums">{money(s.expectedMinor, c)}</dd>
            </dl>
            {!s.closed && (
              <>
                <FormField label={t('treasury.countedCash', { defaultValue: 'Espèces comptées' })} required>{(p) => <NumberInput {...p} decimal maxDecimals={decimalsOf(c)} value={textFor(c)} onValueChange={(v) => setCounted({ ...counted, [c]: v })} />}</FormField>
                {gap !== null && gap !== 0 && <p role="status" className="text-sm font-medium text-danger">{gap < 0 ? t('closure.short', { defaultValue: 'Manque' }) : t('closure.over', { defaultValue: 'Excédent' })} : {money(Math.abs(gap), c)}</p>}
              </>
            )}
          </section>
        );
      })}
      {open.length > 0 && (
        <>
          <FormField label={hasGap ? t('closure.noteGap', { defaultValue: 'Explication de l’écart' }) : t('closure.note', { defaultValue: 'Remarque (facultatif)' })} required={hasGap}>{(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}</FormField>
          <div className="flex justify-end">
            <Button loading={close.isPending} disabled={unsettled > 0 || amounts.some((a) => a.minor === null) || (hasGap && note.trim() === '')} onClick={() => close.mutate()}>{t('treasury.closeDay', { defaultValue: 'Clôturer la caisse de l’établissement' })}</Button>
          </div>
        </>
      )}
    </div>
  );
}

export function FundsTab() {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const { activeFacilityId } = usePreferences();
  const q = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'treasury', 'funds'), queryFn: apiTreasury.funds });
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data.length === 0) return <p className="text-sm text-muted-foreground">{t('treasury.noFund', { defaultValue: 'Aucune caisse enregistrée.' })}</p>;

  return (
    <ul className="divide-y">
      {q.data.map((f) => (
        <li key={`${f.userId}-${f.currency}`} className="flex items-center justify-between gap-2 py-2 text-sm">
          <span><span className="font-medium">{f.description || '—'}</span> <span className="text-muted-foreground">· {f.userName || `#${f.userId}`} · {f.currency}</span></span>
          <span className="font-semibold tabular-nums">{money(f.balanceMinor, f.currency)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Trésorerie de la financière : versements des caissiers à recevoir, clôture de la caisse de l'établissement, soldes réels de toutes les caisses. */
export function TreasuryDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('finance');
  const [tab, setTab] = useState<Tab>('handovers');
  const tabs: [Tab, string][] = [
    ['handovers', t('treasury.tabHandovers', { defaultValue: 'Versements' })],
    ['close', t('treasury.tabClose', { defaultValue: 'Clôture du jour' })],
    ['funds', t('treasury.tabFunds', { defaultValue: 'Caisses' })],
  ];

  return (
    <Dialog open onClose={onClose} variant="center" wide guard={false} title={t('treasury.title', { defaultValue: 'Trésorerie de l’établissement' })}>
      <div className="mb-4 flex gap-2" role="tablist">
        {tabs.map(([id, label]) => <Button key={id} size="sm" role="tab" aria-selected={tab === id} variant={tab === id ? 'primary' : 'outline'} onClick={() => setTab(id)}>{label}</Button>)}
      </div>
      {tab === 'handovers' && <HandoversTab />}
      {tab === 'close' && <CloseTab />}
      {tab === 'funds' && <FundsTab />}
    </Dialog>
  );
}
