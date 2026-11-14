import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/forms/controls';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/feedback/spinner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useFormatters } from '@/core/i18n/useFormatters';
import { cn } from '@/utils/cn';
import { LOADED_AT } from '@/utils/dates';
import { DemoNotice } from '../_shared/demo-notice';
import { useResourceList } from '../_shared/use-resource';
import { AppointmentDetail } from './AppointmentDetail';
import { APPOINTMENT_STATUSES } from './columns';
import { appointmentService, type Appointment, type AppointmentStatus } from './data';
import { Avatar } from '@/components/ui/avatar';
import {
  addDays,
  addMonths,
  appointmentsOnDay,
  dayFromKey,
  hourBounds,
  layoutLanes,
  localDayKey,
  monthGridDays,
  practitionersOf,
  rangeFor,
  startOfWeek,
  weekDays,
  type CalendarView as View,
} from './scheduling';

const ROW_H = 52; // px par heure
const MAX_ROWS = 500;

const CHIP: Record<AppointmentStatus, string> = {
  scheduled: 'border-border bg-surface-muted text-foreground',
  confirmed: 'border-info bg-info-soft text-info-ink',
  arrived: 'border-warning bg-warning-soft text-warning-ink',
  waiting: 'border-warning bg-warning-soft text-warning-ink',
  inProgress: 'border-info bg-info-soft text-info-ink',
  done: 'border-success bg-success-soft text-success-ink',
  cancelled: 'border-border bg-surface text-muted-foreground line-through opacity-70',
  noShow: 'border-danger bg-danger-soft text-danger-ink',
};

function Chip({ appointment, onSelect, compact = false }: { appointment: Appointment; onSelect: (a: Appointment) => void; compact?: boolean }) {
  const { t } = useTranslation('appointments');
  const f = useFormatters();
  const label = `${f.time(appointment.startsAt)} ${appointment.patientName} — ${t(`status.${appointment.status}`)}`;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => onSelect(appointment)}
      className={cn('w-full overflow-hidden rounded border-s-4 px-1.5 py-0.5 text-start text-xs leading-tight', CHIP[appointment.status])}
    >
      <span className="flex items-center gap-1 truncate font-medium">
        <Avatar name={appointment.patientName} size="xs" />
        <span className="truncate">{f.time(appointment.startsAt)} · {appointment.patientName}</span>
      </span>
      {!compact && <span className="block truncate opacity-80">{t(`status.${appointment.status}`)}</span>}
    </button>
  );
}

interface GridColumn {
  key: string;
  title: string;
  subtitle?: string;
  items: Appointment[];
}

