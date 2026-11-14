import type { TriagePriority } from '../nursing/data';

/** Destinations possibles d'un patient qui se présente sans rendez-vous. */
export type WalkInDestination = 'triage' | 'service';

/** Les urgences vitales ou très urgentes passent obligatoirement par le triage infirmier. */
const TRIAGE_REQUIRED: readonly TriagePriority[] = ['immediate', 'veryUrgent', 'urgent'];

export function requiresTriage(urgency: string): boolean {
  return (TRIAGE_REQUIRED as readonly string[]).includes(urgency);
}

/** Orientation proposée : triage si l'urgence l'exige, sinon le service demandé. */
export function suggestDestination(urgency: string): WalkInDestination {
  return requiresTriage(urgency) ? 'triage' : 'service';
}

/** Une orientation vers un service est refusée si l'urgence exige le triage. */
export function isDestinationAllowed(urgency: string, destination: string): boolean {
  return !(destination === 'service' && requiresTriage(urgency));
}
