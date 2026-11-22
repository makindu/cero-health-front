import { CircleCheck, Clock, Hourglass, Siren, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/feedback/spinner';
import { PersonName } from '@/components/ui/avatar';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { useFormatters } from '@/core/i18n/useFormatters';
import { useNow } from '@/hooks/useNow';
import { CommandButton } from '../_shared/command-button';
import { useResourceList } from '../_shared/use-resource';
import { triageService, type TriageEntry, type TriagePriority } from '../nursing/data';
import { SendToDoctorButton } from '../nursing/SendToDoctorButton';
import { VitalsEntryButton } from '../nursing/VitalsEntryButton';

const PRIORITY_STYLE: Record<TriagePriority, { tone: StatusTone; icon: typeof Siren }> = {
  immediate: { tone: 'danger', icon: Siren },
  veryUrgent: { tone: 'warning', icon: TriangleAlert },
  urgent: { tone: 'info', icon: Clock },
  standard: { tone: 'success', icon: CircleCheck },
  nonUrgent: { tone: 'neutral', icon: Hourglass },
};

/**
 * Poste de l'infirmier : toute la file de triage avec les actions à portée de clic
 * (démarrer le triage, saisir les constantes, envoyer en soins ou chez un médecin). Mise à jour en direct.
 */
export function NurseQueue() {
  const { t } = useTranslation('dashboard');
  const list = useResourceList('triage', triageService, { page: 1, perPage: 100, search: '', filters: {}, sort: { columnId: 'priority', direction: 'asc' } });
  const rows = (list.data?.rows ?? []).filter((e) => e.status === 'waiting' || e.status === 'inTriage' || e.status === 'inCare');
  return (
    <Card title={`${t('nurse.queue')} (${rows.length})`} description={t('nurse.queueHint')} className="mb-5">
      {list.isPending && <Skeleton className="h-24" />}
      {list.error && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
      {!list.isPending && !list.error && rows.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{t('nurse.queueEmpty')}</p>}
      <ul className="divide-y divide-border text-sm">
        {rows.map((e) => (
          <NurseRow key={e.id} entry={e} />
        ))}
      </ul>
    </Card>
  );
}

function NurseRow({ entry: e }: { entry: TriageEntry }) {
  const { t } = useTranslation('dashboard');
  const { t: tn } = useTranslation('nursing');
  const f = useFormatters();
  const now = useNow();
  const style = PRIORITY_STYLE[e.priority];
  const cmd = (action: 'start-triage' | 'send-to-care' | 'transfer' | 'discharge', variant: 'primary' | 'outline' | 'ghost') => (
    <CommandButton
      name="triage"
      service={triageService}
      id={e.id}
      action={action}
      label={tn(action === 'start-triage' ? 'actions.start-short' : `actions.${action}`)}
      permission={PERMISSIONS.nursing.record}
      confirmTitle={tn(`confirmTitles.${action}`)}
      variant={variant}
    />
  );
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <StatusBadge tone={style.tone} icon={style.icon}>{tn(`priority.${e.priority}`)}</StatusBadge>
        <div className="min-w-0">
          <PersonName name={e.patientName} size="sm" />
          <p className="mt-0.5 text-xs text-muted-foreground">
            {tn(`category.${e.category}`)} · {tn(`status.${e.status}`)} · {t('doctor.arrived', { time: f.time(e.arrivedAt) })} · {t('lists.minutes', { count: Math.max(0, Math.round((now - new Date(e.arrivedAt).getTime()) / 60000)) })}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {e.status === 'waiting' && cmd('start-triage', 'primary')}
        {e.status === 'inTriage' && (
          <>
            <VitalsEntryButton entry={e} />
            {cmd('send-to-care', 'outline')}
            <SendToDoctorButton entry={e} />
          </>
        )}
        {e.status === 'inCare' && (
          <>
            <SendToDoctorButton entry={e} />
            {cmd('transfer', 'outline')}
            {cmd('discharge', 'ghost')}
          </>
        )}
      </div>
    </li>
  );
}
