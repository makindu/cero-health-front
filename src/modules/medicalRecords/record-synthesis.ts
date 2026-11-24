import type { ClinicalText, RecordContent } from './record-content-api';

/**
 * Synthèse d'un dossier médical : regroupe au lieu de répéter. Dix ans de consultations deviennent des motifs, des diagnostics, des traitements
 * et des résultats d'analyses comptés et datés, plus la liste courte des hospitalisations. Tout vient des données enregistrées : rien n'est interprété
 * ni inventé, et le médecin relit et corrige le document avant usage.
 */

export interface Period { from: string; to: string }
export const WHOLE_RECORD: Period = { from: '', to: '' };

export interface Tally { label: string; count: number; first: string; last: string }
export interface DiagnosisTally extends Tally { icd10: string }
export interface TreatmentTally { label: string; count: number; last: string; posology: string }
export interface LabTally { label: string; count: number; abnormal: number; last: string; lastValue: string; lastUnit: string; lastFlag: string }
/** Une consultation validée, avec ce que le médecin a écrit. */
export interface ConsultationNote { at: string; reason: string; clinical: ClinicalText }
export const NOTES_MAX = 5;
export interface StayLine { number: string; at: string; reason: string; outcome: string; diagnoses: string[] }
export type SectionKey = 'consultations' | 'prescriptions' | 'labOrders' | 'admissions' | 'documents';

export interface Synthesis {
  first: string;
  last: string;
  spanMonths: number;
  consultations: number;
  hospitalizations: number;
  prescriptions: number;
  labOrders: number;
  documents: number;
  byYear: { year: string; count: number }[];
  reasons: Tally[];
  diagnoses: DiagnosisTally[];
  ruledOut: string[];
  treatments: TreatmentTally[];
  labs: LabTally[];
  stays: StayLine[];
  /** Les dernières consultations validées dont le texte est disponible (les plus récentes d'abord). */
  notes: ConsultationNote[];
  /** Consultations pas encore signées ni clôturées : leur contenu n'est peut-être pas définitif. */
  unfinished: number;
  /** Sections que les droits de la personne ne couvrent pas (jamais présentées comme « vides »). */
  hidden: SectionKey[];
  /** Sections arrêtées au plafond du serveur : les plus anciennes manquent peut-être. */
  capped: SectionKey[];
  empty: boolean;
}

const FINISHED = new Set(['signed', 'closed']);

const dayOf = (iso: string): string => iso.slice(0, 10);
const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** Libellés distincts (accents et casse ignorés), la première graphie rencontrée est gardée. */
const distinct = (labels: readonly string[]): string[] => {
  const seen = new Map<string, string>();
  for (const l of labels) { const k = norm(l); if (k !== '' && !seen.has(k)) seen.set(k, l); }
  return [...seen.values()];
};
const newest = (a: string, b: string): string => (a >= b ? a : b);
const oldest = (a: string, b: string): string => (a === '' ? b : b === '' ? a : a <= b ? a : b);

/** Une date hors de la période demandée est écartée ; une date absente n'est gardée que sans période. */
export function inPeriod(iso: string, p: Period): boolean {
  const d = dayOf(iso);
  if (d === '') return p.from === '' && p.to === '';
  return (p.from === '' || d >= p.from) && (p.to === '' || d <= p.to);
}

/** Période incohérente : la fin précède le début. */
export const periodInvalid = (p: Period): boolean => p.from !== '' && p.to !== '' && p.to < p.from;

