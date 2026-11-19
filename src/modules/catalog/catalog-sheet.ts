import type { CatalogItem } from '@/core/pricing/types';
import { CODE_PATTERN, labelKey, parsePrice, suggestCode, type ManagedCategory } from './catalog-rules';

/** Importation du catalogue et des prix depuis un tableau (feuille Excel déjà lue). Tout est analysé AVANT d'écrire. */

export type CatalogImportProblem =
  | 'itemMissing' | 'codeInvalid' | 'codeTaken' | 'codeMismatch' | 'labelLength' | 'labelTaken'
  | 'priceRequired' | 'priceInvalid' | 'activeInvalid' | 'duplicateInFile';
export type CatalogImportFatal = 'missingColumns' | 'empty' | 'tooMany';
export interface CatalogImportRow {
  row: number;
  action: 'create' | 'update' | 'unchanged';
  /** Identifiant de la ligne de catalogue existante (absent pour une création). */
  id?: string;
  code: string;
  label: string;
  /** Montant décimal dans la devise du catalogue. */
  price: number;
  active: boolean;
  previous?: { label: string; price: number; active: boolean };
}
export interface CatalogImportError { row: number; problem: CatalogImportProblem; value?: string }
export interface CatalogImportPlan { rows: CatalogImportRow[]; errors: CatalogImportError[]; fatal?: CatalogImportFatal }

export const MAX_CATALOG_IMPORT_ROWS = 500;

type Existing = Pick<CatalogItem, 'id' | 'code' | 'label' | 'category' | 'active' | 'price'>;

const norm = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADERS = {
  code: ['code', 'codeexamen', 'codeproduit', 'reference', 'ref'],
  label: ['examen', 'designation', 'analyse', 'test', 'nom', 'libelle', 'name', 'label', 'produit', 'medicament'],
  price: ['prix', 'tarif', 'pu', 'prixunitaire', 'price', 'unitprice'],
  active: ['actif', 'active', 'statut', 'status', 'etat'],
} as const;
const YES = new Set(['oui', 'o', 'yes', 'y', '1', 'true', 'vrai', 'actif', 'active', 'ndiyo']);
const NO = new Set(['non', 'n', 'no', '0', 'false', 'faux', 'inactif', 'inactive', 'hapana']);

/** « oui / non / actif / inactif… » → booléen ; undefined si illisible. */
export function parseActive(text: string): boolean | undefined {
  const k = norm(text);
  if (YES.has(k)) return true;
  if (NO.has(k)) return false;
  return undefined;
}

/**
 * Compare chaque ligne du tableau au catalogue de la catégorie : création (nouveau code ou nouvelle désignation), mise à jour du prix /
 * de la désignation / de l'état (ligne retrouvée par son code, sinon par sa désignation) ou « inchangé ». Chaque erreur porte son numéro de ligne Excel.
 */
export function planCatalogImport(table: readonly (readonly string[])[], existing: readonly Existing[], category: ManagedCategory): CatalogImportPlan {
  const none = (fatal: CatalogImportFatal): CatalogImportPlan => ({ rows: [], errors: [], fatal });
  const [head, ...body] = table;
  if (!head) return none('empty');
  const col = (names: readonly string[]): number => head.findIndex((h) => names.includes(norm(h)));
  const c = { code: col(HEADERS.code), label: col(HEADERS.label), price: col(HEADERS.price), active: col(HEADERS.active) };
  if ((c.code < 0 && c.label < 0) || c.price < 0) return none('missingColumns');
  const data = body.map((cells, i) => ({ row: i + 2, cells })).filter((r) => r.cells.some((x) => x.trim() !== ''));
  if (data.length === 0) return none('empty');
  if (data.length > MAX_CATALOG_IMPORT_ROWS) return none('tooMany');

  const byCode = new Map(existing.map((i) => [i.code.toUpperCase(), i]));
  const byLabel = new Map(existing.filter((i) => i.category === category).map((i) => [labelKey(i.label), i]));
  const touched = new Set<string>(); // lignes existantes déjà visées dans le fichier
  const newLabels = new Set<string>();
  const newCodes = new Set<string>();
  const rows: CatalogImportRow[] = [];
  const errors: CatalogImportError[] = [];

  for (const { row, cells } of data) {
    const at = (i: number): string => (i >= 0 ? (cells[i] ?? '').trim() : '');
    const codeText = at(c.code).toUpperCase();
    const labelText = at(c.label).replace(/\s+/g, ' ');
    const priceText = at(c.price);
    const activeText = at(c.active);

    let found: Existing | undefined = codeText ? byCode.get(codeText) : undefined;
    if (found && found.category !== category) { errors.push({ row, problem: 'codeTaken', value: codeText }); continue; }
    if (!found && labelText) {
      const sameLabel = byLabel.get(labelKey(labelText));
      if (sameLabel && codeText) { errors.push({ row, problem: 'codeMismatch', value: codeText }); continue; }
      found = sameLabel;
    }
    if (activeText && parseActive(activeText) === undefined) { errors.push({ row, problem: 'activeInvalid', value: activeText }); continue; }

    let price: number | null = null;
    if (priceText) {
      price = parsePrice(priceText);
      if (price === null) { errors.push({ row, problem: 'priceInvalid', value: priceText }); continue; }
    }

    if (found) {
      if (touched.has(found.id)) { errors.push({ row, problem: 'duplicateInFile', value: found.code }); continue; }
      const label = labelText || found.label;
      if (label.length < 2 || label.length > 120) { errors.push({ row, problem: 'labelLength', value: label }); continue; }
      if (labelKey(label) !== labelKey(found.label)) {
        const owner = byLabel.get(labelKey(label));
        if (owner && owner.id !== found.id) { errors.push({ row, problem: 'labelTaken', value: label }); continue; }
      }
      touched.add(found.id);
      const nextPrice = price ?? found.price.minor / 100;
      const nextActive = activeText ? (parseActive(activeText) as boolean) : found.active;
      const previous = { label: found.label, price: found.price.minor / 100, active: found.active };
      const same = label === found.label && nextPrice === previous.price && nextActive === previous.active;
      rows.push({ row, action: same ? 'unchanged' : 'update', id: found.id, code: found.code, label, price: nextPrice, active: nextActive, previous });
      continue;
    }

    // Création
    if (!labelText) { errors.push({ row, problem: 'itemMissing', value: codeText }); continue; }
    if (labelText.length < 2 || labelText.length > 120) { errors.push({ row, problem: 'labelLength', value: labelText }); continue; }
    if (price === null) { errors.push({ row, problem: 'priceRequired', value: labelText }); continue; }
    if (newLabels.has(labelKey(labelText))) { errors.push({ row, problem: 'duplicateInFile', value: labelText }); continue; }
    if (codeText && (!CODE_PATTERN.test(codeText))) { errors.push({ row, problem: 'codeInvalid', value: codeText }); continue; }
    if (codeText && newCodes.has(codeText)) { errors.push({ row, problem: 'duplicateInFile', value: codeText }); continue; }
    const code = codeText || suggestCode(category, [...existing, ...[...newCodes].map((x) => ({ code: x }))]);
    newLabels.add(labelKey(labelText));
    newCodes.add(code);
    rows.push({ row, action: 'create', code, label: labelText, price, active: activeText ? (parseActive(activeText) as boolean) : true });
  }
  return { rows, errors };
}
