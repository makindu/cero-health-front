import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/feedback/spinner';
import { Card } from '@/components/ui/card';
import { useFormatters } from '@/core/i18n/useFormatters';
import { PlaceBadge, useFlowText } from './flow-labels';
import { historyOf, minutesSince } from './flow-rules';
import { PATIENT_FLOW_AVAILABLE, usePatientFlow } from './use-patient-flow';

/** Fiche patient : dernière position connue (en haut) puis historique daté, du plus récent au plus ancien. */
export function PatientPosition({ patientId }: { patientId: string }) {
  const { t } = useTranslation('patientFlow');
  const f = useFormatters();
  const x = useFlowText();
  const q = usePatientFlow();
  if (!PATIENT_FLOW_AVAILABLE) return <Card><p className="text-sm text-muted-foreground">{t('localOnly')}</p></Card>;
  if (q.isPending) return <Skeleton className="h-32" />;
  const now = new Date(q.data?.now ?? Date.now());
  const history = historyOf(q.data?.events ?? [], patientId, now);
  const last = history[0];
  return (
    <Card>
      {!last ? (
        <p className="text-sm text-muted-foreground">{t('noHistory')}</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('current')}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <PlaceBadge place={last.place} />
              <span className="font-medium">{x.step(last)}</span>
              <span className="text-sm text-muted-foreground">{f.dateTime(last.at)} · {t('ago', { min: minutesSince(last.at, now) })}</span>
            </div>
          </div>
          <ol className="space-y-2 border-s border-border ps-4" aria-label={t('history')}>
            {history.slice(0, 40).map((e, i) => (
              <li key={`${e.at}-${i}`} className="text-sm">
                <span className="tabular-nums text-muted-foreground">{f.dateTime(e.at)}</span> — <span className="font-medium">{x.place(e.place)}</span> · {x.step(e)}
                {x.detail(e) && <span className="text-muted-foreground"> ({x.detail(e)})</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}
