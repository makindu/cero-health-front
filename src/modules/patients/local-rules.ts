import { BusinessRuleError } from '../_shared/business-error';
import { SERVICE_KEYS } from '../_shared/demo-people';
import type { Patient } from './data';
import { DEFAULT_CATEGORY_ID } from './categories';
import { FILE_NUMBER_PATTERN, normalizeFileNumber } from './duplicates';

/** Règles métier PURES du dossier patient en mode local (sans stockage ni interface : testables seules). */

const clean = (value: string | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();

/** Jour civil local AAAA-MM-JJ (jamais l'UTC : un patient né « aujourd'hui » ne doit pas être refusé la nuit). */
export function civilDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const isValidCivilDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

export interface PatientDraft {
  fullName: string;
  sex: 'F' | 'M';
  birthDate: string;
  phone: string;
  address: string;
  service: Patient['service'];
  insurer: string;
  emergencyContact: string;
  fileNumber: string;
  email: string;
  birthWeightGrams?: number;
  categoryId: string;
}

/** Valide et normalise la saisie. Refuse sans rien inventer (ex. pas de sexe ou de date de naissance par défaut). */
export function validatePatientInput(input: Record<string, string>, today: string): PatientDraft {
  const fullName = clean(input.fullName);
  if (fullName.length < 2) throw new BusinessRuleError('patientNameRequired');
  const sex = input.sex;
  if (sex !== 'F' && sex !== 'M') throw new BusinessRuleError('patientSexRequired');
  const birthDate = clean(input.birthDate);
  if (!isValidCivilDate(birthDate)) throw new BusinessRuleError('patientBirthInvalid');
  if (birthDate > today) throw new BusinessRuleError('patientBirthFuture');
  const fileNumber = clean(input.fileNumber).replace(/\s+/g, '');
  if (fileNumber && !FILE_NUMBER_PATTERN.test(fileNumber)) throw new BusinessRuleError('patientFileNumberFormat');
  const email = clean(input.email).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new BusinessRuleError('patientEmailInvalid');
  const weightRaw = clean(input.birthWeightGrams).replace(',', '.');
  let birthWeightGrams: number | undefined;
  if (weightRaw !== '') {
    birthWeightGrams = Number(weightRaw);
    if (!Number.isFinite(birthWeightGrams) || birthWeightGrams < 200 || birthWeightGrams > 8000) throw new BusinessRuleError('patientBirthWeightInvalid');
    birthWeightGrams = Math.round(birthWeightGrams);
  }
  const service = (SERVICE_KEYS as readonly string[]).includes(input.service ?? '') ? (input.service as Patient['service']) : 'generalMedicine';
  return {
    fullName,
    sex,
    birthDate,
    phone: clean(input.phone),
    address: clean(input.address),
    service,
    insurer: clean(input.insurer),
    emergencyContact: clean(input.emergencyContact),
    fileNumber,
    email,
    ...(birthWeightGrams === undefined ? {} : { birthWeightGrams }),
    categoryId: clean(input.categoryId) || DEFAULT_CATEGORY_ID,
  };
}

/** Prochain numéro de dossier local : DOS-LOC-AAAA-NNNN, continu par établissement (jamais réutilisé). */
export function nextFileNumber(existing: readonly Patient[], year: number): string {
  const prefix = `DOS-LOC-${year}-`;
  const used = existing
    .map((p) => p.fileNumber)
    .filter((n) => n.startsWith(prefix))
    .map((n) => Number(n.slice(prefix.length)))
    .filter(Number.isFinite);
  return `${prefix}${String(Math.max(0, ...used) + 1).padStart(4, '0')}`;
}

/** Un numéro de dossier identifie UN patient : un doublon (après normalisation) est refusé, jamais forcé. */
export function assertFileNumberFree(fileNumber: string, existing: readonly Patient[], selfId?: string): void {
  const key = normalizeFileNumber(fileNumber);
  if (!key) return;
  const clash = existing.find((p) => p.id !== selfId && normalizeFileNumber(p.fileNumber) === key);
  if (clash) throw new BusinessRuleError('patientFileNumberTaken', { fileNumber, name: clash.fullName }, 'conflict');
}

export function buildPatient(input: Record<string, string>, existing: readonly Patient[], now: Date, id: string): Patient {
  const today = civilDay(now);
  const draft = validatePatientInput(input, today);
  const fileNumber = draft.fileNumber || nextFileNumber(existing, now.getFullYear());
  assertFileNumberFree(fileNumber, existing);
  return { id, ...draft, fileNumber, status: 'active', registeredAt: today, lastVisit: null };
}

export function applyPatientUpdate(row: Patient, input: Record<string, string>, existing: readonly Patient[], now: Date): Patient {
  if (row.mergedInto) throw new BusinessRuleError('patientMerged', {}, 'conflict');
  const draft = validatePatientInput(input, civilDay(now));
  const fileNumber = draft.fileNumber || row.fileNumber;
  // Un doublon DÉJÀ présent (hérité) ne bloque pas la correction du dossier : seul un changement de numéro est contrôlé.
  if (normalizeFileNumber(fileNumber) !== normalizeFileNumber(row.fileNumber)) assertFileNumberFree(fileNumber, existing, row.id);
  const { birthWeightGrams: _ignored, ...rest } = row;
  return { ...rest, ...draft, fileNumber };
}

export interface MergePlan {
  keepId: string;
  duplicateIds: string[];
}

/** Fusion : le dossier conservé reste actif ; les autres sont désactivés (jamais supprimés) et pointent vers lui. */
export function planMerge(keep: Patient, payload: Record<string, string>, all: readonly Patient[]): MergePlan {
  if (!clean(payload.reason)) throw new BusinessRuleError('mergeReasonRequired');
  const duplicateIds = (payload.duplicateIds ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (duplicateIds.length === 0) throw new BusinessRuleError('mergeNothing');
  if (duplicateIds.includes(keep.id)) throw new BusinessRuleError('mergeSelf');
  if (keep.mergedInto || keep.status === 'inactive') throw new BusinessRuleError('mergeKeepInactive', {}, 'conflict');
  for (const id of duplicateIds) {
    const found = all.find((p) => p.id === id);
    if (!found) throw new BusinessRuleError('patientNotFound', {}, 'conflict');
    if (found.mergedInto) throw new BusinessRuleError('patientMerged', {}, 'conflict');
  }
  return { keepId: keep.id, duplicateIds };
}

export const markMerged = (row: Patient, keepId: string): Patient => ({ ...row, status: 'inactive', mergedInto: keepId });

/** Le dossier le plus récent d'activité conserve la date de dernière visite la plus récente. */
export const latestVisit = (a: string | null, b: string | null): string | null => (a && b ? (a > b ? a : b) : (a ?? b));

const fold = (value: string): string =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Retrouve UN patient actif à partir d'une saisie libre : identifiant, numéro de dossier, puis nom exact (sans accents ni casse).
 * Jamais de choix arbitraire : plusieurs correspondances = refus (il faut saisir l'identifiant ou le numéro de dossier).
 */
export function resolvePatient(text: string, patients: readonly Patient[]): Patient {
  const query = clean(text);
  if (!query) throw new BusinessRuleError('patientRequired');
  const attempts: ((p: Patient) => boolean)[] = [
    (p) => p.id.toLowerCase() === query.toLowerCase(),
    (p) => normalizeFileNumber(p.fileNumber) !== '' && normalizeFileNumber(p.fileNumber) === normalizeFileNumber(query),
    (p) => fold(p.fullName) === fold(query),
  ];
  for (const matches of attempts) {
    const found = patients.filter(matches);
    if (found.length === 0) continue;
    if (found.length > 1) throw new BusinessRuleError('patientAmbiguous', { count: found.length });
    const patient = found[0] as Patient;
    if (patient.mergedInto || patient.status === 'inactive') throw new BusinessRuleError('patientInactive', { name: patient.fullName }, 'conflict');
    return patient;
  }
  throw new BusinessRuleError('patientNotFound');
}
