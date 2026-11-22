import type { Appointment } from '../appointments/data';
import type { Consultation } from '../consultations/data';
import { isUnassigned } from '../appointments/start-consultation';
import type { StaffMember } from '../_shared/reference-data';

/** Profil de personnel du compte connecté (le serveur ne relie les deux que par l'identifiant de l'utilisateur). */
export const findMyStaff = (staff: readonly StaffMember[], userId: number | string | undefined): StaffMember | undefined =>
  userId === undefined ? undefined : staff.find((m) => m.userId === String(userId));

const WAITING: readonly string[] = ['arrived', 'waiting'];
const URGENCY_ORDER = ['immediate', 'veryUrgent', 'urgent', 'standard', 'nonUrgent'];
/** Rang de gravité (0 = le plus urgent) ; sans urgence connue : « standard ». */
const rank = (a: Appointment): number => {
  const i = URGENCY_ORDER.indexOf(a.urgency ?? 'standard');
  return i === -1 ? URGENCY_ORDER.indexOf('standard') : i;
};

/** File du médecin : ses patients arrivés ou en attente (les plus urgents d'abord, puis du plus ancien au plus récent), puis ceux déjà appelés. */
export function myQueue(appointments: readonly Appointment[]): Appointment[] {
  const at = (a: Appointment) => new Date(a.arrivedAt ?? a.startsAt).getTime();
  const present = appointments.filter((a) => WAITING.includes(a.status) || a.status === 'inProgress');
  return [
    ...present.filter((a) => WAITING.includes(a.status)).sort((a, b) => rank(a) - rank(b) || at(a) - at(b)),
    ...present.filter((a) => a.status === 'inProgress').sort((a, b) => at(a) - at(b)),
  ];
}

/** Ses consultations à reprendre (brouillon, en cours, en attente de résultats) et celles à signer. */
export function myConsultations(rows: readonly Consultation[]): { open: Consultation[]; toSign: Consultation[] } {
  const recent = (a: Consultation, b: Consultation) => b.date.localeCompare(a.date);
  return {
    open: rows.filter((c) => c.status === 'draft' || c.status === 'inProgress' || c.status === 'awaitingResults').sort(recent),
    toSign: rows.filter((c) => c.status === 'toValidate').sort(recent),
  };
}

/** Patients présents sans praticien assigné (passage sans rendez-vous orienté vers un service) : à prendre en charge par un médecin. */
export function unassignedQueue(appointments: readonly Appointment[]): Appointment[] {
  const at = (a: Appointment) => new Date(a.arrivedAt ?? a.startsAt).getTime();
  return appointments.filter((a) => WAITING.includes(a.status) && isUnassigned(a)).sort((a, b) => rank(a) - rank(b) || at(a) - at(b));
}
