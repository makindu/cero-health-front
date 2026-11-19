import { PRIORITIES, type TriageEntry, type TriagePriority } from '../nursing/data';
import type { Appointment } from './data';
import { localDayKey } from './scheduling';

/**
 * Vue unique des patients PRÉSENTS aujourd'hui (fonctions pures) : ceux qui avaient un rendez-vous et ceux venus sans,
 * qu'ils soient en salle d'attente, au triage ou en consultation. Rien n'est saisi : tout est lu des rendez-vous et du triage.
 */
export type Orientation = 'consultation' | 'triage' | 'service';
export type Stage = 'waiting' | 'inTriage' | 'inCare' | 'inConsultation';

export interface PresentRow {
  key: string;
  patientId: string;
  patientName: string;
  origin: 'appointment' | 'walkIn';
  orientation: Orientation;
  /** Praticien du rendez-vous, s'il y en a un. */
  practitioner: string;
  service?: string;
  priority: TriagePriority;
  arrivedAt: string;
  stage: Stage;
  appointment?: Appointment;
  triage?: TriageEntry;
}

const isPriority = (v: string | undefined): v is TriagePriority => (PRIORITIES as readonly string[]).includes(v ?? '');
const TRIAGE_STAGE: Partial<Record<TriageEntry['status'], Stage>> = { waiting: 'waiting', inTriage: 'inTriage', inCare: 'inCare' };

/** Les plus urgents d'abord, puis par heure d'arrivée. */
export function buildPresent(appointments: readonly Appointment[], triage: readonly TriageEntry[], day: string): PresentRow[] {
  const rows: PresentRow[] = [];
  for (const a of appointments) {
    if (a.status !== 'arrived' && a.status !== 'waiting' && a.status !== 'inProgress') continue;
    rows.push({
      key: `a:${a.id}`, patientId: a.patientId, patientName: a.patientName,
      origin: a.walkIn ? 'walkIn' : 'appointment', orientation: a.walkIn ? 'service' : 'consultation',
      practitioner: a.practitioner, service: a.service, priority: isPriority(a.urgency) ? a.urgency : 'standard',
      arrivedAt: a.arrivedAt ?? a.startsAt, stage: a.status === 'inProgress' ? 'inConsultation' : 'waiting', appointment: a,
    });
  }
  for (const e of triage) {
    const stage = TRIAGE_STAGE[e.status];
    if (!stage || localDayKey(e.arrivedAt) !== day) continue;
    rows.push({
      key: `t:${e.id}`, patientId: e.patientId, patientName: e.patientName, origin: 'walkIn', orientation: 'triage',
      practitioner: '', priority: e.priority, arrivedAt: e.arrivedAt, stage, triage: e,
    });
  }
  return rows.sort((x, y) => PRIORITIES.indexOf(x.priority) - PRIORITIES.indexOf(y.priority) || x.arrivedAt.localeCompare(y.arrivedAt));
}
