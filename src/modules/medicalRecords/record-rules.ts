/**
 * Règles du dossier médical (fonctions pures).
 *  - un patient = UN dossier permanent, ouvert automatiquement (jamais deux, jamais pour un patient fusionné ou inactif) ;
 *  - le contenu clinique n'est jamais copié dans le dossier : il est relevé en direct dans les modules (consultations, prescriptions…) ;
 *  - un dossier ne se supprime pas : il s'archive (clos) ou se verrouille (accès restreint), et se rouvre.
 */
import type { ServiceKey } from '../_shared/demo-people';
import type { MedicalRecord, RecordStatus } from './data';

export interface PatientLite { id: string; fullName: string; service: ServiceKey; status: 'active' | 'inactive'; mergedInto?: string; registeredAt: string }

export const recordIdFor = (patientId: string): string => `DOS-${patientId}`;

/** Dossier neuf pour un patient (complétude « incomplète » tant que rien n'est consigné). */
export function buildRecord(patient: PatientLite, now: Date): MedicalRecord {
  const day = now.toISOString().slice(0, 10);
  return {
    id: recordIdFor(patient.id), patientId: patient.id, patientName: patient.fullName, service: patient.service,
    openedAt: day, lastUpdate: day, status: 'active', completeness: 'incomplete', counts: { consultations: 0, prescriptions: 0, labOrders: 0, documents: 0 },
  };
}

/** Patients actifs, non fusionnés, qui n'ont encore aucun dossier. */
export function patientsWithoutRecord(patients: readonly PatientLite[], records: readonly MedicalRecord[]): PatientLite[] {
  const has = new Set(records.map((r) => r.patientId));
  return patients.filter((p) => p.status === 'active' && !p.mergedInto && !has.has(p.id));
}

/** Ouverture manuelle : un seul dossier par patient, jamais pour un patient inactif ou fusionné. */
export function createRecord(patient: PatientLite, existing: readonly MedicalRecord[], now: Date): MedicalRecord {
  if (patient.status !== 'active' || patient.mergedInto) throw new RecordError('patientInactive');
  if (existing.some((r) => r.patientId === patient.id)) throw new RecordError('alreadyExists');
  return buildRecord(patient, now);
}

export type RecordAction = 'archive' | 'lock' | 'reopen';
const TRANSITIONS: Record<RecordAction, { from: readonly RecordStatus[]; to: RecordStatus }> = {
  archive: { from: ['active', 'locked'], to: 'archived' },
  lock: { from: ['active'], to: 'locked' },
  reopen: { from: ['archived', 'locked'], to: 'active' },
};

export class RecordError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'RecordError'; }
}

export function applyAction(row: MedicalRecord, action: RecordAction, now: Date): MedicalRecord {
  const rule = TRANSITIONS[action];
  if (!rule || !rule.from.includes(row.status)) throw new RecordError('wrongStatus');
  return { ...row, status: rule.to, lastUpdate: now.toISOString().slice(0, 10) };
}

/** Actions proposables pour un statut (affichage). */
export const actionsFor = (status: RecordStatus): RecordAction[] => (Object.keys(TRANSITIONS) as RecordAction[]).filter((a) => TRANSITIONS[a].from.includes(status));
