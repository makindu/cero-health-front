import { EMPTY_DOC, docToText, isEmptyDoc } from '../richtext/doc';
import {
  SECTIONS,
  type Addendum, type Antecedent, type AntecedentVerification, type ClinicalStatus, type ConsultationDraft,
  type Diagnosis, type DiagnosisStatus, type DiagnosisType, type SectionId, type Vitals,
} from './model';

/** Contexte d'une action : qui, quand, et l'identifiant à créer (fourni par l'appelant pour rester pur). */
export interface ActionContext {
  by: string;
  at: string;
  id?: string;
}

// ───────────────────────── Statuts ─────────────────────────

const TRANSITIONS: Record<ClinicalStatus, readonly ClinicalStatus[]> = {
  draft: ['inProgress'],
  inProgress: ['awaitingResults', 'toValidate'],
  awaitingResults: ['inProgress', 'toValidate'],
  toValidate: ['inProgress', 'signed'],
  signed: ['closed'],
  closed: [],
};
export const canTransition = (from: ClinicalStatus, to: ClinicalStatus): boolean => TRANSITIONS[from].includes(to);
export const nextStatuses = (from: ClinicalStatus): readonly ClinicalStatus[] => TRANSITIONS[from];
/** Une consultation signée ou clôturée n'est plus modifiable : seul un addendum tracé est possible. */
export const isLocked = (status: ClinicalStatus): boolean => status === 'signed' || status === 'closed';
export const canAddAddendum = isLocked;

// ───────────────────────── Constantes ─────────────────────────

const num = (value: string): number | null => {
  const n = Number(value.replace(',', '.'));
  return value.trim() !== '' && Number.isFinite(n) ? n : null;
};

/** IMC (kg/m²) arrondi à 0,1. Null si poids ou taille manquants ou invraisemblables. */
export function computeBmi(weightKg: string, heightCm: string): number | null {
  const w = num(weightKg);
  const h = num(heightCm);
  if (w === null || h === null || w < 0.3 || w > 500 || h < 30 || h > 250) return null;
  const m = h / 100;
  return Math.round((w / (m * m)) * 10) / 10;
}

const RANGES: Record<keyof Vitals, [number, number]> = {
  systolic: [40, 300], diastolic: [20, 200], pulse: [20, 300], temperature: [30, 45],
  respiratoryRate: [4, 90], spo2: [30, 100], weight: [0.3, 500], height: [30, 250],
};
/** Champs hors plage plausible (faute de frappe probable) : à signaler, jamais à corriger automatiquement. */
export function vitalsOutOfRange(vitals: Vitals): (keyof Vitals)[] {
  return (Object.keys(RANGES) as (keyof Vitals)[]).filter((key) => {
    const n = num(vitals[key]);
    return n !== null && (n < RANGES[key][0] || n > RANGES[key][1]);
  });
}

// ───────────────────────── Antécédents ─────────────────────────

/** Entrées en vigueur : celles qui n'ont pas été remplacées par une révision. L'historique complet reste dans la liste. */
export function currentAntecedents(list: readonly Antecedent[]): Antecedent[] {
  const superseded = new Set(list.map((a) => a.supersedes).filter((id): id is string => Boolean(id)));
  return list.filter((a) => !superseded.has(a.id));
}
export const activeAllergies = (list: readonly Antecedent[]): Antecedent[] =>
  currentAntecedents(list).filter((a) => a.category === 'allergy' && a.state === 'active');

export function addAntecedent(list: readonly Antecedent[], entry: Omit<Antecedent, 'id' | 'recordedAt' | 'author'>, ctx: ActionContext): Antecedent[] {
  if (!ctx.id) throw new Error('id requis');
  return [...list, { ...entry, id: ctx.id, recordedAt: ctx.at, author: ctx.by }];
}

/** Révise une entrée : crée une NOUVELLE entrée qui remplace l'ancienne, sans jamais écraser ni supprimer celle-ci. */
export function reviseAntecedent(
  list: readonly Antecedent[],
  id: string,
  change: Partial<Pick<Antecedent, 'label' | 'detail' | 'severity' | 'state' | 'origin'>>,
  ctx: ActionContext,
): Antecedent[] {
  const current = currentAntecedents(list).find((a) => a.id === id);
  if (!current || !ctx.id) return [...list];
  return [...list, { ...current, ...change, id: ctx.id, supersedes: id, recordedAt: ctx.at, author: ctx.by }];
}

