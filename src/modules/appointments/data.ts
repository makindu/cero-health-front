import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { LOADED_AT, isoAt } from '@/utils/dates';
import { localDayKey } from './scheduling';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { assertPermission } from '@/core/local/session';
import { ApiError } from '@/core/api';
import {
  createResourceService,
  localRepositoryFor,
  type ApiMapping,
  type LocalWriteContext,
  type ResourceService,
} from '../_shared/resource-service';
import { ensureReference, findStaff, findUnit, referenceFromApi, staffById, unitById } from '../_shared/reference-data';
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

export type AppointmentEventType = 'created' | 'updated' | 'rescheduled' | 'cancelled' | 'checkedIn' | 'noShow' | 'confirmed' | 'waiting' | 'started' | 'completed' | 'assigned';

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
  /** API réelle : identifiants du service (unité de soin) et du praticien (profil de personnel), et libellé du service. */
  careUnitId?: string;
  serviceLabel?: string;
  practitionerId?: string;
  /** Consultation à l'origine du rendez-vous (prochain rendez-vous programmé par le médecin). */
  sourceConsultationId?: string;
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

// ---------------------------------------------------------------------------------------------------------------
// API réelle (HEALTH) : /appointments. Le serveur impose statut, auteur, fin et établissement ; l'interface n'envoie que
// la saisie. Service et praticien sont désignés par identifiants (unité de soin, profil de personnel) : voir reference-data.
// ---------------------------------------------------------------------------------------------------------------
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const invalid = (message: string): never => {
  throw new ApiError('validation', message, { source: 'health', status: 422, code: 'invalid_input' });
};
const unitIdOf = (value: string | undefined): number => {
  const unit = findUnit(value ?? '');
  if (!unit) invalid("Service inconnu pour cet établissement : choisissez un service de la liste.");
  return Number(unit?.id);
};
const staffIdOf = (value: string | undefined): number => {
  const member = findStaff(value ?? '');
  if (!member) invalid("Praticien inconnu pour cet établissement : choisissez un praticien de la liste.");
  return Number(member?.id);
};
const patientIdOf = (value: string | undefined): number => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) invalid('Choisissez un patient dans la liste.');
  return n;
};
/** Motif envoyé au serveur : code + précision éventuelle (255 caractères au plus). */
const reasonOf = (payload: Record<string, string>): string =>
  [payload.reason, payload.note].map((x) => (x ?? '').trim()).filter(Boolean).join(' — ').slice(0, 255);

const dayStart = (offset: number): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};
/** « AAAA-MM-JJ » (jour LOCAL) -> minuit local en UTC, pour que les bornes suivent le fuseau de l'utilisateur. */
const localMidnight = (key: string, plusDays = 0): string => {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + plusDays);
  return d.toISOString();
};

