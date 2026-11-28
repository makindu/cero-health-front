import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/feedback/spinner';
import { useToast } from '@/components/feedback/toast';
import { Input } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { NumberInput } from '@/components/forms/number-input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { ApiError } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { apiFx } from './fx-api';

const localToday = (): string => new Date().toLocaleDateString('en-CA');
const KNOWN = ['CDF', 'USD', 'EUR'];

/** Taux de change : « 1 devise par défaut = N devise », fixés par la financière jour par jour, avec l'historique. */
export function ExchangeRatesCard() {
  const { t } = useTranslation('finance');
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'exchange-rates'), queryFn: () => apiFx.overview() });
  const manage = can(PERMISSIONS.exchange.manage);
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const { base, rates, history } = q.data;
  const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{t('fx.title', { defaultValue: 'Taux de change' })}</h2>
          <p className="mb-3 text-sm text-muted-foreground">{t('fx.hint', { defaultValue: 'Devise par défaut : {{base}}. Un taux posé un jour vaut pour ce jour et les suivants, jusqu’au prochain.', base })}</p>
        </div>
        {manage && <Button size="sm" onClick={() => setOpen(true)}>{t('fx.set', { defaultValue: 'Fixer un taux' })}</Button>}
      </div>
      {rates.length === 0 ? <p className="text-sm text-muted-foreground">{t('fx.none', { defaultValue: 'Aucun taux fixé pour le moment.' })}</p> : (
        <ul className="divide-y">
          {rates.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-sm font-medium tabular-nums">1 {base} = {r.rate} {r.currency}</span>
              <span className="text-xs text-muted-foreground">{day(r.date)}{r.setByName && ` · ${r.setByName}`}</span>
            </li>
          ))}
        </ul>
      )}
      {history.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">{t('fx.history', { defaultValue: 'Historique des taux' })} ({history.length})</summary>
          <ul className="mt-2 divide-y text-sm">
            {history.map((r) => <li key={r.id} className="flex flex-wrap justify-between gap-2 py-1.5"><span className="tabular-nums">{day(r.date)} · 1 {base} = {r.rate} {r.currency}</span><span className="text-xs text-muted-foreground">{r.setByName}</span></li>)}
          </ul>
        </details>
      )}
      {open && <RateDialog base={base} known={[...new Set([...KNOWN, ...rates.map((r) => r.currency)])].filter((c) => c !== base)} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function RateDialog({ base, known, onClose }: { base: string; known: string[]; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const toast = useToast();
  const qc = useQueryClient();
  const { activeFacilityId } = usePreferences();
  const [currency, setCurrency] = useState(known[0] ?? '');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(localToday());
  const save = useMutation({
    mutationFn: () => apiFx.set(currency, rate, date),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'exchange-rates') });
      toast({ tone: 'success', title: t('fx.saved', { defaultValue: 'Taux enregistré' }) });
      onClose();
    },
    onError: (e) => toast({ tone: 'danger', title: t('fx.failed', { defaultValue: 'Enregistrement impossible' }), description: e instanceof ApiError ? e.message : undefined }),
  });
  const valid = /^[A-Za-z]{3}$/.test(currency.trim()) && Number(rate) > 0;

  return (
    <Dialog open onClose={onClose} variant="center" title={t('fx.set', { defaultValue: 'Fixer un taux' })}
      footer={<>
        <Button variant="outline" onClick={onClose}>{t('common.cancel', { defaultValue: 'Annuler' })}</Button>
        <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>{t('fx.save', { defaultValue: 'Enregistrer' })}</Button>
      </>}>
      <div className="space-y-3">
        <FormField label={t('fx.currency', { defaultValue: 'Devise' })} required>
          {(p) => (
            <>
              <Input {...p} list="fx-currencies" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
              <datalist id="fx-currencies">{known.map((c) => <option key={c} value={c} />)}</datalist>
            </>
          )}
        </FormField>
        <FormField label={t('fx.rate', { defaultValue: '1 {{base}} vaut', base })} hint={currency ? `1 ${base} = ${rate || '…'} ${currency}` : undefined} required>
          {(p) => <NumberInput {...p} decimal maxDecimals={8} value={rate} onValueChange={setRate} />}
        </FormField>
        <FormField label={t('fx.date', { defaultValue: 'Valable à partir du' })}>
          {(p) => <Input {...p} type="date" max={localToday()} value={date} onChange={(e) => setDate(e.target.value)} />}
        </FormField>
      </div>
    </Dialog>
  );
}
