import type { RichDoc } from '../richtext/doc';

/** Cycle de vie d'une consultation. `signed` et `closed` sont verrouillés : seul un addendum tracé est possible. */
export type ClinicalStatus = 'draft' | 'inProgress' | 'awaitingResults' | 'toValidate' | 'signed' | 'closed';

export const SECTIONS = ['general', 'anamnesis', 'history', 'exam', 'assessment', 'plan', 'conclusion'] as const;
export type SectionId = (typeof SECTIONS)[number];

export type InfoSource = 'patient' | 'companion' | 'other';
/** Déclaré par le patient ou observé/confirmé par un professionnel (à ne jamais confondre). */
/** Source de l'information : le patient, un professionnel (observé), l'accompagnant, ou autre (à préciser dans `originDetail`). */
export type Origin = 'declared' | 'observed' | 'companion' | 'other';

export type AntecedentCategory = 'medical' | 'surgical' | 'family' | 'allergy' | 'medication' | 'vaccination' | 'obstetric' | 'lifestyle';
export const ANTECEDENT_CATEGORIES: readonly AntecedentCategory[] = ['medical', 'surgical', 'family', 'allergy', 'medication', 'vaccination', 'obstetric', 'lifestyle'];
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
  /** Précision quand la source est « autre » (ex. « voisin », « ancien dossier »). */
  originDetail?: string;
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
  /** Périmètre brachial (cm) : dépistage de la malnutrition. */
  brachialPerimeter: string;
  /** Périmètre crânien (cm) : surtout chez le nourrisson. */
  headCircumference: string;
}
export const EMPTY_VITALS: Vitals = { systolic: '', diastolic: '', pulse: '', temperature: '', respiratoryRate: '', spo2: '', weight: '', height: '', brachialPerimeter: '', headCircumference: '' };

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
    /** Prise de constantes du triage déjà reprise automatiquement (évite de réécraser une saisie ou de re-remplir ce que le médecin a vidé). */
    triageImportedId?: string;
    generalState: string;
    physical: RichDoc;
  };
  diagnoses: Diagnosis[];
  evaluation: RichDoc;
  plan: {
    synthesis: RichDoc;
    /** La synthèse a déjà été pré-remplie depuis les sections précédentes (évite de la recréer si le médecin la vide). */
    synthesisSeeded?: boolean;
    actions: RichDoc;
    orientation: 'none' | 'ambulatory' | 'service' | 'hospitalization' | 'referral';
    orientationTarget: string;
    followUpDate: string;
  };
  conclusion: {
    decision: string;
    recommendations: RichDoc;
    /** Date et heure (ISO) du prochain rendez-vous programmé ; les anciens brouillons y gardent un simple texte. */
    nextAppointment: string;
    /** Rendez-vous du calendrier créé depuis cette consultation. */
    nextAppointmentId?: string;
  };
  revisions: RevisionEntry[];
  addenda: Addendum[];
  signedAt?: string;
  signedBy?: string;
}
