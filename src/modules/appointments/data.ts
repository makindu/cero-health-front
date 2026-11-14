import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { LOADED_AT, isoAt } from '@/utils/dates';
import { localDayKey } from './scheduling';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { assertPermission } from '@/core/local/session';
import { createResourceService, localRepositoryFor, type LocalWriteContext } from '../_shared/resource-service';
import type { Repository } from '@/core/local/repository';
import { patientRepo } from '../patients/data';
import { applyAppointmentCommand, applyAppointmentUpdate, buildAppointment, visitDay } from './local-rules';
import { SERVICE_KEYS, demoPerson, pick, staffFor, type ServiceKey } from '../_shared/demo-people';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'arrived'
  | 'waiting'
  | 'inProgress'
  | 'done'
  | 'cancelled'
  | 'noShow';

export type AppointmentReason = 'firstVisit' | 'followUp' | 'control' | 'vaccination' | 'prenatal' | 'walkIn';

export type AppointmentEventType = 'created' | 'updated' | 'rescheduled' | 'cancelled' | 'checkedIn' | 'noShow';

/** Entrée d'historique. En mode API elle est produite par le serveur (utilisateur, date, motif) ; jamais côté navigateur. */
export interface AppointmentEvent {
  type: AppointmentEventType;
  at: string;
  by: string;
  reason?: string;
  /** Ancien créneau (report). */
  from?: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  service: ServiceKey;
  practitioner: string;
  startsAt: string;
  durationMin: number;
  reason: AppointmentReason;
  status: AppointmentStatus;
  /** Heure d'arrivée à l'accueil. */
  arrivedAt?: string;
  /** Mode local : passage sans rendez-vous, degré d'urgence déclaré et motif saisi à l'accueil. */
  walkIn?: boolean;
  urgency?: string;
  visitReason?: string;
  history: AppointmentEvent[];
}

const REASONS: readonly AppointmentReason[] = ['firstVisit', 'followUp', 'control', 'vaccination', 'prenatal'];
const STATUS_PAST: readonly AppointmentStatus[] = ['done', 'done', 'done', 'cancelled', 'noShow'];
const STATUS_TODAY: readonly AppointmentStatus[] = ['done', 'inProgress', 'arrived', 'confirmed', 'waiting', 'scheduled', 'confirmed', 'waiting'];
const STATUS_FUTURE: readonly AppointmentStatus[] = ['scheduled', 'confirmed', 'confirmed', 'scheduled', 'cancelled'];

/** FICTIF : 36 rendez-vous répartis du passé à la semaine prochaine. */
export const DEMO_APPOINTMENTS: readonly Appointment[] = Array.from({ length: 36 }, (_, i) => {
  const dayOffset = i < 8 ? -(i % 4) - 1 : i < 20 ? 0 : (i % 7) + 1;
  const person = demoPerson((i * 5) % 24);
  const service = pick(SERVICE_KEYS, i);
  const status =
    dayOffset < 0 ? pick(STATUS_PAST, i) : dayOffset === 0 ? pick(STATUS_TODAY, i) : pick(STATUS_FUTURE, i);
  const startsAt = isoAt(dayOffset, 8 + (i % 9), (i % 2) * 30);
  const arrived = ['arrived', 'waiting', 'inProgress', 'done'].includes(status) && dayOffset <= 0;
  const arrivedAt = arrived ? new Date(new Date(startsAt).getTime() - 5 * 60000).toISOString() : undefined;
  const history: AppointmentEvent[] = [{ type: 'created', at: isoAt(dayOffset - 3, 9), by: 'Agent démo' }];
  if (status === 'cancelled') {
    history.push({ type: 'cancelled', at: isoAt(Math.min(dayOffset, 0), 7), by: 'Agent démo', reason: 'patientRequest' });
  } else if (status === 'noShow') {
    history.push({ type: 'noShow', at: startsAt, by: 'Agent démo' });
  } else if (dayOffset > 0 && i % 4 === 1) {
    history.push({ type: 'rescheduled', at: isoAt(-1, 15), by: 'Agent démo', reason: 'practitionerUnavailable', from: isoAt(dayOffset - 1, 9) });
  }
  if (arrivedAt) history.push({ type: 'checkedIn', at: arrivedAt, by: 'Accueil démo' });
  return {
    id: `DEMO-A-${String(i + 1).padStart(3, '0')}`,
    patientId: person.id,
    patientName: person.fullName,
    service,
    practitioner: staffFor(service),
    startsAt,
    // Durées bornées à 30 min pour que le jeu fictif ne contienne aucun chevauchement pour un même praticien.
    durationMin: pick([20, 30, 30, 20], i),
    reason: pick(REASONS, i),
    status,
    arrivedAt,
    history,
  };
});

