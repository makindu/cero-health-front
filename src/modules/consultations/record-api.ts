import { ApiError, healthClient } from '@/core/api';
import { ensureReference, staffByUserId } from '../_shared/reference-data';
import type { Vitals, Antecedent, AntecedentCategory, AntecedentState, ConsultationDraft, ClinicalStatus, Diagnosis, DiagnosisStatus, DiagnosisType, InfoSource, Origin } from './clinical/model';
import { docOf, docToText, para, sanitizeDoc } from './richtext/doc';
import { emptyDraft } from './clinical/logic';

type Row = Record<string, unknown>;
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const list = (v: unknown): Row[] => (Array.isArray(v) ? v.map(rec) : []);

const invalid = (message: string): never => {
  throw new ApiError('validation', message, { source: 'health', status: 422, code: 'invalid_input' });
};

/** Qui a écrit : le serveur ne donne que l'identifiant de l'utilisateur ; on retrouve le nom dans le personnel quand c'est possible. */
export const authorName = (userId: unknown): string => (userId ? staffByUserId(text(userId))?.name ?? `Utilisateur n°${text(userId)}` : '');

/** Champ de l'examen -> champ du serveur (/patients/{id}/vital-signs). */
export const VITALS_API_FIELDS: Record<keyof Vitals, string> = {
  systolic: 'systolic_mmhg', diastolic: 'diastolic_mmhg', pulse: 'pulse_bpm', temperature: 'temperature_c', respiratoryRate: 'respiratory_rate',
  spo2: 'spo2_percent', weight: 'weight_kg', height: 'height_cm', brachialPerimeter: 'brachial_cm', headCircumference: 'head_circumference_cm',
};

/** Valeurs saisies par le médecin (nombres) ; vide si rien n'est rempli. Une virgule décimale est acceptée. */
export function vitalsBody(v: Vitals): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, field] of Object.entries(VITALS_API_FIELDS) as [keyof Vitals, string][]) {
    const raw = String(v[k] ?? '').trim().replace(',', '.');
    if (raw !== '' && Number.isFinite(Number(raw))) out[field] = Number(raw);
  }
  return out;
}

const SOURCES: readonly InfoSource[] = ['patient', 'companion', 'other'];
const ORIENTATIONS = ['none', 'ambulatory', 'service', 'hospitalization', 'referral'] as const;

/** Ce que le serveur sait déjà d'une consultation, pour n'envoyer que ce qui est nouveau ou modifié. */
interface Synced {
  version: number;
  patientId: string;
  /** Dernier contenu envoyé ou reçu (évite un enregistrement inutile). */
  contentJson: string;
  /** Identifiant de l'interface -> identifiant serveur. */
  diagnosisIds: Map<string, string>;
  /** Dernier état connu du serveur, par identifiant serveur. */
  diagnoses: Map<string, { type: string; status: string; comment: string }>;
  verifications: number;
  addenda: Set<string>;
  /** Antécédents : identifiant de l'interface -> identifiant serveur (les entrées déjà connues se répondent à elles-mêmes). */
  antecedentIds: Map<string, string>;
  /** Dernières constantes du médecin envoyées ou reçues. */
  vitalsJson: string;
}
const synced = new Map<string, Synced>();

