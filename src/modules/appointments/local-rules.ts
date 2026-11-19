import { BusinessRuleError } from '../_shared/business-error';
import { SERVICE_KEYS } from '../_shared/demo-people';
import { PRIORITIES } from '../nursing/data';
import { civilDay, resolvePatient } from '../patients/local-rules';
import type { Patient } from '../patients/data';
import type { Appointment, AppointmentEvent, AppointmentReason, AppointmentStatus } from './data';
import { NEXT_ACTIONS, findConflicts, localDayKey, occupiesSlot, endMs, startMs } from './scheduling';
import { isDestinationAllowed } from './walkin';

/** Règles métier PURES des rendez-vous et de l'accueil en mode local (aucun accès au stockage). */

export interface RuleContext {
  now: Date;
  actor: { id: string; name: string };
}

const REASONS: readonly AppointmentReason[] = ['firstVisit', 'followUp', 'control', 'vaccination', 'prenatal'];
const IN_QUEUE: readonly AppointmentStatus[] = ['arrived', 'waiting', 'inProgress'];
const event = (type: AppointmentEvent['type'], ctx: RuleContext, extra: Partial<AppointmentEvent> = {}): AppointmentEvent => ({
  type,
  at: ctx.now.toISOString(),
  by: ctx.actor.name,
  ...extra,
});

function duration(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 5 || n > 240) throw new BusinessRuleError('durationInvalid');
  return n;
}

function assertStart(startsAt: string | undefined, now: Date): string {
  const parsed = new Date(startsAt ?? '');
  if (!startsAt || Number.isNaN(parsed.getTime())) throw new BusinessRuleError('slotInvalid');
  if (localDayKey(parsed) < localDayKey(now)) throw new BusinessRuleError('appointmentPast');
  return parsed.toISOString();
}

/** Un patient ne peut pas avoir deux rendez-vous qui se chevauchent, quel que soit le praticien. */
function assertPatientFree(patientId: string, startsAt: string, durationMin: number, existing: readonly Appointment[], ignoreId?: string) {
  const start = new Date(startsAt).getTime();
  const end = start + durationMin * 60000;
  const clash = existing.find((a) => a.id !== ignoreId && a.patientId === patientId && occupiesSlot(a.status) && startMs(a) < end && endMs(a) > start);
  if (clash) throw new BusinessRuleError('patientBusy', {}, 'conflict');
}

function assertPractitionerFree(practitioner: string, startsAt: string, durationMin: number, existing: readonly Appointment[], ignoreId?: string) {
  if (findConflicts(existing, { practitioner, startsAt, durationMin, ignoreId }).length > 0) {
    throw new BusinessRuleError('slotTaken', { practitioner }, 'conflict');
  }
}

/** Un patient déjà présent dans la file du jour ne peut pas être « arrivé » une seconde fois. */
function assertNotInQueue(patientId: string, existing: readonly Appointment[], ignoreId?: string) {
  if (existing.some((a) => a.id !== ignoreId && a.patientId === patientId && IN_QUEUE.includes(a.status))) {
    throw new BusinessRuleError('patientAlreadyInQueue', {}, 'conflict');
  }
}

export function buildAppointment(
  input: Record<string, string>,
  ctx: RuleContext,
  patients: readonly Patient[],
  existing: readonly Appointment[],
  id: string,
): Appointment {
  const patient = resolvePatient(input.patient ?? '', patients);
  const service = input.service ?? '';
  if (!(SERVICE_KEYS as readonly string[]).includes(service)) throw new BusinessRuleError('serviceRequired');
  const history = [event('created', ctx)];

  if (input.walkIn === 'true') {
    const urgency = input.urgency ?? 'standard';
    if (!(PRIORITIES as readonly string[]).includes(urgency)) throw new BusinessRuleError('urgencyInvalid');
    // Règle de sécurité : un cas urgent passe TOUJOURS par le triage, même si l'interface a été contournée.
    if (!isDestinationAllowed(urgency, 'service')) throw new BusinessRuleError('triageRequired');
    if (!(input.reason ?? '').trim()) throw new BusinessRuleError('reasonRequired');
    assertNotInQueue(patient.id, existing);
    const startsAt = ctx.now.toISOString();
    return {
      id,
      patientId: patient.id,
      patientName: patient.fullName,
      service: service as Appointment['service'],
      practitioner: (input.practitioner ?? '').trim(),
      startsAt,
      durationMin: 20,
      reason: 'walkIn',
      status: 'arrived',
      arrivedAt: startsAt,
      walkIn: true,
      urgency,
      visitReason: (input.reason ?? '').trim(),
      history: [...history, event('checkedIn', ctx)],
    };
  }

  const practitioner = (input.practitioner ?? '').trim();
  if (!practitioner) throw new BusinessRuleError('practitionerRequired');
  const reason = input.reason as AppointmentReason;
  if (!REASONS.includes(reason)) throw new BusinessRuleError('reasonRequired');
  const startsAt = assertStart(input.startsAt, ctx.now);
  const durationMin = duration(input.durationMin, 30);
  assertPractitionerFree(practitioner, startsAt, durationMin, existing);
  assertPatientFree(patient.id, startsAt, durationMin, existing);
  const source = (input.fromConsultation ?? '').trim();
  return { id, patientId: patient.id, patientName: patient.fullName, service: service as Appointment['service'], practitioner, startsAt, durationMin, reason, status: 'scheduled', ...(source ? { sourceConsultationId: source } : {}), history };
}

