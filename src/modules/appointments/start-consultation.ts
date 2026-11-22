import type { Appointment } from './data';

/**
 * Saisie d'ouverture d'une consultation à partir d'un rendez-vous (ou d'un passage sans rendez-vous) de l'accueil :
 * le patient, le service et le praticien sont ceux du rendez-vous, et le rendez-vous est rattaché à la consultation.
 */
export function consultationInputFor(a: Appointment, takenBy?: string): Record<string, string> {
  return {
    patient: a.patientId,
    service: a.careUnitId ?? a.service,
    // Sans praticien assigné, c'est le médecin qui prend le patient en charge qui devient le praticien de la consultation.
    practitioner: a.practitionerId ?? takenBy ?? a.practitioner,
    // Le motif « passage sans rendez-vous » n'existe pas côté consultation : c'est une première visite par défaut.
    reason: a.reason === 'walkIn' ? 'firstVisit' : a.reason,
    appointmentId: a.id,
  };
}

/** Aucun praticien assigné : n'importe quel médecin peut prendre le patient en charge. */
export const isUnassigned = (a: Appointment): boolean => !a.practitionerId;

/** Le rendez-vous est dans la file (arrivé, en attente ou déjà appelé) : une consultation peut être ouverte. */
export const canOpenConsultation = (a: Appointment): boolean => a.status === 'arrived' || a.status === 'waiting' || a.status === 'inProgress';