export function contentPatch(draft: ConsultationDraft): Row {
  const short = (value: string, name: string): string => {
    const v = value.trim();
    if (v.length > 2000) invalid(`${name} : 2000 caractères au maximum.`);
    return v;
  };
  const date = (value: string): string => (/^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '');
  const decision = draft.conclusion.decision.trim();
  return {
    anamnesis: {
      chief_complaint: short(draft.anamnesis.chiefComplaint, 'Motif de consultation'),
      source: SOURCES.includes(draft.anamnesis.source) ? draft.anamnesis.source : 'patient',
      history: draft.anamnesis.history,
      notes: draft.anamnesis.notes,
    },
    antecedent_notes: draft.antecedentNotes,
    exam: {
      not_done: draft.exam.notDone,
      not_done_reason: short(draft.exam.notDoneReason, "Raison de l'absence d'examen"),
      general_state: short(draft.exam.generalState, 'État général'),
      physical: draft.exam.physical,
    },
    evaluation: draft.evaluation,
    plan: {
      synthesis: draft.plan.synthesis,
      actions: draft.plan.actions,
      orientation: draft.plan.orientation === 'ambulatory' ? 'none' : draft.plan.orientation,
      orientation_target: short(draft.plan.orientationTarget, 'Destination'),
      follow_up_date: date(draft.plan.followUpDate),
    },
    conclusion: {
      // La décision complète (sans limite) est gardée dans `text` ; `decision` n'en est que le résumé de 255 signes.
      text: decision === '' ? docOf() : docOf(...decision.split(/\n+/).map((line) => para(line))),
      decision: decision.length > 255 ? `${decision.slice(0, 254)}…` : decision,
      recommendations: draft.conclusion.recommendations,
      next_appointment: date(draft.conclusion.nextAppointment),
    },
  };
}

function diagnosisFrom(r: Row): Diagnosis {
  const history = list(r.history).map((e) => ({
    at: text(e.occurred_at), by: authorName(e.actor_user_id),
    type: text(e.type) as DiagnosisType, status: text(e.status) as DiagnosisStatus, comment: text(e.comment),
  }));
  return {
    id: text(r.id), label: text(r.label), icd10: r.icd10 ? text(r.icd10) : undefined,
    type: text(r.type) as DiagnosisType, status: text(r.status) as DiagnosisStatus, comment: text(r.comment),
    createdAt: history[0]?.at ?? '', author: authorName(r.author_user_id), history,
  };
}

/** Antécédent du patient (GET /patients/{id}/antecedents?history=1) -> entrée de l'interface. Les entrées remplacées restent dans l'historique. */
export function antecedentFrom(r: Row): Antecedent {
  const origin = text(r.origin);
  return {
    id: text(r.id),
    category: text(r.category) as AntecedentCategory,
    label: text(r.label),
    detail: r.detail ? text(r.detail) : undefined,
    severity: r.severity ? (text(r.severity) as Antecedent['severity']) : undefined,
    origin: (['declared', 'observed', 'companion', 'other'].includes(origin) ? origin : 'declared') as Origin,
    originDetail: r.origin_detail ? text(r.origin_detail) : undefined,
    state: text(r.state) as AntecedentState,
    recordedAt: text(r.recorded_at),
    author: authorName(r.author_user_id),
    supersedes: r.supersedes_id ? text(r.supersedes_id) : undefined,
  };
}

/** Corps d'écriture d'un antécédent (le serveur fixe l'auteur et l'heure ; la gravité ne concerne que les allergies). */
function antecedentBody(a: Antecedent, consultationId: string): Row {
  return {
    label: a.label.trim(),
    detail: a.detail?.trim() ? a.detail.trim() : null,
    severity: a.category === 'allergy' && a.severity ? a.severity : null,
    origin: a.origin,
    origin_detail: a.origin === 'other' ? (a.originDetail ?? '').trim() || null : null,
    state: a.state,
    consultation_id: Number(consultationId) || null,
  };
}

