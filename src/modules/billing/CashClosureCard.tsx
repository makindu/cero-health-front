import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Lock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { useMoney } from '../finance/use-finance';
import { CashClosureDialog } from './CashClosureDialog';
import { apiClosure } from './closure-api';

/**
 * Tableau de bord du caissier : journées à clôturer. Une journée passée non clôturée reste ici, en alerte, jusqu'à sa clôture.
 * Rien à afficher (aucune journée en attente) : la carte disparaît.
 */
export function CashClosureCard() {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const { activeFacilityId } = usePreferences();
  const [date, setDate] = useState<string | null>(null);
  const pending = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'billing', 'closure-pending'),
    queryFn: apiClosure.pending,
    refetchOnWindowFocus: true,
  });
  const days = pending.data ?? [];
  if (days.length === 0) return date ? <CashClosureDialog date={date} onClose={() => setDate(null)} /> : null;
  const overdue = days.filter((d) => !d.isToday).length;

  return (
    <>
      <Card className={`mb-4 p-4 ${overdue > 0 ? 'border-danger' : ''}`} aria-label={t('closure.cardTitle', { defaultValue: 'Clôtures de caisse' })}>
        <div className="mb-3 flex items-center gap-2">
          {overdue > 0 ? <AlertTriangle className="size-5 text-danger" aria-hidden /> : <Lock className="size-5" aria-hidden />}
          <h2 className="text-base font-semibold">
            {overdue > 0
              ? t('closure.overdue', { defaultValue: 'Clôture en attente : {{count}} journée(s) non clôturée(s)', count: overdue })
              : t('closure.todayTitle', { defaultValue: 'Clôture de la journée' })}
          </h2>
        </div>
        <ul className="divide-y">
          {days.map((d) => (
            <li key={d.date} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p className="text-sm font-medium">
                  {new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                  {!d.isToday && <span className="ms-2 text-xs font-semibold text-danger">{t('closure.late', { defaultValue: 'En retard' })}</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {d.currencies.map((c) => `${t('closure.expected', { defaultValue: 'Espèces attendues' })} ${money(c.expectedMinor, c.currency)}`).join(' · ')}
                </p>
              </div>
              <Button size="sm" variant={d.isToday ? 'outline' : 'primary'} onClick={() => setDate(d.date)}>{t('closure.action', { defaultValue: 'Clôturer' })}</Button>
            </li>
          ))}
        </ul>
      </Card>
      {date && <CashClosureDialog date={date} onClose={() => setDate(null)} />}
    </>
  );
}
