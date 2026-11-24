import type { CatalogItem } from '@/core/pricing/types';
import { CODE_PATTERN, labelKey, parsePrice, suggestCode } from '../catalog/catalog-rules';
import { parseActive } from '../catalog/catalog-sheet';
import { holdsStock } from './packaging';

/**
 * Importation des médicaments, de leurs prix et de leurs unités de vente depuis un tableau (feuille Excel déjà lue).
 * Une ligne = un produit : son unité principale (boîte) avec son prix, son contenu en unités de base (100 comprimés),
 * puis jusqu'à 4 autres unités de vente (plaquette, comprimé…) avec leur contenu et leur prix. Les lots ne sont pas importés.
 * Les règles sont celles du serveur (qui les revérifie) : tout est analysé AVANT d'écrire.
 */

export type PharmacyImportProblem =
  | 'itemMissing' | 'codeInvalid' | 'codeTaken' | 'codeMismatch' | 'labelLength' | 'labelTaken' | 'priceRequired' | 'priceInvalid'
  | 'activeInvalid' | 'duplicateInFile' | 'perPackInvalid' | 'packagingLabelsRequired' | 'packagingLabelsDifferent'
  | 'extrasNeedPackaging' | 'extraInvalid' | 'extraPriceInvalid' | 'extraDuplicate';
export type PharmacyImportFatal = 'missingColumns' | 'empty' | 'tooMany';

export interface ImportExtra { label: string; perUnit: number; /** montant décimal */ price: number }
export interface PharmacyImportRow {
  row: number;
  action: 'create' | 'update' | 'unchanged';
  code: string;
  label: string;
  /** Montant décimal de l'unité principale. */
  price: number;
  active: boolean;
  perPack: number;
  unit: string;
  baseUnit: string;
  extras: ImportExtra[];
  previous?: { label: string; price: number; active: boolean };
}
export interface PharmacyImportError { row: number; problem: PharmacyImportProblem; value?: string }
export interface PharmacyImportPlan { rows: PharmacyImportRow[]; errors: PharmacyImportError[]; fatal?: PharmacyImportFatal }

export const MAX_PHARMACY_IMPORT_ROWS = 500;
export const MAX_IMPORT_EXTRAS = 4;
const MAX_PER_PACK = 100000;

type Existing = Pick<CatalogItem, 'id' | 'code' | 'label' | 'category' | 'active' | 'price' | 'stock' | 'unit' | 'baseUnit'>;

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();
const HEADERS = {
  code: ['code', 'codeproduit', 'reference', 'ref'],
  label: ['designation', 'medicament', 'produit', 'nom', 'name', 'label'],
  price: ['prix', 'prixunitaire', 'pu', 'tarif', 'price', 'unitprice', 'prixunite', 'prixboite'],
  active: ['actif', 'active', 'statut', 'status', 'etat'],
  unit: ['unite', 'uniteprincipale', 'unitedevente', 'unit', 'mainunit'],
  baseUnit: ['unitedebase', 'uniteminimale', 'baseunit'],
  perPack: ['contenu', 'contenuunite', 'quantiteparunite', 'qteparunite', 'parunite', 'perpack', 'content', 'conditionnement'],
} as const;
const extraHeaders = (i: number) => ({
  label: [`sousunite${i}`, `autreunite${i}`, `unitesupplementaire${i}`, `subunit${i}`, `unite${i}`],
  content: [`contenu${i}`, `content${i}`, `quantite${i}`, `qte${i}`],
  price: [`prix${i}`, `prixsousunite${i}`, `price${i}`, `prixunite${i}`],
});

const positiveInt = (text: string): number | undefined => {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.0+)?$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isSafeInteger(n) && n >= 1 ? n : undefined;
};
const sameText = (a: string, b: string): boolean => clean(a).toLowerCase() === clean(b).toLowerCase();

