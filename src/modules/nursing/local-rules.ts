import { BusinessRuleError } from '../_shared/business-error';
import type { Patient } from '../patients/data';
import { resolvePatient } from '../patients/local-rules';
import { PRIORITIES, type TriageCategory, type TriageEntry, type TriageStatus } from './data';

/** Règles métier PURES du triage et des constantes vitales en mode local. */

interface Ctx {
  now: Date;
  actor: { id: string; name: string };
}

const CATEGORIES: readonly TriageCategory[] = ['injury', 'fever', 'pregnancy', 'followUp', 'other'];
const ACTIVE: readonly TriageStatus[] = ['waiting', 'inTriage', 'inCare'];

export function buildTriageEntry(input: Record<string, string>, ctx: Ctx, patients: readonly Patient[], existing: readonly TriageEntry[], id: string): TriageEntry {
  const patient = resolvePatient(input.patient ?? '', patients);
  const priority = input.priority ?? 'standard';
  if (!(PRIORITIES as readonly string[]).includes(priority)) throw new BusinessRuleError('urgencyInvalid');
  const category = (input.category ?? 'other') as TriageCategory;
  if (!CATEGORIES.includes(category)) throw new BusinessRuleError('categoryInvalid');
  if (existing.some((e) => e.patientId === patient.id && ACTIVE.includes(e.status))) throw new BusinessRuleError('patientAlreadyInQueue', {}, 'conflict');
  return {
    id,
    patientId: patient.id,
    patientName: patient.fullName,
    arrivedAt: ctx.now.toISOString(),
    priority: priority as TriageEntry['priority'],
    category,
    status: 'waiting',
    nurse: '',
    reason: (input.reason ?? '').trim() || undefined,
    source: input.source || undefined,
  };
}

/** Circuit infirmier : attente → triage → soins → transfert ou sortie. Aucune étape ne peut être sautée. */
const TRANSITIONS: Record<string, { from: readonly TriageStatus[]; to: TriageStatus }> = {
  'start-triage': { from: ['waiting'], to: 'inTriage' },
  'send-to-care': { from: ['inTriage'], to: 'inCare' },
  transfer: { from: ['inCare'], to: 'transferred' },
  discharge: { from: ['inCare'], to: 'discharged' },
  'send-to-doctor': { from: ['inTriage', 'inCare'], to: 'transferred' },
};

export function applyTriageCommand(row: TriageEntry, action: string, ctx: Ctx): TriageEntry {
  const rule = TRANSITIONS[action];
  if (!rule) throw new BusinessRuleError('unknownAction', { action });
  if (!rule.from.includes(row.status)) throw new BusinessRuleError('invalidTransition', { status: row.status }, 'conflict');
  return { ...row, status: rule.to, nurse: action === 'start-triage' ? ctx.actor.name : row.nurse };
}

export interface VitalsRecord {
  id: string;
  entryId: string;
  recordedAt: string;
  recordedBy: string;
  temperature?: number;
  pulse?: number;
  systolic?: number;
  diastolic?: number;
  respiratoryRate?: number;
  spo2?: number;
  weight?: number;
  note?: string;
}

/**
 * Bornes de PLAUSIBILITÉ de saisie (détecter une faute de frappe), pas des seuils cliniques : aucune interprétation,
 * aucun diagnostic. Une valeur hors bornes est refusée ; une valeur « anormale » mais plausible est enregistrée telle quelle.
 */
const BOUNDS: Record<string, [number, number]> = {
  temperature: [25, 45],
  pulse: [20, 300],
  systolic: [40, 300],
  diastolic: [20, 200],
  respiratoryRate: [4, 80],
  spo2: [30, 100],
  weight: [0.3, 400],
};

export function buildVitals(input: Record<string, string>, entryId: string, ctx: Ctx, id: string): VitalsRecord {
  const record: VitalsRecord = { id, entryId, recordedAt: ctx.now.toISOString(), recordedBy: ctx.actor.name };
  let count = 0;
  for (const [field, [min, max]] of Object.entries(BOUNDS)) {
    const raw = (input[field] ?? '').trim().replace(',', '.');
    if (raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < min || value > max) throw new BusinessRuleError('vitalOutOfRange', { field, min, max });
    (record as unknown as Record<string, number>)[field] = value;
    count += 1;
  }
  if (count === 0) throw new BusinessRuleError('vitalsEmpty');
  if (record.systolic !== undefined && record.diastolic !== undefined && record.diastolic >= record.systolic) {
    throw new BusinessRuleError('vitalPressureOrder');
  }
  const note = (input.note ?? '').trim();
  if (note) record.note = note;
  return record;
}
