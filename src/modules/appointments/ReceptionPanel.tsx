import { CircleCheck, Hourglass, LogIn, Stethoscope, UserPlus, Users } from 'lucide-react';
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
  const waiting = rows
    .filter((a) => a.status === 'arrived' || a.status === 'waiting')
    .sort((x, y) => (x.arrivedAt ?? x.startsAt).localeCompare(y.arrivedAt ?? y.startsAt));
  const inConsult = rows.filter((a) => a.status === 'inProgress');
  const done = rows.filter((a) => a.status === 'done');

  const waitMinutes = (a: Appointment) => (a.arrivedAt ? Math.max(0, Math.round((now - new Date(a.arrivedAt).getTime()) / 60000)) : null);
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
  const sections: { key: string; title: string; rows: Appointment[]; columns: Column<Appointment>[] }[] = [
    {
      key: 'welcome',
      title: t('reception.toWelcome'),
      rows: toWelcome,
      columns: [
        ...base,
        { id: 'late', header: t('reception.delay'), cell: (a) => (lateMinutes(a) > 15 ? t('reception.late', { count: lateMinutes(a) }) : '—') },
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
    {
      key: 'waiting',
      title: t('reception.waitingRoom'),
      rows: waiting,
      columns: [
        ...base,
        { id: 'arrival', header: t('detail.arrivedAt'), cell: (a) => (a.arrivedAt ? f.time(a.arrivedAt) : '—') },
        { id: 'wait', header: t('reception.waited'), cell: (a) => { const m = waitMinutes(a); return m === null ? '—' : t('reception.minutes', { count: m }); } },
        { id: 'status', header: t('columns.status'), cell: (a) => <AppointmentStatusBadge status={a.status} /> },
        {
          id: 'actions',
          header: t('module.actions'),
          className: 'text-end',
          cell: (a) => (
            <div className="flex flex-wrap justify-end gap-2">
              {a.status === 'arrived' && cmd(a, 'wait', t('actions.wait'), P.checkIn, <Hourglass className="size-4" />)}
              {cmd(a, 'start', t('actions.start'), P.update, <Stethoscope className="size-4" />)}
              {open(a)}
            </div>
          ),
        },
      ],
    },
    {
      key: 'consult',
      title: t('reception.inConsultation'),
      rows: inConsult,
      columns: [
        ...base,
        { id: 'status', header: t('columns.status'), cell: (a) => <AppointmentStatusBadge status={a.status} /> },
        { id: 'actions', header: t('module.actions'), className: 'text-end', cell: (a) => <div className="flex justify-end">{open(a)}</div> },
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