/** Chaîne de révisions d'une entrée (de la plus ancienne à la plus récente). */
export function antecedentHistory(list: readonly Antecedent[], id: string): Antecedent[] {
  const byId = new Map(list.map((a) => [a.id, a]));
  const chain: Antecedent[] = [];
  let cursor = byId.get(id);
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.supersedes ? byId.get(cursor.supersedes) : undefined;
  }
  return chain;
}

/** Enregistre que les antécédents ont été vérifiés lors de cette consultation, avec les entrées modifiées depuis. */
export function recordVerification(
  draft: Pick<ConsultationDraft, 'antecedents' | 'verifications'>,
  ctx: ActionContext,
  sinceIso: string,
): AntecedentVerification[] {
  const changedIds = draft.antecedents.filter((a) => a.recordedAt >= sinceIso).map((a) => a.id);
  return [...draft.verifications, { at: ctx.at, by: ctx.by, unchanged: changedIds.length === 0, changedIds }];
}

// ───────────────────────── Diagnostics ─────────────────────────

export const ICD10_PATTERN = /^[A-TV-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/;
export const normalizeIcd10 = (code: string): string => code.trim().toUpperCase();

export type DiagnosisError = 'labelRequired' | 'invalidIcd10' | 'principalExists' | 'differentialCannotBeConfirmed' | 'notFound' | 'noChange';
export type DiagnosisResult = { ok: true; list: Diagnosis[] } | { ok: false; error: DiagnosisError };

const hasActivePrincipal = (list: readonly Diagnosis[], exceptId?: string) =>
  list.some((d) => d.type === 'principal' && d.status !== 'ruledOut' && d.id !== exceptId);

export function addDiagnosis(
  list: readonly Diagnosis[],
  input: { label: string; icd10?: string; type: DiagnosisType; status: DiagnosisStatus; comment: string },
  ctx: ActionContext,
): DiagnosisResult {
  const label = input.label.trim();
  if (!label || !ctx.id) return { ok: false, error: 'labelRequired' };
  const icd10 = input.icd10 ? normalizeIcd10(input.icd10) : undefined;
  if (icd10 && !ICD10_PATTERN.test(icd10)) return { ok: false, error: 'invalidIcd10' };
  if (input.type === 'differential' && input.status === 'confirmed') return { ok: false, error: 'differentialCannotBeConfirmed' };
  // Un seul principal actif : pas de rétrogradation silencieuse, le médecin doit décider.
  if (input.type === 'principal' && hasActivePrincipal(list)) return { ok: false, error: 'principalExists' };
  const diagnosis: Diagnosis = {
    id: ctx.id, label, icd10, type: input.type, status: input.status, comment: input.comment.trim(),
    createdAt: ctx.at, author: ctx.by,
    history: [{ at: ctx.at, by: ctx.by, type: input.type, status: input.status, comment: input.comment.trim() }],
  };
  return { ok: true, list: [...list, diagnosis] };
}

/** Fait évoluer un diagnostic (ex. présomptif → confirmé). L'ancien état reste dans l'historique ; rien n'est supprimé. */
export function updateDiagnosis(
  list: readonly Diagnosis[],
  id: string,
  change: { type?: DiagnosisType; status?: DiagnosisStatus; comment: string },
  ctx: ActionContext,
): DiagnosisResult {
  const current = list.find((d) => d.id === id);
  if (!current) return { ok: false, error: 'notFound' };
  const type = change.type ?? current.type;
  const status = change.status ?? current.status;
  const comment = change.comment.trim();
  if (type === current.type && status === current.status && comment === '') return { ok: false, error: 'noChange' };
  if (type === 'differential' && status === 'confirmed') return { ok: false, error: 'differentialCannotBeConfirmed' };
  if (type === 'principal' && status !== 'ruledOut' && hasActivePrincipal(list, id)) return { ok: false, error: 'principalExists' };
  const next: Diagnosis = {
    ...current, type, status, comment: comment || current.comment,
    history: [...current.history, { at: ctx.at, by: ctx.by, type, status, comment }],
  };
  return { ok: true, list: list.map((d) => (d.id === id ? next : d)) };
}

export const principalDiagnosis = (list: readonly Diagnosis[]): Diagnosis | undefined =>
  list.find((d) => d.type === 'principal' && d.status !== 'ruledOut');

// ───────────────────────── Brouillon, progression, signature ─────────────────────────

/** Sections dont le contenu a changé entre deux versions du brouillon (pour l'historique des modifications). */
export function changedSections(prev: ConsultationDraft, next: ConsultationDraft): SectionId[] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const changed: SectionId[] = [];
  if (!same(prev.anamnesis, next.anamnesis)) changed.push('anamnesis');
  if (!same(prev.antecedents, next.antecedents) || !same(prev.verifications, next.verifications) || !same(prev.antecedentNotes, next.antecedentNotes)) changed.push('history');
  if (!same(prev.exam, next.exam)) changed.push('exam');
  if (!same(prev.diagnoses, next.diagnoses) || !same(prev.evaluation, next.evaluation)) changed.push('assessment');
  if (!same(prev.plan, next.plan)) changed.push('plan');
  if (!same(prev.conclusion, next.conclusion)) changed.push('conclusion');
  return changed;
}

