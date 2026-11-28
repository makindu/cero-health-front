import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/feedback/spinner';
import { Input, Select } from '@/components/forms/controls';
import { DataTable, type Column } from '@/components/tables/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { useMoney } from '../finance/use-finance';
import { apiTreasury, type CashBookRow } from './treasury-api';

const PER_PAGE = 25;

/** Livre de caisse : tous les mouvements d'une caisse (entrées, sorties, solde après chaque opération), sur la période choisie. */
export function CashBookTab({ mine = false }: { mine?: boolean }) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const { activeFacilityId } = usePreferences();
  const [fundId, setFundId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const funds = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'treasury', mine ? 'my-funds' : 'funds'), queryFn: mine ? apiTreasury.myFunds : apiTreasury.funds });
  const chosen = fundId || funds.data?.[0]?.id || '';
  const book = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'treasury', 'book', chosen, from, to, page),
    queryFn: () => apiTreasury.cashBook(chosen, { from, to, page }),
    enabled: chosen !== '',
    placeholderData: keepPreviousData,
  });
  const cur = book.data?.currency ?? 'USD';
  const columns: Column<CashBookRow>[] = [
    { id: 'date', header: t('columns.date', { defaultValue: 'Date' }), cell: (r) => new Date(`${r.date}T00:00:00`).toLocaleDateString(), primary: true },
    { id: 'motif', header: t('treasury.motif', { defaultValue: 'Libellé' }), cell: (r) => r.motif || '—' },
    { id: 'in', header: t('treasury.entry', { defaultValue: 'Entrée' }), cell: (r) => (r.type === 'entry' ? money(r.amountMinor, cur) : ''), className: 'text-end tabular-nums' },
    { id: 'out', header: t('treasury.exit', { defaultValue: 'Sortie' }), cell: (r) => (r.type === 'exit' ? money(r.amountMinor, cur) : ''), className: 'text-end tabular-nums' },
    { id: 'balance', header: t('treasury.balanceAfter', { defaultValue: 'Solde' }), cell: (r) => money(r.balanceMinor, cur), className: 'text-end font-medium tabular-nums' },
  ];

  if (funds.isPending) return <Skeleton className="h-40 w-full" />;
  if (funds.isError) return <ErrorState error={funds.error} onRetry={() => void funds.refetch()} />;
  if (funds.data.length === 0) return <p className="text-sm text-muted-foreground">{t('treasury.noFund', { defaultValue: 'Aucune caisse enregistrée.' })}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">{t('treasury.fund', { defaultValue: 'Caisse' })}
          <Select value={chosen} onChange={(e) => { setFundId(e.target.value); setPage(1); }} className="mt-1 w-72">
            {funds.data.map((f) => <option key={f.id} value={f.id}>{`${f.description || '—'} · ${f.userName || `#${f.userId}`} · ${f.currency}`}</option>)}
          </Select>
        </label>
        <label className="text-sm">{t('treasury.from', { defaultValue: 'Du' })}<Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="mt-1 w-40" /></label>
        <label className="text-sm">{t('treasury.to', { defaultValue: 'Au' })}<Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="mt-1 w-40" /></label>
      </div>
      {book.data && (
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-muted-foreground">{t('treasury.opening', { defaultValue: 'Solde d’ouverture' })}</dt><dd className="font-semibold tabular-nums">{money(book.data.openingMinor, cur)}</dd></div>
          <div><dt className="text-muted-foreground">{t('treasury.entries', { defaultValue: 'Entrées' })}</dt><dd className="font-semibold tabular-nums">{money(book.data.entriesMinor, cur)}</dd></div>
          <div><dt className="text-muted-foreground">{t('treasury.exits', { defaultValue: 'Sorties' })}</dt><dd className="font-semibold tabular-nums">{money(book.data.exitsMinor, cur)}</dd></div>
          <div><dt className="text-muted-foreground">{t('treasury.closing', { defaultValue: 'Solde de clôture' })}</dt><dd className="font-semibold tabular-nums"><StatusBadge tone="info">{money(book.data.closingMinor, cur)}</StatusBadge></dd></div>
        </dl>
      )}
      <DataTable caption={t('treasury.tabBook', { defaultValue: 'Livre de caisse' })} columns={columns} rows={book.data?.rows ?? []} getRowId={(r) => r.id}
        loading={book.isPending} error={book.error} onRetry={() => void book.refetch()} emptyTitle={t('treasury.noMovement', { defaultValue: 'Aucun mouvement sur cette période.' })}
        pagination={{ page, perPage: PER_PAGE, total: book.data?.total ?? 0, onPageChange: setPage }} />
    </div>
  );
}
