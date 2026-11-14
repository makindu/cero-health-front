import type { TFunction } from 'i18next';
import { computeBmi, currentAntecedents } from './clinical/logic';
import type { ConsultationDraft } from './clinical/model';
import { docOf, para, isEmptyDoc, type RichDoc } from './richtext/doc';
import { buildReportHtml, type ReportData, type ReportSection } from './print';

export interface ReportContext {
  t: TFunction<'consultations'>;
  facility: string;
  patientLines: string[];
  practitionerLines: string[];
  dateTime: (iso: string) => string;
  isDemo: boolean;
}

const lines = (...rows: (string | false | undefined)[]): RichDoc => docOf(...rows.filter((r): r is string => Boolean(r)).map((r) => para(r)));

/** Compte rendu imprimable : n'inclut que ce qui a été saisi, jamais de valeur par défaut. */
export function buildConsultationReport(draft: ConsultationDraft, c: ReportContext): ReportData {
  const { t } = c;
  const a = draft.anamnesis;
  const v = draft.exam.vitals;
  const bmi = computeBmi(v.weight, v.height);
  const sections: ReportSection[] = [];
  const add = (title: string, doc: RichDoc) => { if (!isEmptyDoc(doc)) sections.push({ title, doc }); };

  add(t('consultations:clinical.anamnesis.title'), lines(
    a.chiefComplaint && `${t('consultations:clinical.anamnesis.chiefComplaint')} : ${a.chiefComplaint}`,
    `${t('consultations:clinical.anamnesis.source')} : ${t(`consultations:clinical.anamnesis.sources.${a.source}`)}`,
    a.onset && `${t('consultations:clinical.anamnesis.onset')} : ${a.onset}`,
    a.duration && `${t('consultations:clinical.anamnesis.duration')} : ${a.duration}`,
    a.location && `${t('consultations:clinical.anamnesis.location')} : ${a.location}`,
    a.intensity && `${t('consultations:clinical.anamnesis.intensity')} : ${a.intensity}/10`,
    a.associated && `${t('consultations:clinical.anamnesis.associated')} : ${a.associated}`,
    a.aggravating && `${t('consultations:clinical.anamnesis.aggravating')} : ${a.aggravating}`,
    a.relieving && `${t('consultations:clinical.anamnesis.relieving')} : ${a.relieving}`,
    a.priorTreatments && `${t('consultations:clinical.anamnesis.priorTreatments')} : ${a.priorTreatments}`,
  ));
  add(t('consultations:clinical.anamnesis.history'), a.history);
  add(t('consultations:clinical.anamnesis.notes'), a.notes);

  const ants = currentAntecedents(draft.antecedents);
  add(t('consultations:clinical.sections.history'), lines(...ants.map((x) =>
    `${t(`consultations:clinical.history.categories.${x.category}`)} — ${x.label}${x.detail ? ` (${x.detail})` : ''} · ${t(`consultations:clinical.history.state.${x.state}`)} · ${t(`consultations:clinical.history.origin.${x.origin}`)}`)));
  add(t('consultations:clinical.history.notes'), draft.antecedentNotes);

  if (draft.exam.notDone) add(t('consultations:clinical.sections.exam'), lines(`${t('consultations:clinical.exam.notDone')}${draft.exam.notDoneReason ? ` : ${draft.exam.notDoneReason}` : ''}`));
  else {
    const vitalsLine = (['systolic', 'diastolic', 'pulse', 'temperature', 'respiratoryRate', 'spo2', 'weight', 'height'] as const)
      .filter((k) => v[k]).map((k) => `${t(`consultations:clinical.exam.vitals.${k}`)} ${v[k]}`).join(' · ');
    add(t('consultations:clinical.sections.exam'), lines(vitalsLine, bmi !== null && `${t('consultations:clinical.exam.bmi')} ${bmi} kg/m²`, draft.exam.generalState && `${t('consultations:clinical.exam.generalState')} : ${t(`consultations:clinical.exam.states.${draft.exam.generalState}`)}`));
    add(t('consultations:clinical.exam.physical'), draft.exam.physical);
    add(t('consultations:clinical.exam.systems'), draft.exam.systems);
    add(t('consultations:clinical.exam.observations'), draft.exam.observations);
  }

  add(t('consultations:clinical.assessment.title'), lines(...draft.diagnoses.map((d) =>
    `${d.label}${d.icd10 ? ` [${d.icd10}]` : ''} — ${t(`consultations:clinical.assessment.types.${d.type}`)} / ${t(`consultations:clinical.assessment.statuses.${d.status}`)}${d.comment ? ` — ${d.comment}` : ''}`)));
  add(t('consultations:clinical.assessment.evaluation'), draft.evaluation);
  add(t('consultations:clinical.plan.synthesis'), draft.plan.synthesis);
  add(t('consultations:clinical.plan.actions'), draft.plan.actions);
  add(t('consultations:clinical.plan.orientationTitle'), lines(
    draft.plan.orientation !== 'none' && `${t(`consultations:clinical.plan.orientations.${draft.plan.orientation}`)}${draft.plan.orientationTarget ? ` : ${draft.plan.orientationTarget}` : ''}`,
    draft.plan.followUpDate && `${t('consultations:clinical.plan.followUp')} : ${draft.plan.followUpDate}`));
  add(t('consultations:clinical.conclusion.text'), draft.conclusion.text);
  add(t('consultations:clinical.conclusion.decision'), lines(draft.conclusion.decision));
  add(t('consultations:clinical.conclusion.recommendations'), draft.conclusion.recommendations);
  add(t('consultations:clinical.conclusion.nextAppointment'), lines(draft.conclusion.nextAppointment));
  if (draft.addenda.length > 0) {
    sections.push({ title: t('consultations:clinical.addendum.title'), doc: lines(...draft.addenda.map((x) => `${c.dateTime(x.at)} · ${x.by} — ${x.text}`)) });
  }

  return {
    title: t('consultations:clinical.report.title'),
    facility: c.facility,
    patientLines: c.patientLines,
    practitionerLines: c.practitionerLines,
    demoMark: c.isDemo ? t('consultations:clinical.report.demo') : draft.status === 'signed' || draft.status === 'closed' ? undefined : t('consultations:clinical.report.notSigned'),
    signatureLine: draft.signedAt && draft.signedBy ? t('consultations:clinical.report.signedBy', { by: draft.signedBy, when: c.dateTime(draft.signedAt) }) : undefined,
    sections,
    footer: t('consultations:clinical.report.footer'),
  };
}

export const reportToHtml = (draft: ConsultationDraft, c: ReportContext): string => buildReportHtml(buildConsultationReport(draft, c));
