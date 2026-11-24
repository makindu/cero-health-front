import type { CatalogItem, ServiceCategory } from '@/core/pricing/types';

/** Catégories gérées par le formulaire de catalogue (médicaments / examens de laboratoire). */
export type ManagedCategory = Extract<ServiceCategory, 'pharmacy' | 'laboratory'>;
/** Catégories dont le catalogue se gère ici : médicaments, examens, et prestations (actes sans stock). */
export type CatalogCategory = ManagedCategory | 'procedure';

export const CODE_PREFIX: Record<CatalogCategory, string> = { pharmacy: 'PHA', laboratory: 'LAB', procedure: 'SRV' };
export const CODE_PATTERN = /^[A-Z0-9-]{2,20}$/;

export type CatalogProblem = 'codeInvalid' | 'codeTaken' | 'labelLength' | 'labelTaken' | 'priceInvalid';

/** « 12,5 » ou « 12.50 » → montant décimal ; null si illisible, nul, négatif ou plus de 2 décimales. */
export function parsePrice(text: string): number | null {
  const clean = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const n = Number(clean);
  return n > 0 ? n : null;
}

/** Prochain code libre : PHA-001, PHA-002… (ignore les codes de forme différente). */
export function suggestCode(category: CatalogCategory, existing: ReadonlyArray<Pick<CatalogItem, 'code'>>): string {
  const prefix = CODE_PREFIX[category];
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const max = existing.reduce((m, i) => Math.max(m, Number(re.exec(i.code)?.[1] ?? 0)), 0);
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

/** Clé de comparaison d'une désignation : sans accents, sans casse, espaces réduits (« Paracétamol » = « paracetamol »). */
export const labelKey = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
/** Recherche tolérante : sans accents ni casse, sur un ou plusieurs champs. Une recherche vide retient tout. */
export const matchesQuery = (query: string, ...fields: ReadonlyArray<string | null | undefined>): boolean => {
  const q = labelKey(query);
  return q === '' || fields.some((f) => labelKey(f ?? '').includes(q));
};
const norm = labelKey;

/** Contrôles d'une saisie ; `selfId` exclut la ligne en cours de modification. */
export function checkCatalogDraft(
  draft: { code: string; label: string; price: string; category: CatalogCategory },
  existing: ReadonlyArray<Pick<CatalogItem, 'id' | 'code' | 'label' | 'category'>>,
  selfId?: string,
): CatalogProblem[] {
  const others = existing.filter((i) => i.id !== selfId);
  const problems: CatalogProblem[] = [];
  const code = draft.code.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) problems.push('codeInvalid');
  else if (others.some((i) => i.code.toUpperCase() === code)) problems.push('codeTaken');
  const label = draft.label.trim();
  if (label.length < 2 || label.length > 120) problems.push('labelLength');
  else if (others.some((i) => i.category === draft.category && norm(i.label) === norm(label))) problems.push('labelTaken');
  if (parsePrice(draft.price) === null) problems.push('priceInvalid');
  return problems;
}
