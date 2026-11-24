import type { DocBlock, DocLetterhead } from '../_shared/export/document-model';
import type { ClinicalText, EnterpriseInfo } from './record-content-api';
import { WHOLE_RECORD, type Period, type SectionKey, type Synthesis } from './record-synthesis';

export type Translate = (key: string, options?: Record<string, unknown>) => string;
export interface SynthesisDocContext {
  t: Translate;
  date: (iso: string) => string;
  patientName: string;
  patientNumber: string;
  recordNumber: string;
  generatedOn: string;
  period?: Period;
  /** Identité du patient, telle que le serveur la connaît (facultatif). */
  sex?: string;
  birthDate?: string;
  /** Jour de la génération (AAAA-MM-JJ), pour calculer l'âge. */
  today?: string;
  /** Médecin qui demande la synthèse. */
  author?: string;
}

const SECTION_FALLBACK: Record<SectionKey, string> = {
  consultations: 'consultations', prescriptions: 'ordonnances', labOrders: 'analyses', admissions: 'hospitalisations', documents: 'documents',
};

/** Durée lisible : « 8 mois », « 10 ans ». Rien en dessous d'un mois. */
export function spanText(months: number, t: Translate): string {
  if (months < 1) return '';
  if (months < 24) return t('medicalRecords:synthesis.months', { defaultValue: '{{n}} mois', n: months });
  return t('medicalRecords:synthesis.years', { defaultValue: '{{n}} ans', n: Math.floor(months / 12) });
}

/** Âge lisible à partir de la date de naissance : « 34 ans », « 8 mois ». Vide si la date est absente ou incohérente. */
export function ageText(birth: string, today: string, t: Translate): string {
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(birth);
  const n = /^(\d{4})-(\d{2})-(\d{2})/.exec(today);
  if (!b || !n) return '';
  let months = (Number(n[1]) - Number(b[1])) * 12 + (Number(n[2]) - Number(b[2]));
  if (Number(n[3]) < Number(b[3])) months -= 1;
  if (months < 0) return '';
  return months < 1 ? t('medicalRecords:synthesis.newborn', { defaultValue: 'moins d’un mois' }) : spanText(months, t);
}

/** En-tête de l'établissement : nom, puis adresse, contacts et identifiants légaux (les champs vides sont simplement omis). */
export function letterheadFrom(e: EnterpriseInfo | null | undefined, fallbackName: string, t: Translate): DocLetterhead {
  const L = (key: string, fallback: string): string => t(`medicalRecords:synthesis.${key}`, { defaultValue: fallback });
  const join = (parts: string[]): string => parts.filter((x) => x !== '').join('  ·  ');
  const v = (x: string | undefined): string => (x ?? '').trim();
  return {
    name: v(e?.name) || fallbackName,
    lines: [
      v(e?.address),
      join([v(e?.phone) ? `${L('phone', 'Tél.')} ${v(e?.phone)}` : '', v(e?.mail) ? `${L('mail', 'E-mail')} ${v(e?.mail)}` : '', v(e?.website)]),
      join([v(e?.rccm) ? `RCCM ${v(e?.rccm)}` : '', v(e?.idnat) ? `ID NAT ${v(e?.idnat)}` : '', v(e?.nif) ? `NIF ${v(e?.nif)}` : '', v(e?.authorization) ? `${L('authorization', 'Autorisation')} ${v(e?.authorization)}` : '']),
    ].filter((x) => x !== ''),
  };
}

