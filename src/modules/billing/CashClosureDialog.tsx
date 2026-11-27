import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { NumberInput } from '@/components/forms/number-input';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/feedback/spinner';
import { useToast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ApiError } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { decimalsOf, parseMoney } from '@/core/money/money';
import { usePreferences } from '@/core/preferences/preferences-store';
import { useMoney } from '../finance/use-finance';
import { apiClosure, type DayCurrency } from './closure-api';

/** Unités mineures → texte saisissable (« 18.50 »), pour préremplir le comptage avec l'attendu. */
export const minorToInput = (minor: number, currency: string): string => {
  const d = decimalsOf(currency);
  return (minor / 10 ** d).toFixed(d);
};

/** Montant compté saisi → unités mineures ; zéro accepté (caisse vide), négatif ou illisible refusé. */
export function parseCounted(text: string, currency: string): number | null {
  if (text.trim() === '') return null;
  try {
    const m = parseMoney(text, currency).minor;
    return m >= 0 ? m : null;
  } catch { return null; }
}

const newKey = () => `clo-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

/**
 * Clôture de la journée d'un caissier : encaissements, dépenses, espèces attendues ; il saisit ce qu'il a réellement en caisse.
 * L'écart est calculé par le serveur et enregistré tel quel (la clôture ne se modifie plus).
 */
export function CashClosureDialog({ date, onClose }: { date: string; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const toast = useToast();
  const qc = useQueryClient();
  const { activeFacilityId } = usePreferences();
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const idemKey = useRef(newKey());

  const preview = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'billing', 'closure-preview', date),
    queryFn: () => apiClosure.preview(date),
  });
  const currencies: DayCurrency[] = preview.data?.currencies ?? [];
  const textFor = (c: DayCurrency) => counted[c.currency] ?? minorToInput(c.expectedMinor, c.currency);
  const amounts = currencies.map((c) => ({ currency: c.currency, minor: parseCounted(textFor(c), c.currency), expected: c.expectedMinor }));
  const allValid = amounts.length > 0 && amounts.every((a) => a.minor !== null);
  const hasGap = amounts.some((a) => a.minor !== null && a.minor !== a.expected);

  const close = useMutation({
    mutationFn: () => apiClosure.close(date, amounts.map((a) => ({ currency: a.currency, countedMinor: a.minor ?? 0 })), note, idemKey.current),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'billing') });
      void qc.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'dashboard') });
      toast({ tone: 'success', title: t('closure.done', { defaultValue: 'Caisse clôturée' }) });
      onClose();
    },
    onError: (error) => {
      idemKey.current = newKey();
      toast({ tone: 'danger', title: error instanceof ApiError && error.status === 409 ? t('closure.already', { defaultValue: 'Cette journée est déjà clôturée' }) : t('closure.failed', { defaultValue: 'Clôture impossible' }), description: error instanceof ApiError ? error.message : undefined });
    },
  });

  const label = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <Dialog open onClose={onClose} variant="center" title={t('closure.title', { defaultValue: 'Clôturer la caisse' })} description={label}
      footer={<>
        <Button variant="outline" onClick={onClose}>{t('common.cancel', { defaultValue: 'Annuler' })}</Button>
        <Button loading={close.isPending} disabled={!allValid || (hasGap && note.trim() === '')} onClick={() => close.mutate()}>{t('closure.confirm', { defaultValue: 'Clôturer la journée' })}</Button>
      </>}>
      {preview.isPending && <Skeleton className="h-40 w-full" />}
      {preview.isError && <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />}
      {preview.data && currencies.length === 0 && <p className="text-sm text-muted-foreground">{t('closure.none', { defaultValue: 'Aucun mouvement ce jour-là : rien à clôturer.' })}</p>}
      {preview.data && currencies.length > 0 && (
        <div className="space-y-5">
          {currencies.map((c, i) => {
            const minor = amounts[i]?.minor ?? null;
            const gap = minor === null ? null : minor - c.expectedMinor;
            const others = Object.entries(c.byMethod).filter(([m, v]) => m !== 'cash' && v > 0);
            return (
              <section key={c.currency} className="space-y-3 rounded-lg border p-3" aria-label={c.currency}>
                <h3 className="text-sm font-semibold">{c.currency}</h3>
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                  <dt>{t('closure.entries', { defaultValue: 'Encaissements (tous modes)' })}</dt><dd className="text-end tabular-nums">{money(c.entriesMinor, c.currency)}</dd>
                  <dt className="ps-3 text-muted-foreground">{t('closure.cash', { defaultValue: 'dont espèces' })}</dt><dd className="text-end tabular-nums text-muted-foreground">{money(c.cashMinor, c.currency)}</dd>
                  {others.map(([m, v]) => (<><dt key={`${m}-l`} className="ps-3 text-muted-foreground">{t(`closure.method.${m}`, { defaultValue: m })}</dt><dd key={`${m}-v`} className="text-end tabular-nums text-muted-foreground">{money(v, c.currency)}</dd></>))}
                  <dt>{t('closure.expenses', { defaultValue: 'Dépenses payées en caisse' })}</dt><dd className="text-end tabular-nums">− {money(c.expensesMinor, c.currency)}</dd>
                  <dt className="font-medium">{t('closure.expected', { defaultValue: 'Espèces attendues' })}</dt><dd className="text-end font-semibold tabular-nums">{money(c.expectedMinor, c.currency)}</dd>
                </dl>
                <FormField label={t('closure.counted', { defaultValue: 'Espèces comptées en caisse' })} required>
                  {(p) => <NumberInput {...p} decimal maxDecimals={decimalsOf(c.currency)} value={textFor(c)} onValueChange={(v) => setCounted({ ...counted, [c.currency]: v })} />}
                </FormField>
                {gap !== null && gap !== 0 && (
                  <p role="status" className="text-sm font-medium text-danger">
                    {gap < 0 ? t('closure.short', { defaultValue: 'Manque' }) : t('closure.over', { defaultValue: 'Excédent' })} : {money(Math.abs(gap), c.currency)}
                  </p>
                )}
              </section>
            );
          })}
          <FormField label={hasGap ? t('closure.noteGap', { defaultValue: 'Explication de l’écart' }) : t('closure.note', { defaultValue: 'Remarque (facultatif)' })} required={hasGap}>
            {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
          </FormField>
        </div>
      )}
    </Dialog>
  );
}
