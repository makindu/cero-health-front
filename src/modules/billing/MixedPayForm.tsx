import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Input, Select } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { useToast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/core/api';
import { mixedCheck, type MixedLineInput } from '../exchange/fx-math';
import { useMoney } from '../finance/use-finance';
import { METHODS, apiBilling, type BillingLink, type Method } from './billing-api';

const METHOD_LABEL: Record<string, string> = { cash: 'Espèces', mobile_money: 'Mobile money', card: 'Carte', transfer: 'Virement' };
const MAX_LINES = 6;

/**
 * Paiement MIXTE : le patient remet plusieurs devises ou plusieurs modes pour la même facture (ex. 10 USD + 84 000 CDF).
 * Tout est enregistré en une seule opération et sur un seul reçu ; en espèces, l'excédent est rendu dans la devise choisie.
 */
export function MixedPayForm({ link, rates, onPaid }: { link: BillingLink; rates: Record<string, number>; onPaid: (r: BillingLink) => void }) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const toast = useToast();
  const currencies = Object.keys(rates);
  const other = currencies.find((c) => c !== link.currency) ?? link.currency;
  const [lines, setLines] = useState<MixedLineInput[]>([
    { currency: link.currency, text: '', method: 'cash' },
    { currency: other, text: '', method: 'cash' },
  ]);
  const [changeCurrency, setChangeCurrency] = useState(link.currency);
  const [attempt, setAttempt] = useState(() => globalThis.crypto.randomUUID());
  const check = mixedCheck(lines, link.currency, link.remainingMinor, rates, changeCurrency);
  const patch = (i: number, p: Partial<MixedLineInput>): void => setLines((all) => all.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const methodText = (m: string): string => t(`apiBilling.methods.${m}`, { defaultValue: METHOD_LABEL[m] ?? m });

  const pay = useMutation({
    mutationFn: () => {
      if (!check.ok) throw new Error('invalid');
      return apiBilling.payMixed(link.id, check.lines.map((x) => ({ currency: x.currency, minor: x.minor, method: x.method as Method })), changeCurrency, attempt);
    },
    onSuccess: (r) => {
      toast({ tone: 'success', title: t('apiBilling.paid', { defaultValue: 'Paiement enregistré' }) });
      setAttempt(globalThis.crypto.randomUUID());
      setLines((all) => all.map((x) => ({ ...x, text: '' })));
      onPaid(r);
    },
    onError: (error) => toast({ tone: 'danger', title: error instanceof ApiError ? error.message : t('module.saveFailed'), description: error instanceof ApiError ? undefined : t('module.saveFailedHint') }),
  });

  const problem = (): string | null => {
    if (check.ok) return null;
    const map = {
      empty: t('apiBilling.mixed.empty', { defaultValue: 'Saisissez au moins un montant.' }),
      unreadable: t('apiBilling.mixed.unreadable', { defaultValue: 'Un montant n\'est pas lisible.' }),
      notPositive: t('apiBilling.mixed.notPositive', { defaultValue: 'Chaque montant doit être supérieur à zéro.' }),
      noRate: t('apiBilling.mixed.noRate', { defaultValue: 'Aucun taux de change pour une des devises.' }),
      overpay: t('apiBilling.mixed.overpay', { defaultValue: 'Seule une remise en espèces peut dépasser le solde (rendu de monnaie).' }),
      extraLine: t('apiBilling.mixed.extraLine', { defaultValue: 'La facture est déjà soldée avant la dernière remise : retirez-la.' }),
    } as const;
    return map[check.reason];
  };

  return (
    <form className="space-y-3 rounded-md border border-border p-3" aria-label={t('apiBilling.mixed.title', { defaultValue: 'Paiement mixte' })}
      onSubmit={(e) => { e.preventDefault(); if (check.ok && !pay.isPending) pay.mutate(); }}>
      <h3 className="text-sm font-semibold">{t('apiBilling.mixed.title', { defaultValue: 'Paiement mixte' })}</h3>
      <p className="text-sm text-muted-foreground">{t('apiBilling.mixed.hint', { defaultValue: 'Reste à payer : {{amount}}. Saisissez ce que le patient remet, devise par devise.', amount: money(link.remainingMinor, link.currency) })}</p>
      {lines.map((x, i) => (
        <div key={i} className="grid grid-cols-[6rem_1fr_9rem_auto] items-end gap-2">
          <FormField label={t('apiBilling.mixed.currency', { defaultValue: 'Devise' })}>
            {(c) => <Select {...c} value={x.currency} onChange={(e) => patch(i, { currency: e.target.value })}>{currencies.map((code) => <option key={code} value={code}>{code}</option>)}</Select>}
          </FormField>
          <FormField label={t('apiBilling.mixed.amount', { defaultValue: 'Montant remis' })}>
            {(c) => <Input {...c} inputMode="decimal" value={x.text} onChange={(e) => patch(i, { text: e.target.value })} />}
          </FormField>
          <FormField label={t('columns.method')}>
            {(c) => <Select {...c} value={x.method} onChange={(e) => patch(i, { method: e.target.value })}>{METHODS.map((m) => <option key={m} value={m}>{methodText(m)}</option>)}</Select>}
          </FormField>
          <Button type="button" size="sm" variant="ghost" disabled={lines.length <= 1} aria-label={t('apiBilling.mixed.remove', { defaultValue: 'Retirer cette remise' })}
            onClick={() => setLines((all) => all.filter((_, k) => k !== i))}><X className="size-4" aria-hidden /></Button>
        </div>
      ))}
      {lines.length < MAX_LINES && (
        <Button type="button" size="sm" variant="outline" onClick={() => setLines((all) => [...all, { currency: link.currency, text: '', method: 'cash' }])}>
          <Plus className="size-4" aria-hidden /> {t('apiBilling.mixed.add', { defaultValue: 'Ajouter une remise' })}
        </Button>
      )}
      {currencies.length > 1 && (
        <FormField label={t('apiBilling.mixed.changeCurrency', { defaultValue: 'Monnaie rendue en' })}>
          {(c) => <Select {...c} value={changeCurrency} onChange={(e) => setChangeCurrency(e.target.value)}>{currencies.map((code) => <option key={code} value={code}>{code}</option>)}</Select>}
        </FormField>
      )}
      {check.ok ? (
        <dl className="grid grid-cols-2 gap-2 text-sm" aria-live="polite">
          <dt className="text-muted-foreground">{t('apiBilling.mixed.applied', { defaultValue: 'Appliqué à la facture' })}</dt><dd className="text-end tabular-nums">{money(check.appliedMinor, link.currency)}</dd>
          <dt className="text-muted-foreground">{t('apiBilling.mixed.after', { defaultValue: 'Reste après paiement' })}</dt><dd className="text-end tabular-nums">{money(check.remainingAfterMinor, link.currency)}</dd>
          {check.change && check.change.minor > 0 && <>
            <dt className="font-medium">{t('apiBilling.mixed.change', { defaultValue: 'Monnaie à rendre' })}</dt><dd className="text-end font-semibold tabular-nums">{money(check.change.minor, check.change.currency)}</dd>
          </>}
        </dl>
      ) : lines.some((x) => x.text.trim() !== '') && <p className="text-sm text-danger-ink" role="alert">{problem()}</p>}
      <Button type="submit" loading={pay.isPending} disabled={!check.ok}>{t('apiBilling.mixed.submit', { defaultValue: 'Enregistrer le paiement mixte' })}</Button>
    </form>
  );
}