/** Détail renvoyé par GET /consultations/{id} (+ historique des modifications) -> brouillon de l'interface. */
export function draftFromApi(row: Row, revisions: Row[]): ConsultationDraft {
  const id = text(row.id);
  const status = text(row.status) as ClinicalStatus;
  const base = emptyDraft(id, status);
  const content = rec(row.content);
  const an = rec(content.anamnesis);
  const exam = rec(content.exam);
  const plan = rec(content.plan);
  const concl = rec(content.conclusion);
  const orientation = text(plan.orientation);
  const decisionDoc = docToText(concl.text);
  return {
    ...base,
    anamnesis: {
      ...base.anamnesis,
      chiefComplaint: text(an.chief_complaint),
      source: SOURCES.includes(text(an.source) as InfoSource) ? (text(an.source) as InfoSource) : 'patient',
      history: sanitizeDoc(an.history), notes: sanitizeDoc(an.notes),
    },
    antecedentNotes: sanitizeDoc(content.antecedent_notes),
    exam: { ...base.exam, notDone: exam.not_done === true, notDoneReason: text(exam.not_done_reason), generalState: text(exam.general_state), physical: sanitizeDoc(exam.physical) },
    evaluation: sanitizeDoc(content.evaluation),
    plan: {
      ...base.plan,
      synthesis: sanitizeDoc(plan.synthesis), actions: sanitizeDoc(plan.actions),
      orientation: (ORIENTATIONS as readonly string[]).includes(orientation) ? (orientation as ConsultationDraft['plan']['orientation']) : 'none',
      orientationTarget: text(plan.orientation_target), followUpDate: text(plan.follow_up_date),
    },
    conclusion: {
      ...base.conclusion,
      decision: decisionDoc || text(concl.decision),
      recommendations: sanitizeDoc(concl.recommendations),
      nextAppointment: text(concl.next_appointment),
    },
    diagnoses: list(row.diagnoses).map(diagnosisFrom),
    verifications: list(row.verifications).map((v) => ({
      at: text(v.verified_at), by: authorName(v.verified_by_user_id), unchanged: v.unchanged === true,
      changedIds: Array.isArray(v.changed_ids) ? v.changed_ids.map(text) : [],
    })),
    addenda: list(row.addenda).map((a) => ({ id: text(a.id), at: text(a.created_at), by: authorName(a.author_user_id), text: docToText(a.content) })),
    revisions: revisions.map((r) => ({
      at: text(r.occurred_at), by: authorName(r.actor_user_id),
      sections: (Array.isArray(r.sections) ? r.sections.map(text) : []) as ConsultationDraft['revisions'][number]['sections'],
    })),
    signedAt: row.signed_at ? text(row.signed_at) : undefined,
    signedBy: row.signed_by_user_id ? authorName(row.signed_by_user_id) : undefined,
  };
}

export async function fetchDraft(id: string): Promise<ConsultationDraft> {
  await ensureReference();
  const path = `/consultations/${encodeURIComponent(id)}`;
  const detail = await healthClient.get<Row>(path);
  const revisions = await healthClient.get<Row[]>(`${path}/revisions`).then((r) => (Array.isArray(r.data) ? r.data : [])).catch((): Row[] => []);
  const row = rec(detail.data);
  const draft = draftFromApi(row, revisions);
  const patientKey = text(row.patient_id);
  const known = patientKey
    ? await healthClient.get<Row[]>(`/patients/${encodeURIComponent(patientKey)}/antecedents?history=1`).then((r) => (Array.isArray(r.data) ? r.data : [])).catch((): Row[] => [])
    : [];
  draft.antecedents = known.map(antecedentFrom);
  synced.set(id, {
    version: Number(row.content_version) || 1,
    patientId: text(row.patient_id),
    contentJson: JSON.stringify(contentPatch(draft)),
    diagnosisIds: new Map(draft.diagnoses.map((d) => [d.id, d.id])),
    diagnoses: new Map(draft.diagnoses.map((d) => [d.id, { type: d.type, status: d.status, comment: d.comment }])),
    verifications: draft.verifications.length,
    addenda: new Set(draft.addenda.map((a) => a.id)),
    antecedentIds: new Map(draft.antecedents.map((a) => [a.id, a.id])),
    vitalsJson: JSON.stringify(vitalsBody(draft.exam.vitals)),
  });
  return draft;
}

/**
 * Enregistre ce qui a changé : contenu (si la consultation n'est pas verrouillée), diagnostics, vérification des
 * antécédents et addenda. Chaque écriture est revérifiée par le serveur (droits, verrouillage, version).
 */
