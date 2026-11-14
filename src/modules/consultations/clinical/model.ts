import type { RichDoc } from '../richtext/doc';

/** Cycle de vie d'une consultation. `signed` et `closed` sont verrouillés : seul un addendum tracé est possible. */
export type ClinicalStatus = 'draft' | 'inProgress' | 'awaitingResults' | 'toValidate' | 'signed' | 'closed';

export const SECTIONS = ['general', 'anamnesis', 'history', 'exam', 'assessment', 'plan', 'conclusion'] as const;
export type SectionId = (typeof SECTIONS)[number];

export type InfoSource = 'patient' | 'companion' | 'other';
/** Déclaré par le patient ou observé/confirmé par un professionnel (à ne jamais confondre). */
export type Origin = 'declared' | 'observed';

export type AntecedentCategory = 'medical' | 'surgical' | 'family' | 'allergy' | 'medication' | 'obstetric' | 'lifestyle';
export const ANTECEDENT_CATEGORIES: readonly AntecedentCategory[] = ['medical', 'surgical', 'family', 'allergy', 'medication', 'obstetric', 'lifestyle'];
/** `unknown` = information non connue ; `none` = absence déclarée (« aucune allergie connue »). */
export type AntecedentState = 'active' | 'resolved' | 'unknown' | 'none';

export interface Antecedent {
  id: string;
  category: AntecedentCategory;
  label: string;
  detail?: string;
  /** Allergies : gravité de la réaction. */
  severity?: 'mild' | 'moderate' | 'severe';
  origin: Origin;
  state: AntecedentState;
  recordedAt: string;
  author: string;
  /** Identifiant de l'entrée remplacée : l'ancienne reste dans l'historique, jamais écrasée. */
  supersedes?: string;
}

export interface AntecedentVerification {
  at: string;
  by: string;
  /** Vrai si le médecin a confirmé les antécédents sans changement. */
  unchanged: boolean;
  changedIds: string[];
}

export type DiagnosisType = 'principal' | 'secondary' | 'differential';
export type DiagnosisStatus = 'presumptive' | 'confirmed' | 'ruledOut' | 'investigating';

export interface DiagnosisEvent {
  at: string;
  by: string;
  type: DiagnosisType;
  status: DiagnosisStatus;
  comment: string;
}
export interface Diagnosis {
  id: string;
  label: string;
  icd10?: string;
  type: DiagnosisType;
  status: DiagnosisStatus;
  comment: string;
  createdAt: string;
  author: string;
  /** Historique complet : un diagnostic n'est jamais supprimé, seulement écarté. */
  history: DiagnosisEvent[];
}

export interface Vitals {
  systolic: string;
  diastolic: string;
  pulse: string;
  temperature: string;
  respiratoryRate: string;
  spo2: string;
  weight: string;
  height: string;
}
export const EMPTY_VITALS: Vitals = { systolic: '', diastolic: '', pulse: '', temperature: '', respiratoryRate: '', spo2: '', weight: '', height: '' };

export interface RevisionEntry {
  at: string;
  by: string;
  sections: SectionId[];
}
export interface Addendum {
  id: string;
  at: string;
  by: string;
  text: string;
}

/** Brouillon clinique complet d'une consultation. Sérialisé en JSON (contrat proposé : PUT /health/consultations/{id}). */
export interface ConsultationDraft {
  consultationId: string;
  status: ClinicalStatus;
  anamnesis: {
    chiefComplaint: string;
    source: InfoSource;
    onset: string;
    duration: string;
    location: string;
    intensity: string;
    associated: string;
    aggravating: string;
    relieving: string;
    priorTreatments: string;
    history: RichDoc;
    notes: RichDoc;
  };
  antecedents: Antecedent[];
  verifications: AntecedentVerification[];
  antecedentNotes: RichDoc;
  exam: {
    notDone: boolean;
    notDoneReason: string;
    vitals: Vitals;
    generalState: string;
    physical: RichDoc;
    systems: RichDoc;
    observations: RichDoc;
  };
  diagnoses: Diagnosis[];
  evaluation: RichDoc;
  plan: {
    synthesis: RichDoc;
    actions: RichDoc;
    orientation: 'none' | 'service' | 'hospitalization' | 'referral';
    orientationTarget: string;
    followUpDate: string;
  };
  conclusion: {
    text: RichDoc;
    decision: string;
    recommendations: RichDoc;
    nextAppointment: string;
  };
  revisions: RevisionEntry[];
  addenda: Addendum[];
  signedAt?: string;
  signedBy?: string;
}