export function logRevision(draft: ConsultationDraft, next: ConsultationDraft, ctx: ActionContext): ConsultationDraft {
  const sections = changedSections(draft, next);
  return sections.length === 0 ? next : { ...next, revisions: [...next.revisions, { at: ctx.at, by: ctx.by, sections }] };
}

const filled = (s: string) => s.trim() !== '';
const vitalsFilled = (v: Vitals) => Object.values(v).some(filled);

/** Une section est « renseignée » quand elle contient au moins une information saisie (jamais une valeur inventée). */
export function sectionDone(draft: ConsultationDraft, section: SectionId): boolean {
  switch (section) {
    case 'general': return true;
    case 'anamnesis': return filled(draft.anamnesis.chiefComplaint);
    case 'history': return draft.verifications.length > 0;
    case 'exam': return draft.exam.notDone ? filled(draft.exam.notDoneReason) : vitalsFilled(draft.exam.vitals) || !isEmptyDoc(draft.exam.physical);
    case 'assessment': return draft.diagnoses.length > 0;
    case 'plan': return !isEmptyDoc(draft.plan.synthesis) || !isEmptyDoc(draft.plan.actions);
    case 'conclusion': return !isEmptyDoc(draft.conclusion.text);
  }
}
export function progress(draft: ConsultationDraft): { done: SectionId[]; percent: number } {
  const done = SECTIONS.filter((s) => sectionDone(draft, s));
  return { done, percent: Math.round((done.length / SECTIONS.length) * 100) };
}

export type SignatureIssue = 'chiefComplaint' | 'antecedentsNotVerified' | 'principalDiagnosis' | 'conclusion';
/** Éléments obligatoires avant signature. La signature elle-même reste un acte du praticien. */
export function signatureIssues(draft: ConsultationDraft): SignatureIssue[] {
  const issues: SignatureIssue[] = [];
  if (!filled(draft.anamnesis.chiefComplaint)) issues.push('chiefComplaint');
  if (draft.verifications.length === 0) issues.push('antecedentsNotVerified');
  if (!principalDiagnosis(draft.diagnoses)) issues.push('principalDiagnosis');
  if (isEmptyDoc(draft.conclusion.text)) issues.push('conclusion');
  return issues;
}

/** Addendum : seul moyen de compléter une consultation signée. Ajoute, ne modifie rien. */
export function addAddendum(draft: ConsultationDraft, text: string, ctx: ActionContext): ConsultationDraft | null {
  if (!canAddAddendum(draft.status) || !text.trim() || !ctx.id) return null;
  const addendum: Addendum = { id: ctx.id, at: ctx.at, by: ctx.by, text: text.trim() };
  return { ...draft, addenda: [...draft.addenda, addendum] };
}

export function emptyDraft(consultationId: string, status: ClinicalStatus = 'draft'): ConsultationDraft {
  return {
    consultationId, status,
    anamnesis: { chiefComplaint: '', source: 'patient', onset: '', duration: '', location: '', intensity: '', associated: '', aggravating: '', relieving: '', priorTreatments: '', history: EMPTY_DOC, notes: EMPTY_DOC },
    antecedents: [], verifications: [], antecedentNotes: EMPTY_DOC,
    exam: { notDone: false, notDoneReason: '', vitals: { systolic: '', diastolic: '', pulse: '', temperature: '', respiratoryRate: '', spo2: '', weight: '', height: '' }, generalState: '', physical: EMPTY_DOC, systems: EMPTY_DOC, observations: EMPTY_DOC },
    diagnoses: [], evaluation: EMPTY_DOC,
    plan: { synthesis: EMPTY_DOC, actions: EMPTY_DOC, orientation: 'none', orientationTarget: '', followUpDate: '' },
    conclusion: { text: EMPTY_DOC, decision: '', recommendations: EMPTY_DOC, nextAppointment: '' },
    revisions: [], addenda: [],
  };
}

export { docToText };