export function planPharmacyImport(table: readonly (readonly string[])[], existing: readonly Existing[]): PharmacyImportPlan {
  const none = (fatal: PharmacyImportFatal): PharmacyImportPlan => ({ rows: [], errors: [], fatal });
  const [head, ...body] = table;
  if (!head) return none('empty');
  const col = (names: readonly string[]): number => head.findIndex((h) => names.includes(norm(h)));
  const c = { code: col(HEADERS.code), label: col(HEADERS.label), price: col(HEADERS.price), active: col(HEADERS.active), unit: col(HEADERS.unit), baseUnit: col(HEADERS.baseUnit), perPack: col(HEADERS.perPack) };
  const extraCols = Array.from({ length: MAX_IMPORT_EXTRAS }, (_, k) => {
    const h = extraHeaders(k + 1);
    return { label: col(h.label), content: col(h.content), price: col(h.price) };
  });
  if ((c.code < 0 && c.label < 0) || c.price < 0) return none('missingColumns');
  const data = body.map((cells, i) => ({ row: i + 2, cells })).filter((r) => r.cells.some((x) => x.trim() !== ''));
  if (data.length === 0) return none('empty');
  if (data.length > MAX_PHARMACY_IMPORT_ROWS) return none('tooMany');

  const mains = existing.filter((i) => holdsStock(i));
  const derivedOf = (id: string): Existing[] => existing.filter((i) => !holdsStock(i) && i.stock?.itemId === id);
  const byCode = new Map(mains.map((i) => [i.code.toUpperCase(), i]));
  const byLabel = new Map(mains.map((i) => [labelKey(i.label), i]));
  const otherCodes = new Set(existing.filter((i) => !holdsStock(i)).map((i) => i.code.toUpperCase()));
  const touched = new Set<string>();
  const newLabels = new Set<string>();
  const newCodes = new Set<string>();
  const rows: PharmacyImportRow[] = [];
  const errors: PharmacyImportError[] = [];

  for (const { row, cells } of data) {
    const at = (i: number): string => (i >= 0 ? (cells[i] ?? '').trim() : '');
    const fail = (problem: PharmacyImportProblem, value?: string): void => { errors.push({ row, problem, ...(value !== undefined ? { value } : {}) }); };
    const codeText = at(c.code).toUpperCase();
    const labelText = clean(at(c.label));
    const priceText = at(c.price);
    const activeText = at(c.active);

    if (codeText && !CODE_PATTERN.test(codeText)) { fail('codeInvalid', codeText); continue; }
    if (codeText && otherCodes.has(codeText)) { fail('codeTaken', codeText); continue; }
    let found: Existing | undefined = codeText ? byCode.get(codeText) : undefined;
    const sameLabel = labelText ? byLabel.get(labelKey(labelText)) : undefined;
    if (!found && sameLabel) {
      if (codeText) { fail('codeMismatch', codeText); continue; }
      found = sameLabel;
    }
    if (labelText && sameLabel && found && sameLabel.id !== found.id) { fail('labelTaken', labelText); continue; }
    if (activeText && parseActive(activeText) === undefined) { fail('activeInvalid', activeText); continue; }

    let price: number | null = null;
    if (priceText) {
      price = parsePrice(priceText);
      if (price === null) { fail('priceInvalid', priceText); continue; }
    }
    const label = labelText || found?.label || '';
    if (!label) { fail('itemMissing', codeText); continue; }
    if (label.length < 2 || label.length > 120) { fail('labelLength', label); continue; }
    if (price === null && (!found || found.price.minor <= 0)) { fail('priceRequired', label); continue; }

    // Conditionnement : une cellule vide conserve ce que le produit a déjà (jamais d'effacement involontaire).
    const keepPer = found?.stock?.perUnit ?? 1;
    let perPack = keepPer;
    if (at(c.perPack)) {
      const n = positiveInt(at(c.perPack));
      if (n === undefined || n > MAX_PER_PACK) { fail('perPackInvalid', at(c.perPack)); continue; }
      perPack = n;
    }
    const unit = clean(at(c.unit)) || (found?.unit ?? '');
    const baseUnit = perPack > 1 ? clean(at(c.baseUnit)) || (found?.baseUnit ?? '') : '';
    if (perPack > 1 && (!unit || !baseUnit)) { fail('packagingLabelsRequired', label); continue; }
    if (perPack > 1 && sameText(unit, baseUnit)) { fail('packagingLabelsDifferent', label); continue; }

    const extras: ImportExtra[] = [];
    const labels = new Set<string>(unit ? [unit.toLowerCase()] : []);
    const sizes = new Set<number>([perPack]);
    let bad = false;
    for (const e of extraCols) {
      const l = clean(at(e.label));
      const content = at(e.content);
      const p = at(e.price);
      if (!l && !content && !p) continue;
      if (perPack === 1) { fail('extrasNeedPackaging', label); bad = true; break; }
      const size = positiveInt(content);
      if (!l || size === undefined || size >= perPack) { fail('extraInvalid', l || content); bad = true; break; }
      const ep = parsePrice(p);
      if (ep === null) { fail('extraPriceInvalid', l); bad = true; break; }
      if (labels.has(l.toLowerCase()) || sizes.has(size)) { fail('extraDuplicate', l); bad = true; break; }
      labels.add(l.toLowerCase());
      sizes.add(size);
      extras.push({ label: l, perUnit: size, price: ep });
    }
    if (bad) continue;

    if (found) {
      if (touched.has(found.id)) { fail('duplicateInFile', found.code); continue; }
      touched.add(found.id);
      const nextPrice = price ?? found.price.minor / 100;
      const nextActive = activeText ? (parseActive(activeText) as boolean) : found.active;
      const derived = derivedOf(found.id);
      const extrasSame = extras.every((x) => {
        const d = derived.find((y) => sameText(y.unit ?? '', x.label));
        return d !== undefined && d.stock?.perUnit === x.perUnit && d.price.minor === Math.round(x.price * 100) && d.active === nextActive;
      });
      const same = label === found.label && nextPrice === found.price.minor / 100 && nextActive === found.active
        && perPack === keepPer && sameText(unit, found.unit ?? '') && (perPack === 1 || sameText(baseUnit, found.baseUnit ?? '')) && extrasSame;
      rows.push({
        row, action: same ? 'unchanged' : 'update', code: found.code, label, price: nextPrice, active: nextActive, perPack, unit, baseUnit, extras,
        previous: { label: found.label, price: found.price.minor / 100, active: found.active },
      });
      continue;
    }

    if (newLabels.has(labelKey(label))) { fail('duplicateInFile', label); continue; }
    if (codeText && newCodes.has(codeText)) { fail('duplicateInFile', codeText); continue; }
    const code = codeText || suggestCode('pharmacy', [...existing, ...[...newCodes].map((x) => ({ code: x }))]);
    newLabels.add(labelKey(label));
    newCodes.add(code);
    rows.push({ row, action: 'create', code, label, price: price as number, active: activeText ? (parseActive(activeText) as boolean) : true, perPack, unit, baseUnit, extras });
  }
  return { rows, errors };
}

/** Résumé lisible des unités d'une ligne : « 1 Boîte = 100 Comprimé · Plaquette ×10 · Comprimé ×1 ». */
export function unitsText(r: Pick<PharmacyImportRow, 'perPack' | 'unit' | 'baseUnit' | 'extras'>): string {
  if (r.perPack <= 1) return r.unit || '—';
  return [`1 ${r.unit} = ${r.perPack} ${r.baseUnit}`, ...r.extras.map((e) => `${e.label} ×${e.perUnit}`)].join(' · ');
}
