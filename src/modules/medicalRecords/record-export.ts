/**
 * Impression et export d'un dossier médical : UN modèle (`RecordEntry`) alimente le document imprimable (A4, « Enregistrer en PDF »
 * depuis la boîte d'impression) et le classeur Excel. Tout vient du contenu déjà relevé ; rien n'est inventé ni calculé.
 */
import { buildConsultationReport } from '../consultations/report';
import type { ConsultationDraft } from '../consultations/clinical/model';
import { docOf, docToText, heading, para, sanitizeDoc, type RichDoc, type RichNode } from '../consultations/richtext/doc';
import type { ReportData } from '../consultations/print';
import { toDoc } from '../hospitalization/visit-rules';
import type { MedicalRecord } from './data';
import type { RecordContent } from './record-content';

export type Translate = (key: string, options?: Record<string, unknown>) => string;
export interface ExportContext {
  t: Translate;
  date: (iso: string) => string;
  dateTime: (iso: string) => string;
  /** Brouillons cliniques des consultations, par identifiant de consultation. */
  drafts: Readonly<Record<string, ConsultationDraft | null>>;
}

export type RecordCategory = 'consultations' | 'prescriptions' | 'labOrders' | 'hospitalizations';

export interface RecordEntry {
  category: RecordCategory;
  ref: string;
  /** ISO : sert au tri (le plus récent d'abord). */
  at: string;
  date: string;
  status: string;
  title: string;
  lines: string[];
  /** Contenus rédigés (texte enrichi) : plaintes, examen, compte rendu… */
  docs: { title: string; doc: RichDoc }[];
}

const byRecent = (a: RecordEntry, b: RecordEntry): number => b.at.localeCompare(a.at);

/** Un modèle commun pour tous les éléments du dossier. `null` d'une section = non accessible avec les droits de l'utilisateur (omise). */
export function collectEntries(content: RecordContent, x: ExportContext): RecordEntry[] {
  const { t } = x;
  const out: RecordEntry[] = [];

  for (const c of content.consultations ?? []) {
    let docs: RecordEntry['docs'] = [];
    const draft = x.drafts[c.id];
    if (draft) {
      try {
        docs = buildConsultationReport(draft, { t: t as never, facility: '', patientLines: [], practitionerLines: [], dateTime: x.dateTime, isDemo: false }).sections
          .map((s) => ({ title: s.title, doc: sanitizeDoc(s.doc) }));
      } catch { docs = []; }
    }
    out.push({
      category: 'consultations', ref: c.id, at: c.date, date: x.dateTime(c.date), status: t(`consultations:status.${c.status}`),
      title: `${t(`consultations:reason.${c.reason}`)} — ${c.practitioner}`,
      lines: [`${t('consultations:columns.service')} : ${t(`services.${c.service}`)}`], docs,
    });
  }

  for (const r of content.prescriptions ?? []) {
    out.push({
      category: 'prescriptions', ref: r.number, at: r.prescribedAt, date: x.dateTime(r.prescribedAt), status: t(`prescriptions:status.${r.status}`),
      title: r.prescriber,
      lines: [
        ...r.items.map((i) => `${i.label} × ${i.quantity} — ${[`${t('prescriptions:fields.dosage')} : ${i.dosage}`, `${t('prescriptions:fields.frequency')} : ${i.frequency}`, i.duration && `${t('prescriptions:fields.duration')} : ${i.duration}`, i.instructions && `${t('prescriptions:fields.instructions')} : ${i.instructions}`].filter(Boolean).join(', ')}`),
        ...(r.note ? [r.note] : []),
      ],
      docs: [],
    });
  }

  for (const { order: o } of content.labOrders ?? []) {
    const label = (code: string) => o.tests.find((tt) => tt.code === code)?.label ?? code;
    out.push({
      category: 'labOrders', ref: o.number, at: o.requestedAt, date: x.dateTime(o.requestedAt), status: t(`laboratory:status.${o.status}`),
      title: `${t(`laboratory:priority.${o.priority}`)} — ${o.requestedBy}`,
      lines: [
        ...o.tests.map((tt) => tt.label),
        ...(o.clinicalNote ? [`${t('laboratory:create.note')} : ${o.clinicalNote}`] : []),
        ...o.results.map((r) => `${label(r.code)} : ${r.value} ${r.unit}${r.referenceRange ? ` (réf. ${r.referenceRange})` : ''} — ${t(`laboratory:flag.${r.flag}`)}${r.comment ? ` — ${r.comment}` : ''}`),
      ],
      docs: [],
    });
  }

  for (const { admission: a, visits } of content.admissions ?? []) {
    const docs: RecordEntry['docs'] = [];
    const lines: string[] = [
      `${t('hospitalization:columns.ward')} : ${t(`services.${a.ward}`)}`,
      `${t('hospitalization:detail.attending')} : ${a.attending}`,
      `${t('hospitalization:detail.reasonLabel')} : ${a.reason}`,
      ...(a.discharge ? [`${t('hospitalization:account.discharge')} : ${t(`hospitalization:outcome.${a.discharge.outcome}`)} (${x.dateTime(a.discharge.at)})`] : []),
    ];
    // Visites : de la plus ancienne à la plus récente (ordre de lecture d'un dossier).
    for (const v of [...visits].reverse()) {
      const c = v.clinical;
      if (!c) continue;
      const head = `${x.dateTime(v.visitedAt)} · ${v.by}`;
      if (c.complaints) docs.push({ title: `${head} — ${t('hospitalization:visits.clinical.step1')}`, doc: c.complaints.none ? docOf(para(t('hospitalization:visits.clinical.noComplaint'))) : toDoc(c.complaints.text) });
      if (c.examination) docs.push({ title: `${head} — ${t('hospitalization:visits.clinical.step2')} (${t(`hospitalization:visits.clinical.evolutions.${c.examination.evolution}`)})`, doc: toDoc(c.examination.text) });
      if (c.diagnosis) docs.push({ title: `${head} — ${t('hospitalization:visits.clinical.step3')}`, doc: docOf(para(c.diagnosis)) });
      if (c.plan) {
        const decisions = [c.plan.treatment ? t(`hospitalization:visits.clinical.treatments.${c.plan.treatment}`) : null, c.plan.labs ? t('hospitalization:visits.clinical.planLabs') : null, c.plan.discharge ? t('hospitalization:visits.clinical.planDischarge') : null].filter(Boolean).join(' · ');
        const note = toDoc(c.plan.note);
        docs.push({ title: `${head} — ${t('hospitalization:visits.clinical.step4')}`, doc: docOf(para(decisions), ...(docToText(note) !== '' ? note.content : [])) });
      }
    }
    out.push({
      category: 'hospitalizations', ref: a.number, at: a.admittedAt, date: x.dateTime(a.admittedAt), status: t(`hospitalization:admissionStatus.${a.status}`),
      title: t(`services.${a.ward}`), lines, docs,
    });
  }
  return out.sort(byRecent);
}

