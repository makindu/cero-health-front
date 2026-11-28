import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/feedback/spinner';
import { useToast } from '@/components/feedback/toast';
import { Input, Select } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { ApiError } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { useStaffMembers } from '../_shared/reference-data';
import { useMoney } from '../finance/use-finance';
import { apiTreasury, type FundAssignment } from '../treasury/treasury-api';

const BASE_CURRENCIES = ['USD', 'CDF'];

/** Affectation des caisses : à qui appartient chaque caisse, ouverture d'une caisse pour un caissier, changement de titulaire. */
export function CashierFundsCard() {
  const { t } = useTranslation('administration');
  const money = useMoney();
  const toast = useToast();
  const qc = useQueryClient();
  const { activeFacilityId } = usePreferences();
  const staff = useStaffMembers();
  const [reassign, setReassign] = useState<FundAssignment | null>(null);
  const [opening, setOpening] = useState(false);
  const q = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'cash-funds'), queryFn: apiTreasury.assignments });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'cash-funds') });
    void qc.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'treasury') });
  };
  const fail = (e: unknown) => toast({ tone: 'danger', title: t('cashFunds.failed', { defaultValue: 'Action impossible' }), description: e instanceof ApiError ? e.message : undefined });
  const members = staff.data ?? [];
  const nameOf = (userId: string, fallback: string) => members.find((m) => m.userId === userId)?.name || fallback || `#${userId}`;
  const currencies = [...new Set([...BASE_CURRENCIES, ...(q.data ?? []).map((f) => f.currency)])];

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{t('cashFunds.title', { defaultValue: 'Caisses des caissiers' })}</h2>
          <p className="mb-3 text-sm text-muted-foreground">{t('cashFunds.hint', { defaultValue: 'Chaque caisse a un titulaire et une devise. Une caisse est créée automatiquement au premier mouvement ; vous pouvez aussi l’ouvrir ici ou la confier à un autre caissier (son solde et son historique la suivent).' })}</p>
        </div>
        <Button size="sm" onClick={() => setOpening(true)}>{t('cashFunds.open', { defaultValue: 'Ouvrir une caisse' })}</Button>
      </div>
      {q.isPending && <Skeleton className="h-32 w-full" />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && q.data.length === 0 && <p className="text-sm text-muted-foreground">{t('cashFunds.none', { defaultValue: 'Aucune caisse pour le moment.' })}</p>}
      {q.data && q.data.length > 0 && (
        <ul className="divide-y">
          {q.data.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{f.description || '—'}</p>
                <p className="text-xs text-muted-foreground">{nameOf(f.userId, f.userName)} · {f.currency}</p>
                <p className="text-xs text-muted-foreground">{t('cashFunds.balance', { defaultValue: 'Solde' })} {money(f.balanceMinor, f.currency)}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setReassign(f)}>{t('cashFunds.edit', { defaultValue: 'Modifier' })}</Button>
            </li>
          ))}
        </ul>
      )}
      {opening && <FundDialog title={t('cashFunds.open', { defaultValue: 'Ouvrir une caisse' })} members={members} currencies={currencies} onClose={() => setOpening(false)}
        withDescription run={(userId, currency, description) => apiTreasury.openFund(userId, currency, description)} done={() => { toast({ tone: 'success', title: t('cashFunds.opened', { defaultValue: 'Caisse ouverte' }) }); refresh(); setOpening(false); }} fail={fail} />}
      {reassign && <FundDialog title={t('cashFunds.editTitle', { defaultValue: 'Modifier la caisse {{currency}}', currency: reassign.currency })} members={members} currencies={[reassign.currency]} fixedCurrency withDescription initialDescription={reassign.description} current={reassign.userId} onClose={() => setReassign(null)}
        run={(userId, _c, description) => apiTreasury.updateFund(reassign.id, { ...(userId !== reassign.userId ? { userId } : {}), ...(description.trim() !== reassign.description ? { description } : {}) })} done={() => { toast({ tone: 'success', title: t('cashFunds.updated', { defaultValue: 'Caisse modifiée' }) }); refresh(); setReassign(null); }} fail={fail} />}
    </Card>
  );
}

function FundDialog({ title, members, currencies, fixedCurrency = false, withDescription = false, initialDescription = '', current = '', run, done, fail, onClose }: {
  title: string; members: { userId: string; name: string }[]; currencies: string[]; fixedCurrency?: boolean; withDescription?: boolean; initialDescription?: string; current?: string;
  run: (userId: string, currency: string, description: string) => Promise<void>; done: () => void; fail: (e: unknown) => void; onClose: () => void;
}) {
  const { t } = useTranslation('administration');
  const [userId, setUserId] = useState(current);
  const [currency, setCurrency] = useState(currencies[0] ?? 'USD');
  const [description, setDescription] = useState(initialDescription);
  const save = useMutation({ mutationFn: () => run(userId, currency, description), onSuccess: done, onError: fail });

  return (
    <Dialog open onClose={onClose} variant="center" title={title}
      footer={<>
        <Button variant="outline" onClick={onClose}>{t('common.cancel', { defaultValue: 'Annuler' })}</Button>
        <Button loading={save.isPending} disabled={userId === '' || (fixedCurrency && userId === current && description.trim() === initialDescription)} onClick={() => save.mutate()}>{t('cashFunds.confirm', { defaultValue: 'Confirmer' })}</Button>
      </>}>
      <div className="space-y-3">
        <FormField label={t('cashFunds.holder', { defaultValue: 'Caissier titulaire' })} required>
          {(p) => (
            <Select {...p} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">—</option>
              {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
            </Select>
          )}
        </FormField>
        {!fixedCurrency && (
          <FormField label={t('cashFunds.currency', { defaultValue: 'Devise' })} required>
            {(p) => <Select {...p} value={currency} onChange={(e) => setCurrency(e.target.value)}>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</Select>}
          </FormField>
        )}
        {withDescription && (
          <FormField label={t('cashFunds.description', { defaultValue: 'Description' })} hint={t('cashFunds.descriptionHint', { defaultValue: 'Laissée vide, elle est complétée automatiquement (ex. « Caisse Marie (USD) »).' })}>
            {(p) => <Input {...p} maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />}
          </FormField>
        )}
      </div>
    </Dialog>
  );
}