/** Grille horaire : une colonne par jour (semaine) ou par praticien (jour). */
function TimeGrid({ columns, onSelect }: { columns: GridColumn[]; onSelect: (a: Appointment) => void }) {
  const f = useFormatters();
  const { start: START_HOUR, end: END_HOUR } = hourBounds(columns.flatMap((c) => c.items));
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const height = (END_HOUR - START_HOUR) * ROW_H;
  const minutesFromStart = (iso: string) => {
    const d = new Date(iso);
    return (d.getHours() - START_HOUR) * 60 + d.getMinutes();
  };
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: `${3.5 + columns.length * 9}rem` }}>
        <div className="grid border-b border-border" style={{ gridTemplateColumns: `3.5rem repeat(${columns.length}, minmax(8rem, 1fr))` }}>
          <div />
          {columns.map((c) => (
            <div key={c.key} className="border-s border-border px-2 py-2 text-center">
              <p className="truncate text-sm font-medium">{c.title}</p>
              {c.subtitle && <p className="truncate text-xs text-muted-foreground">{c.subtitle}</p>}
            </div>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: `3.5rem repeat(${columns.length}, minmax(8rem, 1fr))` }}>
          <div className="relative" style={{ height }}>
            {hours.map((h) => (
              <span key={h} className="absolute end-1 -translate-y-1/2 text-xs text-muted-foreground" style={{ top: (h - START_HOUR) * ROW_H + 8 }}>
                {f.time(new Date(2000, 0, 1, h))}
              </span>
            ))}
          </div>
          {columns.map((c) => (
            <div
              key={c.key}
              className="relative border-s border-border"
              style={{
                height,
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${ROW_H - 1}px, var(--border) ${ROW_H - 1}px, var(--border) ${ROW_H}px)`,
              }}
            >
              {layoutLanes(c.items).map(({ item, lane, lanes }) => {
                const top = Math.max(0, (minutesFromStart(item.startsAt) / 60) * ROW_H);
                const h = Math.max(24, (item.durationMin / 60) * ROW_H - 2);
                return (
                  <div
                    key={item.id}
                    className="absolute px-0.5"
                    style={{ top, height: h, left: `${(lane / lanes) * 100}%`, width: `${100 / lanes}%` }}
                  >
                    <Chip appointment={item} onSelect={onSelect} compact={h < 40} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Légende : couleur + libellé de chaque statut (le libellé est aussi dans chaque événement, la couleur n'est pas seule). */
function CalendarLegend() {
  const { t } = useTranslation('appointments');
  return (
    <div className="border-b border-border px-4 py-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{t('calendar.legend')}</p>
      <ul className="flex flex-wrap gap-2">
        {APPOINTMENT_STATUSES.map((status) => (
          <li key={status} className={cn('rounded border-s-4 px-2 py-0.5 text-xs', CHIP[status])}>
            {t(`status.${status}`)}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">{t('calendar.legendHint')}</p>
    </div>
  );
}

/** Calendriers jour / semaine / mois et planning par praticien, alimentés par le contrat de liste des rendez-vous. */
export function AppointmentsCalendar() {
  const { t } = useTranslation('appointments');
  const f = useFormatters();
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(() => localDayKey(LOADED_AT));
  const [practitioner, setPractitioner] = useState('');
  const [selected, setSelected] = useState<Appointment | null>(null);
  const range = rangeFor(view, anchor);

  const list = useResourceList('appointments', appointmentService, {
    page: 1,
    perPage: MAX_ROWS,
    search: '',
    filters: { from: range.from, to: range.to },
    sort: { columnId: 'startsAt', direction: 'asc' },
  });

  const all = list.data?.rows ?? [];
  const practitioners = practitionersOf(all);
  const visible = practitioner ? all.filter((a) => a.practitioner === practitioner) : all;
  const byDay = (day: string) => appointmentsOnDay(visible, day);

  const today = localDayKey(LOADED_AT);
  const step = (direction: 1 | -1) =>
    setAnchor((current) => (view === 'month' ? addMonths(current, direction) : addDays(current, direction * (view === 'week' ? 7 : 1))));

  const fmt = (key: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(f.locale, options).format(dayFromKey(key));
  const title =
    view === 'month'
      ? fmt(anchor, { month: 'long', year: 'numeric' })
      : view === 'day'
        ? fmt(anchor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : `${fmt(startOfWeek(anchor), { day: 'numeric', month: 'short' })} – ${fmt(addDays(startOfWeek(anchor), 6), { day: 'numeric', month: 'short', year: 'numeric' })}`;

  let body: ReactNode;
  if (list.isPending) body = <Skeleton className="m-4 h-96" />;
  else if (list.error) body = <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  else if (view === 'day') {
    // Planning par praticien : une colonne par praticien pour la journée choisie.
    const names = practitioner ? [practitioner] : practitioners;
    body = (
      <TimeGrid
        columns={names.map((name) => ({
          key: name,
          title: name,
          subtitle: t('calendar.count', { count: byDay(anchor).filter((a) => a.practitioner === name && a.status !== 'cancelled').length }),
          items: byDay(anchor).filter((a) => a.practitioner === name),
        }))}
        onSelect={setSelected}
      />
    );
  } else if (view === 'week') {
    body = (
      <TimeGrid
        columns={weekDays(anchor).map((day) => ({
          key: day,
          title: fmt(day, { weekday: 'short', day: 'numeric' }),
          items: byDay(day),
        }))}
        onSelect={setSelected}
      />
    );
  } else {
    const days = monthGridDays(anchor);
    const month = anchor.slice(0, 7);
    body = (
      <div className="overflow-x-auto">
        <div className="grid min-w-[44rem] grid-cols-7">
          {days.slice(0, 7).map((day) => (
            <div key={day} className="border-b border-border px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              {fmt(day, { weekday: 'short' })}
            </div>
          ))}
          {days.map((day) => {
            const items = byDay(day);
            return (
              <div key={day} className={cn('min-h-24 space-y-1 border-b border-s border-border p-1', !day.startsWith(month) && 'bg-surface-muted/50 text-muted-foreground')}>
                <button
                  type="button"
                  onClick={() => {
                    setAnchor(day);
                    setView('day');
                  }}
                  aria-label={t('calendar.openDay', { date: fmt(day, { day: 'numeric', month: 'long' }) })}
                  className={cn('flex size-6 items-center justify-center rounded-full text-xs hover:bg-surface-muted', day === today && 'bg-primary text-primary-foreground hover:bg-primary')}
                >
                  {Number(day.slice(8))}
                </button>
                {items.slice(0, 3).map((a) => (
                  <Chip key={a.id} appointment={a} onSelect={setSelected} compact />
                ))}
                {items.length > 3 && <p className="px-1 text-xs text-muted-foreground">{t('calendar.more', { count: items.length - 3 })}</p>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      {list.data?.isDemo && <DemoNotice endpoint={appointmentService.endpoint} />}
      <div className="rounded-card border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label={t('calendar.previous')} onClick={() => step(-1)}>
              <ChevronLeft aria-hidden className="size-4 rtl:rotate-180" />
            </Button>
            <Button variant="outline" onClick={() => setAnchor(today)}>
              {t('calendar.today')}
            </Button>
            <Button variant="outline" size="icon" aria-label={t('calendar.next')} onClick={() => step(1)}>
              <ChevronRight aria-hidden className="size-4 rtl:rotate-180" />
            </Button>
          </div>
          <h2 aria-live="polite" className="min-w-0 flex-1 text-base font-semibold capitalize">
            {title}
          </h2>
          <div role="group" aria-label={t('calendar.view')} className="flex overflow-hidden rounded-md border border-border">
            {(['day', 'week', 'month'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn('px-3 py-2 text-sm', view === v ? 'bg-primary text-primary-foreground' : 'hover:bg-surface-muted')}
              >
                {t(`calendar.views.${v}`)}
              </button>
            ))}
          </div>
          <label className="flex min-w-44 flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t('columns.practitioner')}
            <Select value={practitioner} onChange={(event) => setPractitioner(event.target.value)}>
              <option value="">{t('calendar.allPractitioners')}</option>
              {practitioners.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <CalendarLegend />
        {body}
        {list.data && list.data.total > MAX_ROWS && (
          <p role="note" className="border-t border-border px-4 py-2 text-sm text-warning-ink">
            {t('calendar.truncated', { count: MAX_ROWS })}
          </p>
        )}
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
