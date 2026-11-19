import { Activity, CircleCheck, Hourglass, LogIn, Stethoscope, UserPlus, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, type Column } from '@/components/tables/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { useNow } from '@/hooks/useNow';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { LOADED_AT } from '@/utils/dates';
import { CommandButton } from '../_shared/command-button';
import { DemoNotice } from '../_shared/demo-notice';
import { useResourceList } from '../_shared/use-resource';
import { AppointmentDetail } from './AppointmentDetail';
import { AppointmentStatusBadge } from './columns';
import { appointmentService, type Appointment } from './data';
import { localDayKey } from './scheduling';
import { WalkInDialog } from './WalkInDialog';
import { FeeBadge } from './FeeBadge';
import { buildPresent, type PresentRow } from './present-rules';
import { triageService } from '../nursing/data';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import { PersonName } from '@/components/ui/avatar';
import { Avatar } from '@/components/ui/avatar';

const P = PERMISSIONS.appointments;

/**
 * Accueil : file du jour. À accueillir → en salle d'attente → en consultation.
 * Chaque transition est une commande confirmée ; sans API, rien n'est modifié et l'interface le dit.
 */
export function ReceptionPanel() {
  const { t } = useTranslation('appointments');
  const f = useFormatters();
  const now = useNow();
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  const today = localDayKey(LOADED_AT);

  const list = useResourceList('appointments', appointmentService, {
    page: 1,
    perPage: 200,
    search: '',
    filters: { from: today, to: today },
    sort: { columnId: 'startsAt', direction: 'asc' },
  });
  const rows = list.data?.rows ?? [];
  const toWelcome = rows.filter((a) => a.status === 'scheduled' || a.status === 'confirmed');
  const triage = useResourceList('triage', triageService, { page: 1, perPage: 200, search: '', filters: {}, sort: null });
  const present = buildPresent(rows, triage.data?.rows ?? [], today);
  const waiting = present.filter((r) => r.stage === 'waiting');
  const atTriage = present.filter((r) => r.orientation === 'triage' && r.stage !== 'inCare');
  const inConsult = present.filter((r) => r.stage === 'inConsultation' || r.stage === 'inCare');
  const done = rows.filter((a) => a.status === 'done');

  const lateMinutes = (a: Appointment) => Math.max(0, Math.round((now - new Date(a.startsAt).getTime()) / 60000));

  const cmd = (a: Appointment, action: string, label: string, permission: string, icon: ReactNode) => (
    <CommandButton
      name="appointments"
      service={appointmentService}
      id={a.id}
      action={action}
      label={label}
      permission={permission}
      confirmTitle={t(`confirmTitles.${action}`)}
      icon={icon}
    />
  );
  const open = (a: Appointment) => (
    <Button variant="ghost" size="sm" onClick={() => setSelected(a)}>
      {t('reception.details')}
    </Button>
  );
  const base: Column<Appointment>[] = [
    { id: 'time', header: t('reception.scheduledAt'), cell: (a) => f.time(a.startsAt) },
    { id: 'patient', header: t('columns.patient'), cell: (a) => <PersonName name={a.patientName} />, primary: true },
    { id: 'practitioner', header: t('columns.practitioner'), cell: (a) => a.practitioner },
  ];
  const tone = (p: PresentRow['priority']): StatusTone => (p === 'immediate' || p === 'veryUrgent' ? 'danger' : p === 'urgent' ? 'warning' : 'neutral');
  const orientationText = (r: PresentRow): string => {
    if (r.orientation === 'triage') return t('reception.orientation.triage');
    const who = r.practitioner ? ` · ${r.practitioner}` : '';
    return r.orientation === 'service' ? `${t('reception.orientation.service', { service: t(`services.${r.service ?? 'generalMedicine'}`) })}${who}` : `${t('reception.orientation.consultation')}${who}`;
  };
  const presentColumns: Column<PresentRow>[] = [
    { id: 'priority', header: t('reception.present.priority'), cell: (r) => <StatusBadge tone={tone(r.priority)}>{t(`walkIn.priority.${r.priority}`)}</StatusBadge> },
    { id: 'patient', header: t('columns.patient'), cell: (r) => <PersonName name={r.patientName} />, primary: true },
    { id: 'origin', header: t('reception.present.origin'), cell: (r) => t(`reception.origin.${r.origin}`) },
    { id: 'orientation', header: t('reception.present.orientation'), cell: orientationText },
    { id: 'arrival', header: t('detail.arrivedAt'), cell: (r) => f.time(r.arrivedAt) },
    { id: 'wait', header: t('reception.waited'), cell: (r) => t('reception.minutes', { count: Math.max(0, Math.round((now - new Date(r.arrivedAt).getTime()) / 60000)) }) },
    { id: 'stage', header: t('columns.status'), cell: (r) => <StatusBadge tone={r.stage === 'waiting' ? 'warning' : 'info'}>{t(`reception.stage.${r.stage}`)}</StatusBadge> },
    { id: 'fee', header: t('reception.fee.header'), cell: (r) => <FeeBadge patientId={r.patientId} /> },
    {
      id: 'actions', header: t('module.actions'), className: 'text-end',
      cell: (r) => {
        const a = r.appointment;
        if (!a) return <span className="text-xs text-muted-foreground">{t('reception.present.nurseNote')}</span>;
        return (
          <div className="flex flex-wrap justify-end gap-2">
            {a.status === 'arrived' && cmd(a, 'wait', t('actions.wait'), P.checkIn, <Hourglass className="size-4" />)}
            {a.status !== 'inProgress' && cmd(a, 'start', t('actions.start'), P.update, <Stethoscope className="size-4" />)}
            {open(a)}
          </div>
        );
      },
    },
  ];
  const sections: { key: string; title: string; rows: Appointment[]; columns: Column<Appointment>[] }[] = [
    {
      key: 'welcome',
      title: t('reception.toWelcome'),
      rows: toWelcome,
      columns: [
        ...base,
        { id: 'late', header: t('reception.delay'), cell: (a) => (lateMinutes(a) > 15 ? t('reception.late', { count: lateMinutes(a) }) : '—') },
        { id: 'fee', header: t('reception.fee.header'), cell: (a) => <FeeBadge patientId={a.patientId} /> },
        { id: 'status', header: t('columns.status'), cell: (a) => <AppointmentStatusBadge status={a.status} /> },
        {
          id: 'actions',
          header: t('module.actions'),
          className: 'text-end',
          cell: (a) => (
            <div className="flex flex-wrap justify-end gap-2">
              {cmd(a, 'check-in', t('actions.checkIn'), P.checkIn, <LogIn className="size-4" />)}
              {open(a)}
            </div>
          ),
        },
      ],
    },
  ];

  return (
    <>
      {list.data?.isDemo && <DemoNotice endpoint={appointmentService.endpoint} />}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('walkIn.hint')}</p>
        <Can permission={P.checkIn}>
          <Button leftIcon={<UserPlus className="size-4" />} onClick={() => setWalkIn(true)}>
            {t('walkIn.button')}
          </Button>
        </Can>
      </div>
      <WalkInDialog open={walkIn} onClose={() => setWalkIn(false)} />
      <StatGrid>
        <StatCard icon={Users} label={t('reception.toWelcome')} value={toWelcome.length} />
        <StatCard icon={Hourglass} tone="warning" label={t('reception.waitingRoom')} value={waiting.length} />
        <StatCard icon={Activity} tone="warning" label={t('reception.atTriage')} value={atTriage.length} />
        <StatCard icon={Stethoscope} tone="info" label={t('reception.inConsultation')} value={inConsult.length} />
        <StatCard icon={CircleCheck} tone="success" label={t('reception.finished')} value={done.length} />
      </StatGrid>
      <div className="space-y-5">
        {sections.map((section) => (
          <Card key={section.key} title={`${section.title} (${section.rows.length})`} className="[&>div]:p-0">
            <DataTable
              caption={section.title}
              columns={section.columns}
              rows={section.rows}
              getRowId={(a) => a.id}
              loading={list.isPending}
              error={list.error}
              onRetry={() => void list.refetch()}
              emptyTitle={t('reception.empty')}
            />
          </Card>
        ))}
        <Card title={`${t('reception.present.title')} (${present.length})`} description={t('reception.present.hint')} className="[&>div]:p-0">
          <DataTable
            caption={t('reception.present.title')}
            columns={presentColumns}
            rows={present}
            getRowId={(r) => r.key}
            loading={list.isPending || triage.isPending}
            error={list.error ?? triage.error}
            onRetry={() => { void list.refetch(); void triage.refetch(); }}
            emptyTitle={t('reception.empty')}
          />
        </Card>
      </div>
      <Dialog
        open={selected !== null}
        onClose={() => setSelected(null)}
        variant="detail"
        leading={selected ? <Avatar name={selected.patientName} size="lg" /> : undefined}
        title={selected ? `${selected.patientName} · ${f.dateTime(selected.startsAt)}` : undefined}
        ariaLabel={t('title')}
      >
        {selected && <AppointmentDetail appointment={selected} />}
      </Dialog>
    </>
  );
}