const today = localDayKey(LOADED_AT);

export const appointmentRepo = localRepositoryFor<Appointment>(HEALTH_ENDPOINTS.appointments.collection, DEMO_APPOINTMENTS);

const newId = (): string => `APT-LOC-${globalThis.crypto.randomUUID().slice(0, 8).toUpperCase()}`;
const A = PERMISSIONS.appointments;
const COMMAND_PERMISSIONS: Record<string, string> = {
  confirm: A.update,
  'check-in': A.checkIn,
  wait: A.checkIn,
  start: A.update,
  complete: A.update,
  'no-show': A.update,
  cancel: A.cancel,
  reschedule: A.update,
};

/** Dernière visite du dossier patient : mise à jour à l'arrivée effective (jamais à la simple prise de rendez-vous). */
async function touchLastVisit(patientId: string, day: string): Promise<void> {
  await patientRepo.update(patientId, (p) => ({ ...p, lastVisit: !p.lastVisit || p.lastVisit < day ? day : p.lastVisit }), { action: 'last-visit' });
}

export const appointmentService = createResourceService<Appointment>({
  source: 'health',
  endpoint: HEALTH_ENDPOINTS.appointments.collection,
  demoRows: DEMO_APPOINTMENTS,
  local: {
    create: async (input, ctx, repo) => {
      // Un passage sans rendez-vous est un enregistrement d'arrivée (accueil) ; un rendez-vous relève de la planification.
      assertPermission(input.walkIn === 'true' ? A.checkIn : A.create);
      const row = buildAppointment(input, ctx, await patientRepo.list(), await repo.list(), newId());
      if (row.walkIn) await touchLastVisit(row.patientId, visitDay(ctx));
      return row;
    },
    update: async (row, input, ctx, repo) => applyAppointmentUpdate(row, input, ctx, await repo.list()),
    commands: Object.fromEntries(
      Object.keys(COMMAND_PERMISSIONS).map((action) => [
        action,
        async (row: Appointment, payload: Record<string, string>, ctx: LocalWriteContext, repo: Repository<Appointment>) => {
          const next = applyAppointmentCommand(row, action, payload, ctx, await repo.list());
          if (action === 'check-in') await touchLastVisit(row.patientId, visitDay(ctx));
          return next;
        },
      ]),
    ),
    permissions: { update: A.update, commands: COMMAND_PERMISSIONS },
  },
  searchText: (a) => `${a.patientName} ${a.patientId} ${a.practitioner} ${a.id}`,
  matchFilter: (a, filter, value) => {
    if (filter === 'period') {
      const day = localDayKey(a.startsAt);
      if (value === 'today') return day === today;
      if (value === 'upcoming') return day > today;
      return day < today;
    }
    // Plage de jours (AAAA-MM-JJ, bornes incluses) utilisée par les calendriers.
    if (filter === 'from') return localDayKey(a.startsAt) >= value;
    if (filter === 'to') return localDayKey(a.startsAt) <= value;
    if (filter === 'patientId') return a.patientId === value;
    return String((a as unknown as Record<string, unknown>)[filter]) === value;
  },
  sortValue: (a, column) => (column === 'startsAt' ? a.startsAt : String((a as unknown as Record<string, unknown>)[column] ?? '')),
});