const SECTION_TITLE: Record<RecordCategory, string> = {
  consultations: 'medicalRecords:detail.consultations', prescriptions: 'medicalRecords:detail.prescriptions',
  labOrders: 'medicalRecords:detail.labOrders', hospitalizations: 'medicalRecords:content.hospitalizations',
};
const ORDER: readonly RecordCategory[] = ['consultations', 'prescriptions', 'labOrders', 'hospitalizations'];

/** Document imprimable : en-tête patient, puis une section par catégorie, chaque élément avec ses lignes et ses textes rédigés. */
export function buildRecordReport(record: MedicalRecord, entries: readonly RecordEntry[], x: ExportContext, who: string, when: string): ReportData {
  const { t } = x;
  const sections = ORDER.flatMap((cat) => {
    const mine = entries.filter((e) => e.category === cat);
    if (mine.length === 0) return [];
    const nodes: RichNode[] = mine.flatMap((e) => [
      heading(`${e.ref} · ${e.date} · ${e.status}`, 3),
      para(e.title),
      ...e.lines.map((l) => para(l)),
      ...e.docs.flatMap((d) => [para(`▸ ${d.title}`), ...d.doc.content]),
    ]);
    return [{ title: `${t(SECTION_TITLE[cat])} (${mine.length})`, doc: docOf(...nodes) }];
  });
  return {
    title: t('medicalRecords:export.reportTitle', { name: record.patientName }),
    facility: t('medicalRecords:export.facility'),
    patientLines: [
      `${t('medicalRecords:columns.patient')} : ${record.patientName} (${record.patientId})`,
      `${t('medicalRecords:columns.number')} : ${record.id}`,
      `${t('medicalRecords:columns.service')} : ${t(`services.${record.service}`)}`,
      `${t('medicalRecords:detail.openedAt')} : ${x.date(record.openedAt)}`,
    ],
    practitionerLines: [t('medicalRecords:export.printedBy', { by: who }), t('medicalRecords:export.printedAt', { at: when })],
    sections: sections.length > 0 ? sections : [{ title: t('medicalRecords:export.empty'), text: '' }],
    footer: t('medicalRecords:export.footer'),
  };
}

/** Lignes du classeur Excel : une ligne par élément (les textes enrichis sont aplatis en texte brut). */
export function buildRecordRows(entries: readonly RecordEntry[], x: ExportContext): (string)[][] {
  const { t } = x;
  const header = [t('medicalRecords:export.cols.category'), t('medicalRecords:export.cols.reference'), t('medicalRecords:export.cols.date'), t('medicalRecords:export.cols.status'), t('medicalRecords:export.cols.title'), t('medicalRecords:export.cols.detail')];
  const rows = ORDER.flatMap((cat) => entries.filter((e) => e.category === cat).map((e) => [
    t(SECTION_TITLE[cat]), e.ref, e.date, e.status, e.title,
    [...e.lines, ...e.docs.map((d) => `${d.title} : ${docToText(d.doc)}`)].join('\n'),
  ]));
  return [header, ...rows];
}
