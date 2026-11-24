/** Règles de saisie de la file « à valider », sans interface : testables seules. Le serveur reste l'autorité. */
export const DRUG_NAME = { min: 2, max: 255 } as const;
export const EXAM_LABEL = { min: 1, max: 150 } as const;

/** Espaces superflus retirés (début, fin, doubles) : « amoxicilline   500 » → « amoxicilline 500 ». */
export const tidy = (s: string): string => s.replace(/\s+/g, ' ').trim();

export interface ReviewEdit { name: string; catalogItemId: string }

/** Corps de validation d'un médicament. Le nom n'est envoyé que s'il a vraiment changé ; null = saisie invalide. */
export function drugPatch(original: { name: string; catalogItemId: string }, edit: ReviewEdit): { name?: string; needs_review: false; catalog_item_id?: number | null } | null {
  const name = tidy(edit.name);
  if (name.length < DRUG_NAME.min || name.length > DRUG_NAME.max) return null;
  const body: { name?: string; needs_review: false; catalog_item_id?: number | null } = { needs_review: false };
  if (name !== original.name) body.name = name;
  if (edit.catalogItemId !== original.catalogItemId) body.catalog_item_id = edit.catalogItemId === '' ? null : Number(edit.catalogItemId);
  return body;
}

/** Corps de validation d'un examen (même principe). */
export function examPatch(original: { label: string; catalogItemId: string }, edit: ReviewEdit): { label?: string; needs_review: false; catalog_item_id?: number | null } | null {
  const label = tidy(edit.name);
  if (label.length < EXAM_LABEL.min || label.length > EXAM_LABEL.max) return null;
  const body: { label?: string; needs_review: false; catalog_item_id?: number | null } = { needs_review: false };
  if (label !== original.label) body.label = label;
  if (edit.catalogItemId !== original.catalogItemId) body.catalog_item_id = edit.catalogItemId === '' ? null : Number(edit.catalogItemId);
  return body;
}