/** Mois entiers entre deux dates (0 si moins d'un mois ou si une date manque). */
export function monthsBetween(first: string, last: string): number {
  if (first.length < 7 || last.length < 7) return 0;
  const m = (Number(last.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + (Number(last.slice(5, 7)) - Number(first.slice(5, 7)));
  return Number.isFinite(m) && m > 0 ? m : 0;
}

function tally<T>(items: readonly T[], keyOf: (x: T) => string, labelOf: (x: T) => string, atOf: (x: T) => string): Tally[] {
  const map = new Map<string, Tally>();
  for (const it of items) {
    const key = norm(keyOf(it));
    if (key === '') continue;
    const at = atOf(it);
    const cur = map.get(key);
    if (!cur) { map.set(key, { label: labelOf(it), count: 1, first: at, last: at }); continue; }
    cur.count += 1;
    cur.first = oldest(cur.first, at);
    if (at >= cur.last) { cur.last = at; cur.label = labelOf(it) || cur.label; }
  }
  return [...map.values()];
}
const byCountThenRecent = <T extends { count: number; last: string; label: string }>(a: T, b: T): number =>
  b.count - a.count || b.last.localeCompare(a.last) || a.label.localeCompare(b.label);

export function synthesize(content: RecordContent, period: Period = WHOLE_RECORD): Synthesis {
  const hidden: SectionKey[] = [];
  const capped: SectionKey[] = [];
  const section = <T,>(key: SectionKey, rows: readonly T[] | null): readonly T[] => {
    if (rows === null) { hidden.push(key); return []; }
    if (content.cap > 0 && rows.length >= content.cap) capped.push(key);
    return rows;
  };
  const consultations = section('consultations', content.consultations).filter((c) => inPeriod(c.at, period));
  const prescriptions = section('prescriptions', content.prescriptions).filter((p) => p.status !== 'cancelled' && inPeriod(p.at, period));
  const labOrders = section('labOrders', content.labOrders).filter((o) => o.status !== 'cancelled' && inPeriod(o.at, period));
  const admissions = section('admissions', content.admissions).filter((a) => a.status !== 'cancelled' && inPeriod(a.at, period));
  const documents = section('documents', content.documents).filter((d) => inPeriod(d.at, period));

  // Diagnostics : une fois par consultation, même si le même libellé y figure deux fois. Les diagnostics écartés ne sont jamais comptés comme des maladies.
  const diagRows: { label: string; icd10: string; at: string }[] = [];
  const ruledOut = new Map<string, string>();
  for (const c of consultations) {
    const seen = new Set<string>();
    for (const d of c.diagnoses) {
      const key = norm(d.label);
      if (key === '') continue;
      if (d.status === 'ruledOut') { if (!ruledOut.has(key)) ruledOut.set(key, d.label); continue; }
      if (seen.has(key)) continue;
      seen.add(key);
      diagRows.push({ label: d.label, icd10: d.icd10, at: c.at });
    }
  }
  const icdOf = new Map<string, string>();
  for (const r of diagRows) if (r.icd10 !== '') icdOf.set(norm(r.label), r.icd10);
  const diagnoses: DiagnosisTally[] = tally(diagRows, (r) => r.label, (r) => r.label, (r) => r.at)
    .map((t) => ({ ...t, icd10: icdOf.get(norm(t.label)) ?? '' })).sort(byCountThenRecent);
  // Un diagnostic écarté une fois mais retenu ailleurs reste retenu : on ne l'affiche pas parmi les écartés.
  const kept = new Set(diagnoses.map((d) => norm(d.label)));
  const ruledOutLabels = [...ruledOut.entries()].filter(([k]) => !kept.has(k)).map(([, v]) => v).sort((a, b) => a.localeCompare(b));

  // Traitements : une ligne par médicament, avec le nombre d'ordonnances et la dernière posologie.
  const rxRows: { label: string; at: string; posology: string; rx: string }[] = [];
  for (const p of prescriptions) {
    const seen = new Set<string>();
    for (const i of p.items) {
      const key = norm(i.label);
      if (key === '' || seen.has(key)) continue;
      seen.add(key);
      rxRows.push({ label: i.label, at: p.at, rx: p.id, posology: [i.dosage, i.frequency, i.duration].filter((x) => x !== '').join(' · ') });
    }
  }
  const lastPosology = new Map<string, { at: string; posology: string }>();
  for (const r of rxRows) {
    const k = norm(r.label);
    const cur = lastPosology.get(k);
    if (!cur || r.at >= cur.at) lastPosology.set(k, { at: r.at, posology: r.posology });
  }
  const treatments: TreatmentTally[] = tally(rxRows, (r) => r.label, (r) => r.label, (r) => r.at)
    .map((t) => ({ label: t.label, count: t.count, last: t.last, posology: lastPosology.get(norm(t.label))?.posology ?? '' })).sort(byCountThenRecent);

  // Analyses : seuls les résultats saisis comptent ; le dernier résultat est celui de la demande la plus récente.
  const labRows: { label: string; at: string; value: string; unit: string; flag: string }[] = [];
  for (const o of labOrders) for (const t of o.tests) if (t.value !== '') labRows.push({ label: t.label, at: o.at, value: t.value, unit: t.unit, flag: t.flag });
  const lastLab = new Map<string, { at: string; value: string; unit: string; flag: string }>();
  const abnormal = new Map<string, number>();
  for (const r of labRows) {
    const k = norm(r.label);
    const cur = lastLab.get(k);
    if (!cur || r.at >= cur.at) lastLab.set(k, { at: r.at, value: r.value, unit: r.unit, flag: r.flag });
    if (r.flag === 'abnormal') abnormal.set(k, (abnormal.get(k) ?? 0) + 1);
  }
  const labs: LabTally[] = tally(labRows, (r) => r.label, (r) => r.label, (r) => r.at).map((t) => {
    const k = norm(t.label);
    const l = lastLab.get(k);
    return { label: t.label, count: t.count, abnormal: abnormal.get(k) ?? 0, last: t.last, lastValue: l?.value ?? '', lastUnit: l?.unit ?? '', lastFlag: l?.flag ?? '' };
  }).sort((a, b) => b.abnormal - a.abnormal || b.count - a.count || b.last.localeCompare(a.last) || a.label.localeCompare(b.label));

  const stays: StayLine[] = admissions.map((a) => ({
    number: a.number, at: a.at, reason: a.reason, outcome: a.outcome,
    diagnoses: distinct((a.visits ?? []).map((v) => v.diagnosis)),
  })).sort((a, b) => b.at.localeCompare(a.at));

  const reasons = tally(consultations, (c) => c.reason, (c) => c.reason, (c) => c.at).sort(byCountThenRecent);

  const years = new Map<string, number>();
  for (const c of consultations) { const y = c.at.slice(0, 4); if (y !== '') years.set(y, (years.get(y) ?? 0) + 1); }
  const byYear = [...years.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => a.year.localeCompare(b.year));

  const dates = [...consultations.map((c) => c.at), ...admissions.map((a) => a.at), ...prescriptions.map((p) => p.at), ...labOrders.map((o) => o.at)].map(dayOf).filter((d) => d !== '');
  const first = dates.reduce((a, b) => oldest(a, b), '');
  const last = dates.reduce((a, b) => newest(a, b), '');
  const notes: ConsultationNote[] = consultations
    .filter((c) => c.clinical)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, NOTES_MAX)
    .map((c) => ({ at: c.at, reason: c.reason, clinical: c.clinical as ClinicalText }));
  const empty = consultations.length + admissions.length + prescriptions.length + labOrders.length + documents.length === 0;

  return {
    first, last, spanMonths: monthsBetween(first, last),
    consultations: consultations.length, hospitalizations: admissions.length, prescriptions: prescriptions.length, labOrders: labOrders.length, documents: documents.length,
    byYear, reasons, diagnoses, ruledOut: ruledOutLabels, treatments, labs, stays, notes,
    unfinished: consultations.filter((c) => !FINISHED.has(c.status)).length,
    hidden, capped, empty,
  };
}