export function applyAppointmentUpdate(row: Appointment, input: Record<string, string>, ctx: RuleContext, existing: readonly Appointment[]): Appointment {
  if (!NEXT_ACTIONS[row.status].includes('edit')) throw new BusinessRuleError('invalidTransition', { status: row.status }, 'conflict');
  const service = input.service ?? row.service;
  if (!(SERVICE_KEYS as readonly string[]).includes(service)) throw new BusinessRuleError('serviceRequired');
  const practitioner = (input.practitioner ?? row.practitioner).trim();
  if (!practitioner) throw new BusinessRuleError('practitionerRequired');
  const reason = (input.reason ?? row.reason) as AppointmentReason;
  if (!REASONS.includes(reason)) throw new BusinessRuleError('reasonRequired');
  const startsAt = input.startsAt ? assertStart(input.startsAt, ctx.now) : row.startsAt;
  const durationMin = duration(input.durationMin, row.durationMin);
  assertPractitionerFree(practitioner, startsAt, durationMin, existing, row.id);
  assertPatientFree(row.patientId, startsAt, durationMin, existing, row.id);
  const moved = startsAt !== row.startsAt;
  return {
    ...row,
    service: service as Appointment['service'],
    practitioner,
    reason,
    startsAt,
    durationMin,
    history: [...row.history, event(moved ? 'rescheduled' : 'updated', ctx, moved ? { from: row.startsAt } : {})],
  };
}

const ACTION_KEY: Record<string, (typeof NEXT_ACTIONS)[AppointmentStatus][number]> = {
  confirm: 'confirm',
  'check-in': 'checkIn',
  wait: 'wait',
  start: 'start',
  complete: 'complete',
  'no-show': 'noShow',
  cancel: 'cancel',
  reschedule: 'reschedule',
};

export function applyAppointmentCommand(
  row: Appointment,
  action: string,
  payload: Record<string, string>,
  ctx: RuleContext,
  existing: readonly Appointment[],
): Appointment {
  const key = ACTION_KEY[action];
  if (!key) throw new BusinessRuleError('unknownAction', { action });
  if (!NEXT_ACTIONS[row.status].includes(key)) throw new BusinessRuleError('invalidTransition', { status: row.status }, 'conflict');
  const log = (type: AppointmentEvent['type'], extra: Partial<AppointmentEvent> = {}) => [...row.history, event(type, ctx, extra)];

  switch (key) {
    case 'confirm':
      return { ...row, status: 'confirmed', history: log('updated') };
    case 'checkIn': {
      if (localDayKey(row.startsAt) !== localDayKey(ctx.now)) throw new BusinessRuleError('checkInWrongDay');
      assertNotInQueue(row.patientId, existing, row.id);
      return { ...row, status: 'arrived', arrivedAt: ctx.now.toISOString(), history: log('checkedIn') };
    }
    case 'wait':
      return { ...row, status: 'waiting', history: log('updated') };
    case 'start':
      return { ...row, status: 'inProgress', history: log('updated') };
    case 'complete':
      return { ...row, status: 'done', history: log('updated') };
    case 'noShow':
      return { ...row, status: 'noShow', history: log('noShow') };
    case 'cancel': {
      const reason = (payload.reason ?? '').trim();
      if (!reason) throw new BusinessRuleError('reasonRequired');
      return { ...row, status: 'cancelled', history: log('cancelled', { reason }) };
    }
    case 'reschedule': {
      const reason = (payload.reason ?? '').trim();
      if (!reason) throw new BusinessRuleError('reasonRequired');
      const startsAt = assertStart(payload.startsAt, ctx.now);
      assertPractitionerFree(row.practitioner, startsAt, row.durationMin, existing, row.id);
      assertPatientFree(row.patientId, startsAt, row.durationMin, existing, row.id);
      return { ...row, startsAt, status: 'scheduled', arrivedAt: undefined, history: log('rescheduled', { reason, from: row.startsAt }) };
    }
    default:
      throw new BusinessRuleError('unknownAction', { action });
  }
}

/** Jour civil de la visite, pour mettre à jour « dernière visite » du dossier patient. */
export const visitDay = (ctx: RuleContext): string => civilDay(ctx.now);
