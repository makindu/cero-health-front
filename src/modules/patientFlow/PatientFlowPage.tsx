import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/feedback/spinner';
import { SearchInput } from '@/components/forms/search-input';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { env } from '@/core/config/env';
import { useFormatters } from '@/core/i18n/useFormatters';
import { DemoNotice } from '../_shared/demo-notice';
import { PlaceBadge, useFlowText } from './flow-labels';
import { PLACES, minutesSince, type Place } from './flow-rules';
import { PATIENT_FLOW_AVAILABLE, usePatientFlow } from './use-patient-flow';
import { Avatar } from '@/components/ui/avatar';

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Elapsed time shown as « 25 min » / « 2 h 10 » / « 3 j ». */
function useSince() {
  const { t } = useTranslation('patientFlow');
  return (iso: string, now: Date): string => {
    const m = minutesSince(iso, now);
    if (m < 1) return t('since.now');
    if (m < 60) return t('since.minutes', { count: m });
    if (m < 1440) return t('since.hours', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });
    return t('since.days', { count: Math.floor(m / 1440) });
  };
}

/** Suivi des patients : dernière position connue de chaque patient présent aujourd'hui, déduite des opérations enregistrées. */
export default function PatientFlowPage() {
  const { t } = useTranslation('patientFlow');
  const { t: tc } = useTranslation();
  const f = useFormatters();
  const x = useFlowText();
  const since = useSince();
  const q = usePatientFlow();
  const [place, setPlace] = useState<Place | 'all'>('all');
  const [search, setSearch] = useState('');

  const rows = q.data?.board ?? [];
  const counts = useMemo(() => {
    const c = new Map<Place, number>();
    for (const r of rows) c.set(r.last.place, (c.get(r.last.place) ?? 0) + 1);
    return c;
  }, [rows]);
  const shown = rows.filter((r) => (place === 'all' || r.last.place === place) && (search.trim() === '' || norm(r.patientName).includes(norm(search.trim())) || norm(r.patientId).includes(norm(search.trim()))));
  const now = q.data ? new Date(q.data.now) : new Date();

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {!PATIENT_FLOW_AVAILABLE && <DemoNotice endpoint="/health/patient-flow" />}
      {q.isPending && PATIENT_FLOW_AVAILABLE ? (
        <div className="space-y-3" aria-busy="true"><Skeleton className="h-10" /><Skeleton className="h-64" /></div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-4">
          <p role="note" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-muted-foreground">{t(env.localMode ? 'note' : 'noteApi')}</p>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('filter.label')}>
            <button type="button" aria-pressed={place === 'all'} onClick={() => setPlace('all')}
              className={`rounded-full border px-3 py-1 text-sm ${place === 'all' ? 'border-primary bg-primary-soft font-medium' : 'border-border'}`}>{t('filter.all')} ({rows.length})</button>
            {PLACES.map((p) => (
              <button key={p} type="button" aria-pressed={place === p} onClick={() => setPlace(p)}
                className={`rounded-full border px-3 py-1 text-sm ${place === p ? 'border-primary bg-primary-soft font-medium' : 'border-border'}`}>{x.place(p)} ({counts.get(p) ?? 0})</button>
            ))}
            <div className="ms-auto w-full sm:w-64"><SearchInput value={search} onChange={setSearch} placeholder={t('search')} label={t('search')} /></div>
          </div>
          <Card className="[&>div]:p-0">
            {shown.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{rows.length === 0 ? t('empty') : t('noMatch')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-start text-xs text-muted-foreground">
                      <th scope="col" className="px-4 py-2 text-start font-medium">{t('columns.patient')}</th>
                      <th scope="col" className="px-4 py-2 text-start font-medium">{t('columns.position')}</th>
                      <th scope="col" className="px-4 py-2 text-start font-medium">{t('columns.since')}</th>
                      <th scope="col" className="px-4 py-2 text-start font-medium">{t('columns.detail')}</th>
                      <th scope="col" className="px-4 py-2 text-start font-medium">{t('columns.today')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {shown.map((r) => (
                      <tr key={r.patientId}>
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center gap-2">
                            <Avatar name={r.patientName} />
                            <span>
                              <Link to={`/patients/${r.patientId}`} className="font-medium text-primary-ink underline">{r.patientName}</Link>
                              <span className="block text-xs text-muted-foreground">{r.patientId}</span>
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <PlaceBadge place={r.last.place} />
                            <span>{x.step(r.last)}</span>
                            {r.inpatientWard && <StatusBadge tone="warning">{t('inpatient', { ward: tc(`services.${r.inpatientWard}`, { defaultValue: r.inpatientWard }) })}</StatusBadge>}
                          </div>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className="tabular-nums">{f.dateTime(r.last.at)}</span>
                          <span className="block text-xs text-muted-foreground">{since(r.last.at, now)}</span>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{x.detail(r.last) || '—'}</td>
                        <td className="px-4 py-2 tabular-nums">{r.todayCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
