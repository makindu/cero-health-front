import type { TFunction } from 'i18next';
import { currentAntecedents, docToText } from './clinical/logic';
import type { ConsultationDraft, Vitals } from './clinical/model';
import { docOf, type RichDoc, type RichNode } from './richtext/doc';

export interface SummaryRow { key: string; label: string; text: string }

const VITAL_KEYS: (keyof Vitals)[] = ['systolic', 'diastolic', 'pulse', 'temperature', 'respiratoryRate', 'spo2', 'weight', 'height', 'brachialPerimeter', 'headCircumference'];

/**
 * Synthèse clinique : reprend automatiquement ce qui a été saisi dans les sections précédentes (rien n'est inventé :
 * une rubrique vide est simplement omise). Le médecin la complète ensuite avec son propre commentaire.
 */
export function buildClinicalSummary(draft: ConsultationDraft, t: TFunction<'consultations'>): SummaryRow[] {
  const rows: SummaryRow[] = [];
  const add = (key: string, label: string, text: string) => { if (text.trim() !== '') rows.push({ key, label, text: text.trim() }); };
  const a = draft.anamnesis;
  add('symptoms', t('consultations:clinical.anamnesis.chiefComplaint'), a.chiefComplaint);
  add('current', t('consultations:clinical.anamnesis.history'), docToText(a.history));
  add('antecedents', t('consultations:clinical.sections.history'), currentAntecedents(draft.antecedents)
    .filter((x) => x.state !== 'unknown' && x.state !== 'none')
    .map((x) => `${t(`consultations:clinical.history.categories.${x.category}`)} : ${x.label}${x.detail ? ` (${x.detail})` : ''}`).join('\n'));
  const v = draft.exam.vitals;
  add('vitals', t('consultations:clinical.exam.vitalsTitle'), VITAL_KEYS.filter((k) => v[k]).map((k) => `${t(`consultations:clinical.exam.vitals.${k}`)} ${v[k]}`).join(' · '));
  add('physical', t('consultations:clinical.exam.physical'), docToText(draft.exam.physical));
  add('diagnoses', t('consultations:clinical.sections.assessment'), draft.diagnoses.filter((d) => d.status !== 'ruledOut')
    .map((d) => `${d.label}${d.icd10 ? ` [${d.icd10}]` : ''} — ${t(`consultations:clinical.assessment.types.${d.type}`)}`).join('\n'));
  return rows;
}

/** Texte de la synthèse, prêt à être édité : un titre en gras par rubrique, puis son contenu ligne par ligne. */
export function summaryToDoc(rows: readonly SummaryRow[]): RichDoc {
  const nodes: RichNode[] = [];
  for (const row of rows) {
    nodes.push({ type: 'paragraph', content: [{ type: 'text', text: row.label, marks: [{ type: 'bold' }] }] });
    for (const line of row.text.split('\n')) if (line.trim() !== '') nodes.push({ type: 'paragraph', content: [{ type: 'text', text: line.trim() }] });
  }
  return docOf(...nodes);
}