/** Met la synthèse en tableaux et en phrases courtes. Aucune consultation n'est recopiée : chaque ligne résume un groupe. */
export function buildSynthesisBlocks(s: Synthesis, c: SynthesisDocContext): DocBlock[] {
  const T = (key: string, fallback: string, vars: Record<string, unknown> = {}): string => c.t(`medicalRecords:synthesis.${key}`, { defaultValue: fallback, ...vars });
  const d = c.date;
  /** Singulier / pluriel : « 1 consultation », « 42 consultations ». */
  const TN = (key: string, n: number, one: string, other: string, vars: Record<string, unknown> = {}): string =>
    c.t(`medicalRecords:synthesis.${key}`, { count: n, n, defaultValue: other, defaultValue_one: one, defaultValue_other: other, ...vars });
  const range = (a: string, b: string): string => (a === b || b === '' ? T('on', 'le {{date}}', { date: d(a) }) : T('fromTo', 'du {{from}} au {{to}}', { from: d(a), to: d(b) }));
  const out: DocBlock[] = [];

  out.push({ kind: 'title', text: T('title', 'Synthèse du dossier médical') });

  const asked = c.period ?? WHOLE_RECORD;
  const facts: { label: string; value: string }[] = [{ label: T('patient', 'Patient'), value: c.patientName || '—' }, { label: T('record', 'Dossier'), value: c.recordNumber || '—' }];
  if (c.patientNumber) facts.push({ label: T('patientNumber', 'N° patient'), value: c.patientNumber });
  const sex = (c.sex ?? '').trim();
  if (sex !== '') facts.push({ label: T('sex', 'Sexe'), value: /^(m|male|masculin|homme)$/i.test(sex) ? T('male', 'Masculin') : /^(f|female|féminin|feminin|femme)$/i.test(sex) ? T('female', 'Féminin') : sex });
  if ((c.birthDate ?? '') !== '') {
    const age = c.today ? ageText(c.birthDate as string, c.today, c.t) : '';
    facts.push({ label: T('birth', 'Naissance'), value: `${d(c.birthDate as string)}${age ? ` (${age})` : ''}` });
  }
  if (s.first !== '') {
    const span = spanText(s.spanMonths, c.t);
    facts.push({ label: T('covered', 'Période couverte'), value: `${range(s.first, s.last)}${span ? ` (${span})` : ''}` });
  } else if (asked.from !== '' || asked.to !== '') {
    facts.push({ label: T('asked', 'Période demandée'), value: `${asked.from !== '' ? d(asked.from) : '…'} → ${asked.to !== '' ? d(asked.to) : '…'}` });
  }
  facts.push({ label: T('generatedLabel', 'Établie le'), value: c.generatedOn });
  if ((c.author ?? '').trim() !== '') facts.push({ label: T('author', 'Établie par'), value: (c.author as string).trim() });
  out.push({ kind: 'facts', rows: facts });
  out.push({ kind: 'note', text: T('disclaimer', 'Synthèse générée automatiquement à partir des données enregistrées dans le dossier. Elle regroupe et résume : elle ne remplace pas la lecture des consultations. Le médecin doit la relire, la corriger et la valider avant tout usage.') });

  if (s.empty) {
    out.push({ kind: 'paragraph', text: T('empty', 'Aucune consultation, hospitalisation, ordonnance ni analyse dans la période choisie.') });
  } else {
    const stats = [
      s.consultations > 0 ? { value: String(s.consultations), label: TN('statConsultations', s.consultations, 'consultation', 'consultations') } : null,
      s.hospitalizations > 0 ? { value: String(s.hospitalizations), label: TN('statStays', s.hospitalizations, 'hospitalisation', 'hospitalisations') } : null,
      s.prescriptions > 0 ? { value: String(s.prescriptions), label: TN('statPrescriptions', s.prescriptions, 'ordonnance', 'ordonnances') } : null,
      s.labOrders > 0 ? { value: String(s.labOrders), label: TN('statLabOrders', s.labOrders, 'demande d’analyses', 'demandes d’analyses') } : null,
    ].filter((x): x is { value: string; label: string } => x !== null);
    if (s.documents > 0 && stats.length < 4) stats.push({ value: String(s.documents), label: TN('statDocuments', s.documents, 'document', 'documents') });
    const span = spanText(s.spanMonths, c.t);
    if (span !== '' && stats.length < 4) stats.push({ value: span, label: T('statSpan', 'de suivi') });
    out.push({ kind: 'heading', text: T('overview', 'Vue d’ensemble') });
    if (stats.length > 0) out.push({ kind: 'stats', items: stats });
    if (s.byYear.length > 1) {
      out.push({ kind: 'paragraph', text: T('byYear', 'Consultations par année') });
      for (let i = 0; i < s.byYear.length; i += 10) {
        const chunk = s.byYear.slice(i, i + 10);
        out.push({ kind: 'table', head: chunk.map((y) => y.year), rows: [chunk.map((y) => String(y.count))], align: chunk.map(() => 'right' as const) });
      }
    }

    if (s.reasons.length > 0) {
      out.push({ kind: 'heading', text: T('reasons', 'Motifs de consultation') });
      out.push({ kind: 'table', head: [T('colReason', 'Motif'), T('colTimes', 'Fois'), T('colFirst', 'Première'), T('colLast', 'Dernière')], widths: [3.2, 0.8, 1.3, 1.3], align: ['left', 'right', 'left', 'left'],
        rows: s.reasons.map((r) => [c.t(`consultations:reason.${r.label}`, { defaultValue: r.label }), String(r.count), d(r.first), d(r.last)]) });
    }
    if (s.diagnoses.length > 0 || s.ruledOut.length > 0) {
      out.push({ kind: 'heading', text: T('diagnoses', 'Diagnostics') });
      if (s.diagnoses.length > 0) {
        out.push({ kind: 'table', head: [T('colDiagnosis', 'Diagnostic'), T('colIcd', 'CIM-10'), T('colConsultations', 'Consultations'), T('colFirst', 'Première'), T('colLast', 'Dernière')], widths: [3.2, 0.9, 1.3, 1.3, 1.3], align: ['left', 'left', 'right', 'left', 'left'],
          rows: s.diagnoses.map((g) => [g.label, g.icd10, String(g.count), d(g.first), d(g.last)]) });
      }
      if (s.ruledOut.length > 0) out.push({ kind: 'paragraph', text: `${T('ruledOut', 'Diagnostics écartés')} : ${s.ruledOut.join(', ')}.` });
    }
    if (s.treatments.length > 0) {
      out.push({ kind: 'heading', text: T('treatments', 'Traitements prescrits') });
      out.push({ kind: 'table', head: [T('colDrug', 'Médicament'), T('colPrescriptions', 'Prescriptions'), T('colLastDate', 'Dernière'), T('colPosology', 'Posologie')], widths: [3, 1.2, 1.3, 2.6], align: ['left', 'right', 'left', 'left'],
        rows: s.treatments.map((g) => [g.label, String(g.count), d(g.last), g.posology]) });
    }
    if (s.labs.length > 0) {
      out.push({ kind: 'heading', text: T('labs', 'Résultats d’analyses') });
      out.push({ kind: 'table', head: [T('colExam', 'Examen'), T('colResults', 'Résultats'), T('colLastResult', 'Dernier résultat'), T('colLastDate', 'Dernière'), T('colAbnormal', 'Anormaux')], widths: [2.8, 1, 1.9, 1.3, 1], align: ['left', 'right', 'left', 'left', 'right'],
        rows: s.labs.map((g) => {
          const value = `${g.lastValue}${g.lastUnit ? ` ${g.lastUnit}` : ''}`;
          return [g.label, String(g.count), g.lastFlag === 'abnormal' ? `${value} (${T('abnormal', 'anormal')})` : value, d(g.last), String(g.abnormal)];
        }) });
    }
    if (s.stays.length > 0) {
      out.push({ kind: 'heading', text: T('stays', 'Hospitalisations') });
      out.push({ kind: 'table', head: [T('colStay', 'Séjour'), T('colAdmitted', 'Admission'), T('colStayReason', 'Motif'), T('colOutcome', 'Issue'), T('colDiagnoses', 'Diagnostics')], widths: [1.4, 1.2, 2.2, 1.2, 2.4],
        rows: s.stays.map((g) => [g.number, d(g.at), g.reason, g.outcome ? c.t(`medicalRecords:apiContent.outcome.${g.outcome}`, { defaultValue: g.outcome }) : '', g.diagnoses.join(', ')]) });
    }
    if (s.notes.length > 0) {
      out.push({ kind: 'heading', text: T('notesTitle', 'Dernières consultations : texte du médecin') });
      out.push({ kind: 'note', text: T('notesHint', 'Texte rédigé par le médecin lors des dernières consultations validées, repris tel quel (abrégé s’il est très long).') });
      const label: [keyof ClinicalText, string, string][] = [
        ['complaint', 'noteLabel.complaint', 'Motif et plaintes'], ['history', 'noteLabel.history', 'Histoire de la maladie'], ['exam', 'noteLabel.exam', 'Examen clinique'],
        ['evaluation', 'noteLabel.evaluation', 'Évaluation'], ['plan', 'noteLabel.plan', 'Conduite à tenir'], ['conclusion', 'noteLabel.conclusion', 'Conclusion'],
      ];
      for (const n of s.notes) {
        const reason = n.reason !== '' ? c.t(`consultations:reason.${n.reason}`, { defaultValue: n.reason }) : '';
        out.push({ kind: 'paragraph', text: `${d(n.at)}${reason !== '' ? ` · ${reason}` : ''}` });
        out.push({ kind: 'bullets', items: label.filter(([k]) => n.clinical[k] !== '').map(([k, key, fb]) => `${T(key, fb)} : ${n.clinical[k].replace(/\s*\n\s*/g, ' / ')}`) });
      }
    }
  }

  const attention: string[] = [];
  if (s.unfinished > 0) attention.push(TN('unfinished', s.unfinished, '{{n}} consultation non signée : son contenu n’est peut-être pas définitif.', '{{n}} consultations non signées : leur contenu n’est peut-être pas définitif.'));
  if (s.hidden.length > 0) attention.push(T('hidden', 'Non incluses (droits d’accès insuffisants) : {{list}}.', { list: s.hidden.map((k) => T(`section.${k}`, SECTION_FALLBACK[k])).join(', ') }));
  if (s.capped.length > 0) attention.push(T('capped', 'Seuls les éléments les plus récents ont été lus pour : {{list}}. Les plus anciens peuvent manquer.', { list: s.capped.map((k) => T(`section.${k}`, SECTION_FALLBACK[k])).join(', ') }));
  if (attention.length > 0) {
    out.push({ kind: 'heading', text: T('attention', 'Points d’attention') });
    out.push({ kind: 'bullets', items: attention });
  }

  out.push({ kind: 'heading', text: T('doctorComment', 'Commentaire du médecin') });
  out.push({ kind: 'writeIn', lines: 4 });
  out.push({ kind: 'signature', labels: [T('signDoctor', 'Nom et signature du médecin'), T('signStamp', 'Cachet de l’établissement')] });
  return out;
}

/** Texte brut d'un bloc (pour les tests et l'aperçu). */
export function textOf(b: DocBlock): string {
  switch (b.kind) {
    case 'bullets': return b.items.join('\n');
    case 'facts': return b.rows.map((r) => `${r.label} : ${r.value}`).join('\n');
    case 'stats': return b.items.map((i) => `${i.value} ${i.label}`).join('\n');
    case 'table': return [b.head.join(' | '), ...b.rows.map((r) => r.join(' | '))].join('\n');
    case 'signature': return b.labels.join('\n');
    case 'writeIn': return '';
    default: return b.text;
  }
}
