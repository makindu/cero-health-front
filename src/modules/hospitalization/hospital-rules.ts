/**
 * Règles de l'hospitalisation (fonctions pures).
 * Invariant central : un lit est « occupé » si et seulement si exactement UNE admission active y a son séjour courant,
 * et une admission active occupe exactement UN lit. `findViolations` le vérifie et sert aux tests.
 */
export type WardKey = 'generalMedicine' | 'pediatrics' | 'maternity' | 'emergency' | 'surgery';
export type BedStatus = 'free' | 'occupied' | 'cleaning' | 'maintenance';
export type RoomKind = 'standard' | 'private';
export type AdmissionStatus = 'admitted' | 'dischargePending' | 'discharged' | 'cancelled';

export interface Room {
  id: string;
  ward: WardKey;
  code: string;
  kind: RoomKind;
  /** Prestation du catalogue facturée par jour (le compte hospitalier la facturera en phase 8). */
  dailyItemId: string;
}
export interface Bed {
  id: string;
  roomId: string;
  label: string;
  status: BedStatus;
  /** Admission qui occupe le lit (présent ssi status = occupied). */
  admissionId?: string;
  maintenanceReason?: string;
}
export interface Stay {
  bedId: string;
  roomId: string;
  from: string;
  to?: string;
  by: string;
  /** Motif du transfert (absent pour le premier séjour). */
  reason?: string;
}
export interface Admission {
  id: string;
  number: string;
  patientId: string;
  patientName: string;
  consultationId?: string;
  ward: WardKey;
  status: AdmissionStatus;
  admittedAt: string;
  admittedBy: string;
  /** Médecin référent et motif : saisis par l'utilisateur. */
  attending: string;
  reason: string;
  expectedDischarge?: string;
  stays: Stay[];
  dischargeRequest?: { at: string; by: string; note: string };
  /** Jours de chambre déjà facturés : jour civil → facture. */
  billedDays?: Record<string, string>;
  discharge?: { at: string; by: string; outcome: DischargeOutcome; note: string; exception?: { reason: string } };
  cancellation?: { at: string; by: string; reason: string };
}

export type DischargeOutcome = 'normal' | 'referral' | 'againstAdvice' | 'deceased';
export const DISCHARGE_OUTCOMES: readonly DischargeOutcome[] = ['normal', 'referral', 'againstAdvice', 'deceased'];

export class HospitalError extends Error {
  constructor(readonly code: string, readonly params: Record<string, string | number> = {}) {
    super(code);
    this.name = 'HospitalError';
  }
}
const fail = (code: string, params?: Record<string, string | number>): never => {
  throw new HospitalError(code, params);
};

export const isActive = (a: Admission): boolean => a.status === 'admitted' || a.status === 'dischargePending';
export const currentStay = (a: Admission): Stay | undefined => a.stays.find((s) => s.to === undefined);

export function nextNumber(existing: readonly { number: string }[], year: number): string {
  const prefix = `HOS-${year}-`;
  const last = existing.map((o) => o.number).filter((n) => n.startsWith(prefix)).map((n) => Number(n.slice(prefix.length))).filter(Number.isFinite);
  return `${prefix}${String(Math.max(0, ...last) + 1).padStart(5, '0')}`;
}

export function checkAdmit(input: { reason: string; attending: string; expectedDischarge?: string }, bed: Bed | undefined, activeForPatient: Admission | undefined, today: string): void {
  if (activeForPatient) fail('alreadyAdmitted', { number: activeForPatient.number });
  if (!input.reason.trim()) fail('reasonRequired');
  if (!input.attending.trim()) fail('attendingRequired');
  if (input.expectedDischarge && input.expectedDischarge < today) fail('dischargeInPast');
  if (!bed) fail('bedNotFound');
  if (bed!.status !== 'free') fail('bedNotFree', { status: bed!.status });
}

export function buildAdmission(input: { id: string; number: string; patientId: string; patientName: string; consultationId?: string; bed: Bed; room: Room; reason: string; attending: string; expectedDischarge?: string; by: string; now: string }): Admission {
  return {
    id: input.id, number: input.number, patientId: input.patientId, patientName: input.patientName, consultationId: input.consultationId,
    ward: input.room.ward, status: 'admitted', admittedAt: input.now, admittedBy: input.by, attending: input.attending.trim(), reason: input.reason.trim(),
    expectedDischarge: input.expectedDischarge || undefined, stays: [{ bedId: input.bed.id, roomId: input.room.id, from: input.now, by: input.by }],
  };
}

export const occupy = (bed: Bed, admissionId: string): Bed => ({ ...bed, status: 'occupied', admissionId, maintenanceReason: undefined });
/** Un lit libéré passe TOUJOURS par le nettoyage avant d'être de nouveau libre. */
export const release = (bed: Bed): Bed => ({ ...bed, status: 'cleaning', admissionId: undefined });

export function transfer(a: Admission, newBed: Bed, newRoom: Room, input: { by: string; now: string; reason: string }): Admission {
  if (!isActive(a)) fail('notActive');
  if (!input.reason.trim()) fail('reasonRequired');
  const cur = currentStay(a);
  if (!cur) fail('noStay');
  if (cur!.bedId === newBed.id) fail('sameBed');
  if (newBed.status !== 'free') fail('bedNotFree', { status: newBed.status });
  return {
    ...a, ward: newRoom.ward,
    stays: [...a.stays.map((s) => (s === cur ? { ...s, to: input.now } : s)), { bedId: newBed.id, roomId: newRoom.id, from: input.now, by: input.by, reason: input.reason.trim() }],
  };
}

