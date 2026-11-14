import type { SectionId } from '../clinical/model';
import { docOf, heading, para, type RichDoc, type RichNode } from './doc';

/**
 * Modèles COMMUNS fournis par l'application : uniquement des TRAMES (titres + zones vides à compléter).
 * Aucun texte clinique n'est prérempli. Les titres sont traduits (clés `clinical.tpl.sec.*`).
 */
export interface BuiltInTemplate {
  id: string;
  /** Section de la consultation à laquelle le modèle est destiné. */
  target: SectionId | 'report';
  sections: readonly string[];
}

export const BUILT_IN_TEMPLATES: readonly BuiltInTemplate[] = [
  { id: 'anamnesis', target: 'anamnesis', sections: ['chiefComplaint', 'onset', 'duration', 'location', 'intensity', 'associated', 'aggravating', 'relieving', 'priorTreatment'] },
  { id: 'illnessHistory', target: 'anamnesis', sections: ['onsetCircumstances', 'evolution', 'previousConsultations', 'currentState'] },
  { id: 'medicalHistory', target: 'history', sections: ['medical', 'surgical', 'family', 'allergies', 'medications', 'obstetric', 'lifestyle'] },
  { id: 'clinicalExam', target: 'exam', sections: ['generalState', 'head', 'cardiovascular', 'respiratory', 'abdomen', 'neurological', 'skin', 'musculoskeletal'] },
  { id: 'observations', target: 'exam', sections: ['observations', 'results'] },
  { id: 'synthesis', target: 'plan', sections: ['summary', 'problems', 'hypotheses'] },
  { id: 'conclusion', target: 'conclusion', sections: ['conclusion', 'decision', 'recommendations', 'followUp'] },
  { id: 'fullReport', target: 'report', sections: ['chiefComplaint', 'illnessHistory', 'medical', 'allergies', 'generalState', 'physicalExam', 'hypotheses', 'plan', 'conclusion', 'followUp'] },
];

/** Construit le document d'un modèle : un titre par rubrique suivi d'un paragraphe vide à compléter. */
export function buildTemplateDoc(template: BuiltInTemplate, label: (sectionKey: string) => string): RichDoc {
  const nodes: RichNode[] = template.sections.flatMap((key) => [heading(label(key), 3), para()]);
  return docOf(...nodes);
}

/** Modèle personnel ou d'établissement géré par l'API (contrat proposé : /health/consultation-templates). */
export interface CustomTemplate {
  id: string;
  name: string;
  target: SectionId | 'report';
  scope: 'personal' | 'facility';
  content: RichDoc;
  author: string;
  updatedAt: string;
}

const FAVORITES_KEY = 'cero-health.template-favorites';

/** Favoris : simple préférence d'affichage conservée sur cet appareil (aucune donnée patient). */
export function readFavorites(): string[] {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export function writeFavorites(ids: readonly string[]): void {
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    /* stockage indisponible : les favoris ne sont simplement pas conservés */
  }
}
export const toggleFavorite = (ids: readonly string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
