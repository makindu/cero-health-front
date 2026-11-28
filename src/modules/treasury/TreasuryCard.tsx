import { useQuery } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { useMoney } from '../finance/use-finance';
import { TreasuryDialog } from './TreasuryDialog';
import { apiTreasury } from './treasury-api';

/**
 * Tableau de bord de la financière : versements des caissiers à recevoir (ou contestés) et accès à la trésorerie.
 * Pour un caissier (sans le droit de trésorerie) : l'état de ses propres versements tant qu'ils ne sont pas reçus.
 */
export function TreasuryCard({ finance }: { finance: boolean }) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const { activeFacilityId } = usePreferences();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'treasury', 'handovers'), queryFn: () => apiTreasury.handovers(), refetchOnWindowFocus: true });
  const todo = (q.data ?? []).filter((h) => h.status !== 'accepted');
  if (!finance && todo.length === 0) return null;

  return (
    <>
      <Card className={`mb-4 p-4 ${finance && todo.length > 0 ? 'border-primary' : ''}`} aria-label={t('treasury.cardTitle', { defaultValue: 'Trésorerie' })}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Landmark className="size-5" aria-hidden />
            <div>
              <h2 className="text-base font-semibold">
                {finance
                  ? t('treasury.cardFinance', { defaultValue: 'Versements à recevoir : {{count}}', count: todo.length })
                  : t('treasury.cardCashier', { defaultValue: 'Versement en attente de réception' })}
              </h2>
              <p className="text-xs text-muted-foreground">
                {todo.slice(0, 3).map((h) => `${h.fromUserName || '—'} ${money(h.declaredMinor, h.currency)}${h.status === 'disputed' ? ` (${t('treasury.status.disputed', { defaultValue: 'Contesté' })})` : ''}`).join(' · ')}
              </p>
            </div>
          </div>
          {finance && <Button size="sm" onClick={() => setOpen(true)}>{t('treasury.open', { defaultValue: 'Ouvrir la trésorerie' })}</Button>}
        </div>
      </Card>
      {open && <TreasuryDialog onClose={() => setOpen(false)} />}
    </>
  );
}
