import type { Patient } from './data';

export type DuplicateReason = 'phone' | 'fileNumber';

export interface DuplicateGroup {
  reason: DuplicateReason;
  /** Valeur normalisée commune (téléphone en chiffres, numéro de dossier en majuscules sans espaces). */
  key: string;
  patients: Patient[];
}

/** Chiffres uniquement ; un numéro de moins de 6 chiffres n'est pas assez discriminant pour comparer. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 6 ? digits : '';
}

/** Lettres et chiffres seulement, en majuscules : « dos-0001 », « DOS 0001 » et « DOS0001 » désignent le même dossier. */
export function normalizeFileNumber(fileNumber: string): string {
  return fileNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/** Format toléré d'un numéro de dossier : 3 à 30 caractères (lettres, chiffres, . _ / -), commençant par une lettre ou un chiffre. */
export const FILE_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{2,29}$/;

export const isValidFileNumber = (fileNumber: string): boolean => FILE_NUMBER_PATTERN.test(fileNumber.trim());

/** Contrôle de cohérence : dossiers dont le numéro de dossier est absent ou hors format. */
export function findFileNumberIssues(patients: readonly Patient[]): { patient: Patient; issue: 'missing' | 'format' }[] {
  const issues: { patient: Patient; issue: 'missing' | 'format' }[] = [];
  for (const patient of patients) {
    if (!patient.fileNumber.trim()) issues.push({ patient, issue: 'missing' });
    else if (!isValidFileNumber(patient.fileNumber)) issues.push({ patient, issue: 'format' });
  }
  return issues;
}

const keyOf = (patient: Pick<Patient, 'phone' | 'fileNumber'>, reason: DuplicateReason): string =>
  reason === 'phone' ? normalizePhone(patient.phone) : normalizeFileNumber(patient.fileNumber);

/** Groupes de dossiers partageant le même téléphone ou le même numéro de dossier (≥ 2 dossiers). */
export function findDuplicateGroups(patients: readonly Patient[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  for (const reason of ['fileNumber', 'phone'] as const) {
    const byKey = new Map<string, Patient[]>();
    for (const patient of patients) {
      const key = keyOf(patient, reason);
      if (!key) continue;
      byKey.set(key, [...(byKey.get(key) ?? []), patient]);
    }
    for (const [key, list] of byKey) if (list.length > 1) groups.push({ reason, key, patients: list });
  }
  return groups;
}

/** Dossiers existants qui pourraient correspondre à un candidat (saisie en cours ou fiche ouverte). */
export function findDuplicatesOf(
  candidate: Pick<Patient, 'phone' | 'fileNumber'> & { id?: string },
  patients: readonly Patient[],
): { reason: DuplicateReason; patient: Patient }[] {
  const found: { reason: DuplicateReason; patient: Patient }[] = [];
  for (const reason of ['fileNumber', 'phone'] as const) {
    const key = keyOf(candidate, reason);
    if (!key) continue;
    for (const patient of patients) {
      if (patient.id === candidate.id) continue;
      if (keyOf(patient, reason) === key) found.push({ reason, patient });
    }
  }
  return found;
}
