import type { Appointment, AppointmentStatus } from './data';

/**
 * Logique d'agenda PURE (sans React ni réseau) : conflits de réservation, créneaux libres, grilles de calendrier.
 * Les jours sont des clés locales « AAAA-MM-JJ » ; les instants sont des chaînes ISO.
 */

/** Statuts qui occupent le créneau du praticien. Un rendez-vous annulé ou manqué le libère. */
const FREEING: readonly AppointmentStatus[] = ['cancelled', 'noShow'];
export const occupiesSlot = (status: AppointmentStatus): boolean => !FREEING.includes(status);

const pad = (n: number): string => String(n).padStart(2, '0');

export function localDayKey(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date locale (midi, pour éviter tout décalage d'heure d'été) depuis une clé de jour. */
export function dayFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function addDays(key: string, days: number): string {
  const d = dayFromKey(key);
  d.setDate(d.getDate() + days);
  return localDayKey(d);
}

/** Lundi de la semaine qui contient le jour donné. */
export function startOfWeek(key: string): string {
  const day = dayFromKey(key).getDay(); // 0 = dimanche
  return addDays(key, -((day + 6) % 7));
}

export const weekDays = (key: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(key), i));

export function startOfMonth(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

/** 42 jours (6 semaines, lundi → dimanche) couvrant le mois du jour donné. */
export function monthGridDays(key: string): string[] {
  const first = startOfWeek(startOfMonth(key));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function addMonths(key: string, months: number): string {
  const d = dayFromKey(startOfMonth(key));
  d.setMonth(d.getMonth() + months);
  return localDayKey(d);
}

/** Instant ISO depuis une date « AAAA-MM-JJ » et une heure « HH:MM » locales. */
export function toIso(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0).toISOString();
}

/** Heure locale « HH:MM » d'un instant ISO (valeur d'un champ de saisie d'heure). */
export function timeKey(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type CalendarView = 'day' | 'week' | 'month';

/**
 * Plage de jours à charger pour une vue. Jour et semaine chargent la semaine entière (la liste des praticiens du
 * planning journalier reste ainsi complète) ; le mois charge les 6 semaines de la grille.
 */
export function rangeFor(view: CalendarView, anchor: string): { from: string; to: string } {
  const days = view === 'month' ? monthGridDays(anchor) : weekDays(anchor);
  return { from: days[0] as string, to: days[days.length - 1] as string };
}

/** Rendez-vous d'un jour local, éventuellement limités à un praticien, triés par heure. */
export function appointmentsOnDay(list: readonly Appointment[], day: string, practitioner = ''): Appointment[] {
  return list
    .filter((a) => localDayKey(a.startsAt) === day && (!practitioner || a.practitioner === practitioner))
    .sort((x, y) => startMs(x) - startMs(y));
}

/** Heures affichées par la grille : 7 h – 19 h par défaut, élargies pour qu'aucun rendez-vous ne soit coupé. */
export function hourBounds(items: readonly Pick<Appointment, 'startsAt' | 'durationMin'>[], defaults = { start: 7, end: 19 }) {
  let start = defaults.start;
  let end = defaults.end;
  for (const item of items) {
    const first = new Date(item.startsAt);
    const last = new Date(endMs(item));
    start = Math.min(start, first.getHours());
    // Un rendez-vous qui finit après minuit est borné à 24 h.
    end = Math.max(end, localDayKey(last) === localDayKey(first) ? Math.ceil(last.getHours() + last.getMinutes() / 60) : 24);
  }
  return { start: Math.max(0, start), end: Math.min(24, end) };
}

export const startMs = (a: Pick<Appointment, 'startsAt'>): number => new Date(a.startsAt).getTime();
export const endMs = (a: Pick<Appointment, 'startsAt' | 'durationMin'>): number => startMs(a) + a.durationMin * 60000;

export interface SlotCandidate {
  practitioner: string;
  startsAt: string;
  durationMin: number;
  /** Rendez-vous en cours de report : ignoré dans la recherche de conflits. */
  ignoreId?: string;
}

/** Rendez-vous du MÊME praticien dont la plage chevauche celle du candidat (bornes : fin exclusive). */
export function findConflicts(existing: readonly Appointment[], candidate: SlotCandidate): Appointment[] {
  const start = new Date(candidate.startsAt).getTime();
  const end = start + candidate.durationMin * 60000;
  const name = candidate.practitioner.trim().toLowerCase();
  if (!name || Number.isNaN(start)) return [];
  return existing.filter(
    (a) =>
      a.id !== candidate.ignoreId &&
      occupiesSlot(a.status) &&
      a.practitioner.trim().toLowerCase() === name &&
      startMs(a) < end &&
      endMs(a) > start,
  );
}

/** Premier créneau libre (pas de 15 min) à partir de l'heure demandée, avant `lastHour` ; null s'il n'y en a pas. */
export function nextFreeSlot(existing: readonly Appointment[], candidate: SlotCandidate, lastHour = 18): string | null {
  const limit = new Date(candidate.startsAt);
  limit.setHours(lastHour, 0, 0, 0);
  for (let t = new Date(candidate.startsAt).getTime(); t + candidate.durationMin * 60000 <= limit.getTime(); t += 15 * 60000) {
    const startsAt = new Date(t).toISOString();
    if (findConflicts(existing, { ...candidate, startsAt }).length === 0) return startsAt;
  }
  return null;
}

export interface LaidOut<T> {
  item: T;
  lane: number;
  lanes: number;
}

/** Répartit en colonnes les éléments qui se chevauchent dans le temps (affichage côte à côte). */
export function layoutLanes<T extends Pick<Appointment, 'startsAt' | 'durationMin'>>(items: readonly T[]): LaidOut<T>[] {
  const sorted = [...items].sort((a, b) => startMs(a) - startMs(b) || endMs(b) - endMs(a));
  const result: LaidOut<T>[] = [];
  let cluster: LaidOut<T>[] = [];
  let clusterEnd = -Infinity;
  const laneEnds: number[] = [];
  const flush = () => {
    for (const entry of cluster) entry.lanes = laneEnds.length;
    result.push(...cluster);
    cluster = [];
    laneEnds.length = 0;
    clusterEnd = -Infinity;
  };
  for (const item of sorted) {
    if (startMs(item) >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= startMs(item));
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = endMs(item);
    clusterEnd = Math.max(clusterEnd, endMs(item));
    cluster.push({ item, lane, lanes: 1 });
  }
  flush();
  return result;
}

/** Praticiens distincts, triés. */
export const practitionersOf = (list: readonly Appointment[]): string[] =>
  [...new Set(list.map((a) => a.practitioner).filter(Boolean))].sort((a, b) => a.localeCompare(b));

/** Statuts suivants possibles depuis un statut (circuit d'accueil). Les statuts finaux n'en ont pas. */
export const NEXT_ACTIONS: Record<AppointmentStatus, readonly ('confirm' | 'checkIn' | 'wait' | 'start' | 'complete' | 'edit' | 'reschedule' | 'cancel' | 'noShow')[]> = {
  scheduled: ['confirm', 'checkIn', 'edit', 'reschedule', 'cancel', 'noShow'],
  confirmed: ['checkIn', 'edit', 'reschedule', 'cancel', 'noShow'],
  arrived: ['wait', 'start', 'cancel'],
  waiting: ['start', 'cancel'],
  inProgress: ['complete'],
  done: [],
  cancelled: [],
  noShow: ['reschedule'],
};
