import { CalendarClock, CalendarX2, CheckCheck, CirclePlay, CircleCheck, Hourglass, LogIn, Pencil, UserX } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button, type ButtonVariant } from '@/components/ui/button';
import { useNow } from '@/hooks/useNow';
import { StatusBadge } from '@/components/ui/badge';
import { queryKeys } from '@/core/api';
import { usePreferences } from '@/core/preferences/preferences-store';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { CommandButton } from '../_shared/command-button';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { AppointmentStatusBadge } from './columns';
import { AppointmentEditDialog, CancelDialog, RescheduleDialog } from './AppointmentDialogs';
import { appointmentService, type Appointment } from './data';
import { NEXT_ACTIONS } from './scheduling';
import { fetchAppointmentHistory } from './history-api';
import { AssignPractitionerButton } from './AssignPractitionerButton';
import { isUnassigned } from './start-consultation';
import { referenceFromApi } from '../_shared/reference-data';
import { useServiceLabel } from './service-options';

const P = PERMISSIONS.appointments;

/** Fiche d'un rendez-vous : résumé, actions possibles selon le statut ET les permissions, historique tracé. */
export function AppointmentDetail({ appointment: a }: { appointment: Appointment }) {
  const { t } = useTranslation('appointments');
  const f = useFormatters();
  const serviceLabel = useServiceLabel();
  const [dialog, setDialog] = useState<'edit' | 'reschedule' | 'cancel' | null>(null);
  const now = useNow();
  const walkIn = a.reason === 'walkIn';
  const fromApi = referenceFromApi();
  const unassigned = isUnassigned(a);
  const { activeFacilityId } = usePreferences();
  const historyQuery = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'appointments', 'history', a.id),
    queryFn: () => fetchAppointmentHistory(a.id),
    enabled: fromApi,
    staleTime: 0,
  });
  const events = fromApi ? historyQuery.data ?? [] : a.history;
  const inQueue = a.status === 'arrived' || a.status === 'waiting';
  const allowed = NEXT_ACTIONS[a.status];
  const has = (action: (typeof allowed)[number]) => allowed.includes(action);
  const command = (action: string, label: string, permission: string, icon: ReactNode, variant?: ButtonVariant) => (
    <CommandButton
      name="appointments"
      service={appointmentService}
      id={a.id}
      action={action}
      label={label}
      permission={permission}
      confirmTitle={t(`confirmTitles.${action}`)}
      icon={icon}
      variant={variant}
    />
  );

  return (
    <div className="space-y-5">
      <DetailSection title={walkIn ? t('detail.visit') : t('detail.summary')}>
        <DescriptionList
          items={[
            { label: t('columns.patient'), value: <Link to={`/patients/${encodeURIComponent(a.patientId)}`} className="underline">{a.patientName}</Link> },
            { label: t('detail.reference'), value: a.id },
            ...(walkIn ? [] : [{ label: t('columns.date'), value: f.dateTime(a.startsAt) }, { label: t('detail.duration'), value: t('detail.minutes', { count: a.durationMin }) }]),
            { label: t('columns.service'), value: serviceLabel(a) },
            { label: t('columns.practitioner'), value: walkIn && unassigned ? t('detail.toAssign') : a.practitioner },
            { label: t('columns.reason'), value: t(`reason.${a.reason}`) },
            { label: t('columns.status'), value: inQueue ? <StatusBadge tone="warning">{t('reception.stage.waiting')}</StatusBadge> : <AppointmentStatusBadge status={a.status} /> },
            ...(a.arrivedAt ? [{ label: t('detail.arrivedAt'), value: f.time(a.arrivedAt) }] : []),
            ...(walkIn && a.arrivedAt && inQueue ? [{ label: t('detail.waited'), value: t('reception.minutes', { count: Math.max(0, Math.round((now - new Date(a.arrivedAt).getTime()) / 60000)) }) }] : []),
          ]}
        />
      </DetailSection>

      <DetailSection title={t('detail.actions')}>
        {allowed.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('detail.noActions')}</p>
        ) : walkIn ? (
          <div className="flex flex-wrap items-center gap-2">
            {has('start') && (fromApi && unassigned
              ? <AssignPractitionerButton appointment={a} label={t('actions.start')} />
              : command('start', t('actions.start'), P.update, <CirclePlay className="size-4" />, 'primary'))}
            {fromApi && inQueue && !unassigned && <AssignPractitionerButton appointment={a} change />}
            {has('complete') && command('complete', t('actions.complete'), P.update, <CircleCheck className="size-4" />)}
            {has('cancel') && (
              <Can permission={P.cancel}>
                <Button variant="ghost" size="sm" className="ms-auto text-red-600 dark:text-red-400" leftIcon={<CalendarX2 className="size-4" />} onClick={() => setDialog('cancel')}>
                  {t('actions.cancelVisit')}
                </Button>
              </Can>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {has('confirm') && command('confirm', t('actions.confirm'), P.update, <CheckCheck className="size-4" />)}
            {has('checkIn') && command('check-in', t('actions.checkIn'), P.checkIn, <LogIn className="size-4" />)}
            {has('wait') && command('wait', t('actions.wait'), P.checkIn, <Hourglass className="size-4" />)}
            {has('start') && referenceFromApi() && isUnassigned(a) && <AssignPractitionerButton appointment={a} label={t('actions.start')} />}
            {has('start') && !(referenceFromApi() && isUnassigned(a)) && command('start', t('actions.start'), P.update, <CirclePlay className="size-4" />)}
            {has('complete') && command('complete', t('actions.complete'), P.update, <CircleCheck className="size-4" />)}
            {has('noShow') && command('no-show', t('actions.noShow'), P.update, <UserX className="size-4" />)}
            {has('edit') && (
              <Can permission={P.update}>
                <Button variant="outline" size="sm" leftIcon={<Pencil className="size-4" />} onClick={() => setDialog('edit')}>
                  {t('actions.edit')}
                </Button>
              </Can>
            )}
            {has('reschedule') && (
              <Can permission={P.update}>
                <Button variant="outline" size="sm" leftIcon={<CalendarClock className="size-4" />} onClick={() => setDialog('reschedule')}>
                  {t('actions.reschedule')}
                </Button>
              </Can>
            )}
            {has('cancel') && (
              <Can permission={P.cancel}>
                <Button variant="danger" size="sm" leftIcon={<CalendarX2 className="size-4" />} onClick={() => setDialog('cancel')}>
                  {t('actions.cancel')}
                </Button>
              </Can>
            )}
          </div>
        )}
        <AppointmentEditDialog appointment={a} open={dialog === 'edit'} onClose={() => setDialog(null)} />
        <RescheduleDialog appointment={a} open={dialog === 'reschedule'} onClose={() => setDialog(null)} />
        <CancelDialog appointment={a} visit={walkIn} open={dialog === 'cancel'} onClose={() => setDialog(null)} />
      </DetailSection>

      <DetailSection title={t('history.title')}>
        <ol className="space-y-2 border-s border-border ps-4 text-sm">
          {historyQuery.isError && fromApi && <li className="text-muted-foreground">{t('history.loadFailed')}</li>}
          {[...events].sort((x, y) => y.at.localeCompare(x.at)).map((event, index) => (
            <li key={`${event.type}-${event.at}-${index}`}>
              <p className="font-medium">{t(event.type === 'created' && walkIn ? 'history.createdWalkIn' : `history.${event.type}`)}</p>
              <p className="text-muted-foreground">
                {f.dateTime(event.at)} · {event.by}
              </p>
              {event.from && <p className="text-muted-foreground">{t('history.from', { date: f.dateTime(event.from) })}</p>}
              {event.reason && <p className="text-muted-foreground">{t('history.reason')} : {t(`changeReason.${event.reason}`, { defaultValue: event.reason })}</p>}
            </li>
          ))}
        </ol>
        {!fromApi && <p className="mt-3 text-xs text-muted-foreground">{t('history.serverNote')}</p>}
      </DetailSection>
    </div>
  );
}