export async function saveDraft(id: string, draft: ConsultationDraft): Promise<void> {
  let state = synced.get(id);
  if (!state) {
    await fetchDraft(id);
    state = synced.get(id);
  }
  if (!state) throw new ApiError('not_found', 'Consultation introuvable.', { source: 'health', status: 404 });
  const path = `/consultations/${encodeURIComponent(id)}`;
  const locked = draft.status === 'signed' || draft.status === 'closed';

  if (!locked) {
    const patch = contentPatch(draft);
    const json = JSON.stringify(patch);
    if (json !== state.contentJson) {
      const res = await healthClient.patch<Row>(`${path}/content`, { content: patch, expected_version: state.version });
      state.version = Number(rec(res.data).content_version) || state.version;
      state.contentJson = json;
    }
    // Constantes saisies par le médecin : ajoutées au dossier (ajout seul) si elles diffèrent de la dernière prise connue.
    const vitals = vitalsBody(draft.exam.vitals);
    const vitalsJson = JSON.stringify(vitals);
    if (Object.keys(vitals).length > 0 && vitalsJson !== state.vitalsJson) {
      const last = await healthClient.get<Row[]>(`/patients/${encodeURIComponent(state.patientId)}/vital-signs?per_page=20`).then((r) => (Array.isArray(r.data) ? r.data : [])).catch((): Row[] => []);
      const current: Record<string, number> = {};
      for (const r of [...last].reverse()) for (const f of Object.values(VITALS_API_FIELDS)) if (r[f] !== null && r[f] !== undefined) current[f] = Number(r[f]);
      if (Object.entries(vitals).some(([f, n]) => current[f] !== n)) {
        await healthClient.post(`/patients/${encodeURIComponent(state.patientId)}/vital-signs`, vitals);
      }
      state.vitalsJson = vitalsJson;
    }
    // Antécédents : jamais écrasés. Une nouvelle entrée est ajoutée au dossier du patient ; une révision remplace l'entrée précédente (qui reste dans l'historique).
    for (const a of draft.antecedents) {
      if (state.antecedentIds.has(a.id)) continue;
      if (a.supersedes) {
        const previous = state.antecedentIds.get(a.supersedes);
        if (!previous) invalid("Antécédent à réviser introuvable : rechargez la consultation.");
        const revised = await healthClient.post<Row>(`/patients/${encodeURIComponent(state.patientId)}/antecedents/${encodeURIComponent(previous ?? '')}/revise`, antecedentBody(a, id));
        state.antecedentIds.set(a.id, text(rec(revised.data).id));
      } else {
        const created = await healthClient.post<Row>(`/patients/${encodeURIComponent(state.patientId)}/antecedents`, { category: a.category, ...antecedentBody(a, id) });
        state.antecedentIds.set(a.id, text(rec(created.data).id));
      }
    }
    for (const d of draft.diagnoses) {
      const serverId = state.diagnosisIds.get(d.id);
      if (!serverId) {
        const created = await healthClient.post<Row>(`${path}/diagnoses`, {
          label: d.label, icd10: d.icd10 || null, type: d.type, status: d.status, comment: d.comment || null,
        });
        const newId = text(rec(created.data).id);
        state.diagnosisIds.set(d.id, newId);
        state.diagnoses.set(newId, { type: d.type, status: d.status, comment: d.comment });
        continue;
      }
      const known = state.diagnoses.get(serverId);
      if (known && (known.type !== d.type || known.status !== d.status || known.comment !== d.comment)) {
        await healthClient.patch(`/diagnoses/${encodeURIComponent(serverId)}`, { type: d.type, status: d.status, comment: d.comment || null });
        state.diagnoses.set(serverId, { type: d.type, status: d.status, comment: d.comment });
      }
    }
    while (state.verifications < draft.verifications.length) {
      await healthClient.post(`${path}/antecedents-verification`, {});
      state.verifications += 1;
    }
  }
  for (const a of draft.addenda) {
    if (state.addenda.has(a.id)) continue;
    await healthClient.post(`${path}/addenda`, { content: docOf(para(a.text)) });
    state.addenda.add(a.id);
  }
}

/** Réservé aux tests. */
export const resetSynced = (): void => synced.clear();