export const APPOINTMENT_API: ApiMapping<Appointment> = {
  endpoint: '/appointments',
  fromApi: (r) => {
    const unit = unitById(text(r.care_unit_id));
    const staff = staffById(text(r.practitioner_staff_id));
    const patient = (r.patient ?? null) as { full_name?: string } | null;
    const code = unit?.code ?? '';
    return {
      id: text(r.id),
      patientId: text(r.patient_id),
      patientName: patient?.full_name ?? `Patient n°${text(r.patient_id)}`,
      service: (SERVICE_KEYS as readonly string[]).includes(code) ? (code as ServiceKey) : 'generalMedicine',
      careUnitId: text(r.care_unit_id) || undefined,
      serviceLabel: unit?.name,
      practitioner: staff?.name ?? '',
      practitionerId: text(r.practitioner_staff_id) || undefined,
      startsAt: text(r.starts_at),
      durationMin: Number(r.duration_min) || 30,
      reason: text(r.reason_code) as AppointmentReason,
      status: text(r.status) as AppointmentStatus,
      arrivedAt: r.arrived_at ? text(r.arrived_at) : undefined,
      walkIn: r.walk_in === true,
      urgency: r.urgency ? text(r.urgency) : undefined,
      visitReason: r.visit_reason ? text(r.visit_reason) : undefined,
      history: [],
    };
  },
  createPath: (i) => (i.walkIn === 'true' ? '/appointments/walk-in' : '/appointments'),
  toApi: (i) => {
    if (i.walkIn === 'true') {
      return {
        patient_id: patientIdOf(i.patient),
        care_unit_id: unitIdOf(i.service),
        urgency: i.urgency || 'standard',
        visit_reason: (i.reason ?? '').trim(),
      };
    }
    return {
      patient_id: patientIdOf(i.patient),
      care_unit_id: unitIdOf(i.service),
      practitioner_staff_id: staffIdOf(i.practitioner),
      starts_at: i.startsAt,
      duration_min: Number(i.durationMin),
      reason_code: i.reason,
    };
  },
  // La modification ne touche ni l'heure ni le praticien (immuables côté serveur : ils passent par le report).
  toApiUpdate: (i) => {
    const body: Record<string, unknown> = {};
    if (i.service) body.care_unit_id = unitIdOf(i.service);
    if (i.durationMin) body.duration_min = Number(i.durationMin);
    if (i.reason) body.reason_code = i.reason;
    return body;
  },
  commandPath: (id, action) => `/appointments/${encodeURIComponent(id)}/actions/${action}`,
  commandBody: (action, p) => {
    if (action === 'reschedule') {
      const body: Record<string, unknown> = { starts_at: p.startsAt, reason: reasonOf(p) };
      if (p.practitioner) body.practitioner_staff_id = staffIdOf(p.practitioner);
      return body;
    }
    if (action === 'assign') return { practitioner_staff_id: staffIdOf(p.practitioner) };
    const reason = reasonOf(p);
    return reason ? { reason } : {};
  },
  filterMap: { period: null, service: null, practitioner: null },
  mapFilter: (id, value): Record<string, string> | undefined => {
    if (id === 'period') {
      if (value === 'today') return { from: dayStart(0).toISOString(), to: dayStart(1).toISOString() };
      if (value === 'upcoming') return { from: dayStart(1).toISOString() };
      return { to: dayStart(0).toISOString() };
    }
    if (id === 'from') return { from: localMidnight(value) };
    if (id === 'to') return { to: localMidnight(value, 1) }; // jour inclus
    if (id === 'patientId') return { patient_id: value };
    if (id === 'practitioner') return { practitioner_staff_id: findStaff(value)?.id ?? '0' };
    if (id === 'service') return { care_unit_id: findUnit(value)?.id ?? '0' };
    return undefined;
  },
  sortMap: { startsAt: 'starts_at' },
};

const baseService = createResourceService<Appointment>({
  source: 'health',
  endpoint: HEALTH_ENDPOINTS.appointments.collection,
  api: APPOINTMENT_API,
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

/** Charge les données de référence (unités, personnel) avant toute opération API : les correspondances en ont besoin. */
const prepared =
  <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
  async (...args: A): Promise<R> => {
    await ensureReference();
    return fn(...args);
  };

export const appointmentService: ResourceService<Appointment> = {
  ...baseService,
  list: prepared(baseService.list),
  get: prepared(baseService.get),
  create: prepared(baseService.create),
  command: prepared(baseService.command),
  async update(id, input) {
    await ensureReference();
    if (!referenceFromApi()) return baseService.update(id, input);
    // Heure ou praticien modifiés : le serveur les traite comme un REPORT (journalisé), pas comme une simple modification.
    const { item } = await baseService.get(id);
    const timeChanged = Boolean(input.startsAt) && new Date(input.startsAt as string).getTime() !== new Date(item.startsAt).getTime();
    const practitionerChanged = Boolean(input.practitioner) && String(findStaff(input.practitioner as string)?.id) !== item.practitionerId;
    const result = await baseService.update(id, input);
    if (timeChanged || practitionerChanged) {
      await baseService.command(id, 'reschedule', {
        startsAt: input.startsAt || item.startsAt,
        practitioner: practitionerChanged ? (input.practitioner as string) : '',
        reason: 'other',
        note: '',
      });
    }
    return result;
  },
};