export function cancelAdmission(a: Admission, input: { by: string; now: string; reason: string }): Admission {
  if (!isActive(a)) fail('notActive');
  if (!input.reason.trim()) fail('reasonRequired');
  if (Object.keys(a.billedDays ?? {}).length > 0) fail('hasBilledDays');
  return {
    ...a, status: 'cancelled', cancellation: { at: input.now, by: input.by, reason: input.reason.trim() },
    stays: a.stays.map((s) => (s.to === undefined ? { ...s, to: input.now } : s)),
  };
}

export function requestDischarge(a: Admission, input: { by: string; now: string; note: string }): Admission {
  if (a.status !== 'admitted') fail('wrongStatus', { status: a.status });
  return { ...a, status: 'dischargePending', dischargeRequest: { at: input.now, by: input.by, note: input.note.trim() } };
}
export function revokeDischarge(a: Admission): Admission {
  if (a.status !== 'dischargePending') fail('wrongStatus', { status: a.status });
  return { ...a, status: 'admitted', dischargeRequest: undefined };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function addDays(day: string, n: number): string {
  if (!DAY.test(day)) fail('dateInvalid');
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Jours de chambre facturables. Convention : le jour d'admission compte, le jour de sortie ne compte pas (minimum un jour).
 * Séjour en cours : jours ÉCOULÉS (jusqu'à hier). `forDischarge` : comme si la sortie avait lieu aujourd'hui.
 * Chaque jour est imputé à la chambre occupée au plus tard ce jour-là (le jour d'un transfert est facturé au nouveau lit).
 */
export function billableDays(a: Admission, dayOf: (iso: string) => string, today: string, forDischarge: boolean): { day: string; roomId: string }[] {
  if (a.status === 'cancelled') return [];
  const start = dayOf(a.admittedAt);
  const endDay = a.discharge ? dayOf(a.discharge.at) : today;
  let last: string;
  if (forDischarge || a.discharge) {
    last = addDays(endDay, -1);
    if (last < start) last = start;
  } else {
    last = addDays(today, -1);
    if (last < start) return [];
  }
  const stays = [...a.stays].sort((x, y) => x.from.localeCompare(y.from));
  const out: { day: string; roomId: string }[] = [];
  for (let d = start, guard = 0; d <= last && guard < 3660; d = addDays(d, 1), guard++) {
    const stay = [...stays].reverse().find((s) => dayOf(s.from) <= d) ?? stays[0]!;
    out.push({ day: d, roomId: stay.roomId });
  }
  return out;
}
export const unbilledDays = (a: Admission, days: readonly { day: string; roomId: string }[]): { day: string; roomId: string }[] => days.filter((x) => !(a.billedDays ?? {})[x.day]);

export function markDaysBilled(a: Admission, days: readonly string[], invoiceId: string): Admission {
  return { ...a, billedDays: { ...(a.billedDays ?? {}), ...Object.fromEntries(days.map((d) => [d, invoiceId])) } };
}

/** Sortie effective : ferme le séjour. Les conditions financières sont vérifiées par le service du compte. */
export function dischargeAdmission(a: Admission, input: { by: string; now: string; outcome: DischargeOutcome; note: string; exceptionReason?: string }): Admission {
  if (!isActive(a)) fail('notActive');
  if (!DISCHARGE_OUTCOMES.includes(input.outcome)) fail('outcomeInvalid');
  return {
    ...a, status: 'discharged', discharge: { at: input.now, by: input.by, outcome: input.outcome, note: input.note.trim(), exception: input.exceptionReason ? { reason: input.exceptionReason.trim() } : undefined },
    stays: a.stays.map((s) => (s.to === undefined ? { ...s, to: input.now } : s)),
  };
}

/** Changement d'état manuel d'un lit non occupé : nettoyage → libre, libre ↔ maintenance (motif obligatoire pour entrer en maintenance). */
export function setBedState(bed: Bed, to: 'free' | 'maintenance', reason: string): Bed {
  if (bed.status === 'occupied') fail('bedOccupied');
  if (to === 'maintenance') {
    if (bed.status === 'maintenance') fail('wrongStatus', { status: bed.status });
    if (!reason.trim()) fail('reasonRequired');
    return { ...bed, status: 'maintenance', maintenanceReason: reason.trim() };
  }
  if (bed.status === 'free') fail('wrongStatus', { status: bed.status });
  return { ...bed, status: 'free', maintenanceReason: undefined };
}

/** Vérifie l'invariant lits ↔ admissions. Renvoie la liste des anomalies (vide = cohérent). */
export function findViolations(beds: readonly Bed[], admissions: readonly Admission[]): string[] {
  const out: string[] = [];
  const active = admissions.filter(isActive);
  for (const b of beds) {
    const holders = active.filter((a) => currentStay(a)?.bedId === b.id);
    if (holders.length > 1) out.push(`bed ${b.id}: ${holders.length} admissions actives`);
    if (b.status === 'occupied' && (holders.length !== 1 || b.admissionId !== holders[0]?.id)) out.push(`bed ${b.id}: occupé sans admission correspondante`);
    if (b.status !== 'occupied' && (holders.length > 0 || b.admissionId)) out.push(`bed ${b.id}: non occupé mais lié à une admission`);
  }
  for (const a of active) {
    if (a.stays.filter((s) => s.to === undefined).length !== 1) out.push(`admission ${a.id}: séjour courant ≠ 1`);
  }
  const perPatient = new Map<string, number>();
  for (const a of active) perPatient.set(a.patientId, (perPatient.get(a.patientId) ?? 0) + 1);
  for (const [p, n] of perPatient) if (n > 1) out.push(`patient ${p}: ${n} admissions actives`);
  return out;
}
