import { BusinessRuleError } from '../_shared/business-error';
import { SERVICE_KEYS } from '../_shared/demo-people';
import type { UserAccount } from '../administration/data';
import { findDoctor } from '../administration/staff-rules';
import type { Patient } from '../patients/data';
import { resolvePatient } from '../patients/local-rules';
import { canTransition } from './clinical/logic';
import type { ClinicalStatus } from './clinical/model';
import type { Consultation, ConsultationReason } from './data';

/** Règles métier PURES des consultations en mode local (aucun accès au stockage). */

const REASONS: readonly ConsultationReason[] = ['firstVisit', 'followUp', 'control', 'vaccination', 'prenatal'];

/** Action de statut → statut cible. */
export const COMMAND_TARGET: Record<string, ClinicalStatus> = {
  start: 'inProgress',
  'await-results': 'awaitingResults',
  submit: 'toValidate',
  sign: 'signed',
  close: 'closed',
};

export interface FeeGate {
  state: 'valid' | 'expired' | 'none';
}

/**
 * Ouvre une consultation : patient actif résolu, service et motif valides, frais de consultation valides.
 * Sans frais valides, la consultation est refusée (l'exemption se fait en caisse, avec permission et motif tracés).
 */
export function buildConsultation(
  input: Record<string, string>, patients: readonly Patient[], fee: FeeGate, now: Date, id: string, staff: readonly UserAccount[],
): Consultation {
  const patient = resolvePatient(input.patient ?? '', patients);
  const service = input.service as Consultation['service'];
  if (!SERVICE_KEYS.includes(service)) throw new BusinessRuleError('consultationServiceInvalid');
  const reason = input.reason as ConsultationReason;
  if (!REASONS.includes(reason)) throw new BusinessRuleError('consultationReasonInvalid');
  const doctor = findDoctor(input.practitioner ?? '', staff);
  if (!doctor) throw new BusinessRuleError('consultationPractitionerInvalid');
  if (fee.state === 'expired') throw new BusinessRuleError('consultationFeeExpired', { name: patient.fullName }, 'conflict');
  if (fee.state !== 'valid') throw new BusinessRuleError('consultationFeeRequired', { name: patient.fullName }, 'conflict');
  return {
    id, patientId: patient.id, patientName: patient.fullName, practitioner: doctor.name, practitionerId: doctor.id,
    service, date: now.toISOString(), reason, status: 'draft', origin: 'walkIn',
  };
}

export function applyConsultationCommand(row: Consultation, action: string): Consultation {
  const to = COMMAND_TARGET[action];
  if (!to) throw new BusinessRuleError('consultationTransitionInvalid', {}, 'conflict');
  if (!canTransition(row.status, to)) throw new BusinessRuleError('consultationTransitionInvalid', {}, 'conflict');
  return { ...row, status: to };
}
