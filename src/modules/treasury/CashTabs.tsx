import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/feedback/spinner';
import { StatusBadge } from '@/components/ui/badge';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { apiClosure } from '../billing/closure-api';
import { useMoney } from '../finance/use-finance';
import { apiTreasury } from './treasury-api';

const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Caisses non clôturées : qui n'a pas encore clôturé quelle journée (31 derniers jours). */
export function UnclosedTab() {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const { activeFacilityId } = usePreferences();
  const q = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'treasury', 'unclosed'), queryFn: apiTreasury.unclosed, refetchOnWindowFocus: true });
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data.length === 0) return <p className="text-sm text-muted-foreground">{t('treasury.noUnclosed', { defaultValue: 'Toutes les caisses sont clôturées.' })}</p>;

  return (
    <ul className="divide-y">
      {q.data.map((d) => (
        <li key={`${d.userId}-${d.date}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div>
            <p className="text-sm font-medium">{d.userName || `#${d.userId}`} <span className="text-muted-foreground">· {day(d.date)}</span></p>
            <p className="text-xs text-muted-foreground">{d.currencies.map((c) => `${t('treasury.expectedCash', { defaultValue: 'Espèces attendues' })} ${money(c.expectedMinor, c.currency)}`).join(' · ')}</p>
          </div>
          <StatusBadge tone={d.isToday ? 'info' : 'warning'}>{d.isToday ? t('treasury.today', { defaultValue: 'Aujourd’hui' }) : t('treasury.late', { defaultValue: 'En retard' })}</StatusBadge>
        </li>
      ))}
    </ul>
  );
}

/** Historique : clôtures des caissiers (écart compris) et clôtures de la caisse de l'établissement. */
export function ClosuresTab() {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const { activeFacilityId } = usePreferences();
  const cashiers = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'treasury', 'cashier-closures'), queryFn: () => apiClosure.list({}) });
  const facility = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'treasury', 'closures'), queryFn: apiTreasury.closures });
  if (cashiers.isPending || facility.isPending) return <Skeleton className="h-40 w-full" />;
  if (cashiers.isError) return <ErrorState error={cashiers.error} onRetry={() => void cashiers.refetch()} />;
  if (facility.isError) return <ErrorState error={facility.error} onRetry={() => void facility.refetch()} />;
  const gap = (n: number, c: string) => (n === 0 ? t('treasury.noGap', { defaultValue: 'sans écart' }) : `${n < 0 ? t('closure.short', { defaultValue: 'Manque' }) : t('closure.over', { defaultValue: 'Excédent' })} ${money(Math.abs(n), c)}`);

  return (
    <div className="space-y-6">
      <section aria-label={t('treasury.facilityClosures', { defaultValue: 'Clôtures de l’établissement' })}>
        <h3 className="mb-2 text-sm font-semibold">{t('treasury.facilityClosures', { defaultValue: 'Clôtures de l’établissement' })}</h3>
        {facility.data.length === 0 ? <p className="text-sm text-muted-foreground">{t('treasury.noClosure', { defaultValue: 'Aucune clôture pour le moment.' })}</p> : (
          <ul className="divide-y">
            {facility.data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{day(c.date)} · {c.userName} · {c.currency}</span>
                <span className="tabular-nums">{money(c.countedMinor, c.currency)} <span className="text-xs text-muted-foreground">({gap(c.differenceMinor, c.currency)})</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label={t('treasury.cashierClosures', { defaultValue: 'Clôtures des caissiers' })}>
        <h3 className="mb-2 text-sm font-semibold">{t('treasury.cashierClosures', { defaultValue: 'Clôtures des caissiers' })}</h3>
        {cashiers.data.length === 0 ? <p className="text-sm text-muted-foreground">{t('treasury.noClosure', { defaultValue: 'Aucune clôture pour le moment.' })}</p> : (
          <ul className="divide-y">
            {cashiers.data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{day(c.date)} · {c.userName} · {c.currency}</span>
                <span className="tabular-nums">{money(c.countedMinor, c.currency)} <span className="text-xs text-muted-foreground">({gap(c.differenceMinor, c.currency)})</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
