import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/feedback/spinner';
import { PersonName } from '@/components/ui/avatar';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/core/auth/cero-id';
import { useFormatters } from '@/core/i18n/useFormatters';
import { useNow } from '@/hooks/useNow';
import { appointmentService } from '../appointments/data';
import { StartConsultationButton } from '../appointments/StartConsultationButton';
import { consultationService } from '../consultations/data';
import { useStaffMembers } from '../_shared/reference-data';
import { useResourceList } from '../_shared/use-resource';
import { findMyStaff, myConsultations, myQueue, unassignedQueue } from './my-queue';

/**
 * Poste du médecin : SES patients arrivés ou en attente, ses consultations à reprendre et à signer.
 * Le serveur ne renvoie que ce que le compte a le droit de lire ; ici on ne fait que filtrer sur son profil.
 */
const URGENT_TONE: Record<string, StatusTone> = { immediate: 'danger', veryUrgent: 'warning', urgent: 'info' };

/** Pastille de priorité (uniquement pour les cas urgents venus du triage). */
function UrgencyBadge({ urgency }: { urgency?: string }) {
  const { t } = useTranslation('nursing');
  const tone = urgency ? URGENT_TONE[urgency] : undefined;
  return tone ? <StatusBadge tone={tone}>{t(`priority.${urgency}`)}</StatusBadge> : null;
}

export function DoctorQueue() {
  const { t } = useTranslation('dashboard');
  const { user } = useAuth();
  const staff = useStaffMembers();
  if (staff.isPending) return <Skeleton className="mb-5 h-40" />;
  if (staff.error) return <div className="mb-5"><ErrorState error={staff.error} onRetry={() => void staff.refetch()} /></div>;
  const me = findMyStaff(staff.data ?? [], user?.id);
  if (!me) return <p className="mb-5 rounded-card border border-border bg-surface p-4 text-sm text-muted-foreground">{t('doctor.noProfile')}</p>;
  return <MyQueue staffId={me.id} unitId={me.careUnitId} />;
}

function MyQueue({ staffId, unitId }: { staffId: string; unitId?: string }) {
  const { t } = useTranslation('dashboard');
  const { t: ta } = useTranslation('appointments');
  const f = useFormatters();
  const now = useNow();
  const appointments = useResourceList('appointments', appointmentService, {
    page: 1, perPage: 100, search: '', filters: { period: 'today', practitioner: staffId }, sort: { columnId: 'startsAt', direction: 'asc' },
  });
  // Patients du service sans médecin assigné (sans service rattaché au profil : tous ceux de l'établissement).
  const unassigned = useResourceList('appointments', appointmentService, {
    page: 1, perPage: 100, search: '', filters: unitId ? { period: 'today', service: unitId } : { period: 'today' }, sort: { columnId: 'startsAt', direction: 'asc' },
  });
  const consultations = useResourceList('consultations', consultationService, {
    page: 1, perPage: 50, search: '', filters: { practitioner_staff_id: staffId }, sort: null,
  });
  const queue = myQueue(appointments.data?.rows ?? []);
  const free = unassignedQueue(unassigned.data?.rows ?? []);
  const { open, toSign } = myConsultations(consultations.data?.rows ?? []);

  return (
    <div className="mb-5 grid gap-4 lg:grid-cols-3">
      <Card title={`${t('doctor.queue')} (${queue.length})`} description={t('doctor.queueHint')} className="lg:col-span-2">
        {appointments.isPending && <Skeleton className="h-24" />}
        {appointments.error && <ErrorState error={appointments.error} onRetry={() => void appointments.refetch()} />}
        {!appointments.isPending && !appointments.error && queue.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{t('doctor.queueEmpty')}</p>}
        <ul className="divide-y divide-border text-sm">
          {queue.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><PersonName name={a.patientName} size="sm" /><UrgencyBadge urgency={a.urgency} /></div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {ta(`reason.${a.reason}`)} · {t('doctor.arrived', { time: f.time(a.arrivedAt ?? a.startsAt) })} · {t('lists.minutes', { count: Math.max(0, Math.round((now - new Date(a.arrivedAt ?? a.startsAt).getTime()) / 60000)) })}
                </p>
              </div>
              <StartConsultationButton appointment={a} />
            </li>
          ))}
        </ul>
      </Card>
      <div className="space-y-4">
        {free.length > 0 && (
          <Card title={`${t('doctor.unassigned')} (${free.length})`} description={t('doctor.unassignedHint')}>
            <ul className="divide-y divide-border text-sm">
              {free.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><PersonName name={a.patientName} size="sm" /><UrgencyBadge urgency={a.urgency} /></div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {ta(`reason.${a.reason}`)} · {t('doctor.arrived', { time: f.time(a.arrivedAt ?? a.startsAt) })} · {t('lists.minutes', { count: Math.max(0, Math.round((now - new Date(a.arrivedAt ?? a.startsAt).getTime()) / 60000)) })}
                    </p>
                  </div>
                  <StartConsultationButton appointment={a} />
                </li>
              ))}
            </ul>
          </Card>
        )}
        <ConsultationList title={`${t('doctor.open')} (${open.length})`} rows={open} loading={consultations.isPending} error={consultations.error} onRetry={() => void consultations.refetch()} />
        <ConsultationList title={`${t('doctor.toSign')} (${toSign.length})`} rows={toSign} loading={consultations.isPending} error={consultations.error} onRetry={() => void consultations.refetch()} />
      </div>
    </div>
  );
}

function ConsultationList({ title, rows, loading, error, onRetry }: { title: string; rows: ReturnType<typeof myConsultations>['open']; loading: boolean; error: unknown; onRetry: () => void }) {
  const { t } = useTranslation('dashboard');
  const f = useFormatters();
  return (
    <Card title={title}>
      {loading && <Skeleton className="h-16" />}
      {Boolean(error) && <ErrorState error={error} onRetry={onRetry} />}
      {!loading && !error && rows.length === 0 && <p className="py-2 text-center text-sm text-muted-foreground">{t('lists.none')}</p>}
      <ul className="divide-y divide-border text-sm">
        {rows.slice(0, 6).map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-2">
            <Link to={`/consultations/${encodeURIComponent(c.id)}`} className="min-w-0 font-medium text-primary-ink underline">{c.patientName}</Link>
            <span className="shrink-0 text-xs text-muted-foreground">{f.dateTime(c.date)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
