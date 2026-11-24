/**
 * Impression et export Excel d'un dossier lu sur le serveur. Même principe que le mode local : UN modèle d'éléments alimente le document
 * imprimable et le classeur. Tout vient du contenu relevé par le serveur (sections `null` = droits insuffisants : omises, jamais « vides »).
 */
import type { ReportData } from '../consultations/print';
import { docOf, heading, para } from '../consultations/richtext/doc';
import type { RecordContent } from './record-content-api';
import { sizeLabel } from './record-content-api';
import type { ApiRecord } from './records-api';

export type ApiTranslate = (key: string, options?: Record<string, unknown>) => string;
export interface ApiExportContext { t: ApiTranslate; date: (iso: string) => string; dateTime: (iso: string) => string }

export type ApiCategory = 'consultations' | 'prescriptions' | 'labOrders' | 'admissions' | 'documents';
export interface ApiEntry { category: ApiCategory; ref: string; at: string; date: string; status: string; title: string; lines: string[] }

const ORDER: readonly ApiCategory[] = ['consultations', 'prescriptions', 'labOrders', 'admissions', 'documents'];
const SECTION: Record<ApiCategory, [string, string]> = {
  consultations: ['medicalRecords:detail.consultations', 'Consultations'],
  prescriptions: ['medicalRecords:detail.prescriptions', 'Ordonnances'],
  labOrders: ['medicalRecords:detail.labOrders', 'Analyses'],
  admissions: ['medicalRecords:apiContent.admissions', 'Hospitalisations'],
  documents: ['medicalRecords:detail.documents', 'Documents'],
};

const byRecent = (a: ApiEntry, b: ApiEntry): number => b.at.localeCompare(a.at);

export function collectApiEntries(c: RecordContent, x: ApiExportContext): ApiEntry[] {
  const word = (group: string, v: string): string => (v === '' ? '—' : x.t(`medicalRecords:apiContent.${group}.${v}`, { defaultValue: v }));
  const out: ApiEntry[] = [];

  for (const k of c.consultations ?? []) {
    out.push({
      category: 'consultations', ref: k.id, at: k.at, date: x.dateTime(k.at), status: word('status', k.status),
      title: k.reason !== '' ? x.t(`consultations:reason.${k.reason}`, { defaultValue: k.reason }) : '—',
      lines: k.diagnoses.map((d) => `${d.label}${d.icd10 ? ` (${d.icd10})` : ''}`),
    });
  }
  for (const p of c.prescriptions ?? []) {
    out.push({
      category: 'prescriptions', ref: p.number, at: p.at, date: x.dateTime(p.at), status: word('status', p.status), title: '',
      lines: p.items.map((i) => `${i.label}${i.quantity !== null ? ` × ${i.quantity}` : ''}${[i.dosage, i.frequency, i.duration].some(Boolean) ? ` — ${[i.dosage, i.frequency, i.duration].filter(Boolean).join(', ')}` : ''}`),
    });
  }
  for (const o of c.labOrders ?? []) {
    out.push({
      category: 'labOrders', ref: o.number, at: o.at, date: x.dateTime(o.at), status: word('status', o.status),
      title: o.priority !== '' ? x.t(`laboratory:priority.${o.priority}`, { defaultValue: o.priority }) : '',
      lines: o.tests.map((tt) => `${tt.label}${tt.value ? ` : ${tt.value}${tt.unit ? ` ${tt.unit}` : ''}` : ''}${tt.flag ? ` (${tt.flag})` : ''}`),
    });
  }
  for (const a of c.admissions ?? []) {
    out.push({
      category: 'admissions', ref: a.number, at: a.at, date: x.dateTime(a.at), status: word('status', a.status), title: a.reason,
      lines: [
        ...(a.outcome ? [word('outcome', a.outcome)] : []),
        ...(a.visits ?? []).map((v) => `${x.dateTime(v.at)}${v.diagnosis ? ` — ${v.diagnosis}` : ''}`),
      ],
    });
  }
  for (const d of c.documents ?? []) {
    out.push({ category: 'documents', ref: d.id, at: d.at, date: x.dateTime(d.at), status: '', title: d.type || '—', lines: [[d.mime, sizeLabel(d.sizeBytes)].filter((s) => s !== '' && s !== '—').join(' · ')].filter(Boolean) });
  }
  return out.sort(byRecent);
}

const sectionTitle = (x: ApiExportContext, cat: ApiCategory): string => x.t(SECTION[cat][0], { defaultValue: SECTION[cat][1] });

export function buildApiRecordReport(record: ApiRecord, entries: readonly ApiEntry[], x: ApiExportContext, facility: string, who: string, when: string): ReportData {
  const { t } = x;
  const sections = ORDER.flatMap((cat) => {
    const mine = entries.filter((e) => e.category === cat);
    if (mine.length === 0) return [];
    const nodes = mine.flatMap((e) => [
      heading(`${e.ref} · ${e.date}${e.status ? ` · ${e.status}` : ''}`, 3),
      ...(e.title !== '' ? [para(e.title)] : []),
      ...e.lines.map((l) => para(l)),
    ]);
    return [{ title: `${sectionTitle(x, cat)} (${mine.length})`, doc: docOf(...nodes) }];
  });
  return {
    title: t('medicalRecords:export.reportTitle', { name: record.patientName }),
    facility: facility !== '' ? facility : t('medicalRecords:export.facility'),
    patientLines: [
      `${t('medicalRecords:columns.patient')} : ${record.patientName}${record.patientNumber ? ` (${record.patientNumber})` : ''}`,
      `${t('medicalRecords:columns.number')} : ${record.number}`,
      `${t('medicalRecords:detail.openedAt')} : ${x.date(record.openedAt)}`,
    ],
    practitionerLines: [t('medicalRecords:export.printedBy', { by: who }), t('medicalRecords:export.printedAt', { at: when })],
    sections: sections.length > 0 ? sections : [{ title: t('medicalRecords:export.empty'), text: '' }],
    footer: t('medicalRecords:export.footer'),
  };
}

/** Classeur Excel : une ligne par élément ; le détail tient dans une cellule (une ligne de texte par information). */
export function buildApiRecordRows(entries: readonly ApiEntry[], x: ApiExportContext): string[][] {
  const { t } = x;
  const header = [t('medicalRecords:export.cols.category'), t('medicalRecords:export.cols.reference'), t('medicalRecords:export.cols.date'), t('medicalRecords:export.cols.status'), t('medicalRecords:export.cols.title'), t('medicalRecords:export.cols.detail')];
  const rows = ORDER.flatMap((cat) => entries.filter((e) => e.category === cat).map((e) => [sectionTitle(x, cat), e.ref, e.date, e.status, e.title, e.lines.join('\n')]));
  return [header, ...rows];
}
