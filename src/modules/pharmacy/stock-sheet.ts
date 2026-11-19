import type { Cell } from '../_shared/export/xlsx';
import { CODE_PATTERN, labelKey, parsePrice, suggestCode } from '../catalog/catalog-rules';
import type { StockItemView } from './pharmacy-service';

/** Fiche de stock (export) et importation de lots depuis un tableau (feuille Excel déjà lue). */

export interface SheetLabels { code: string; item: string; lot: string; expiry: string; quantity: string; status: string; ok: string; expired: string; out: string }

/** Une ligne par lot ; un produit sans lot apparaît en rupture. Les dates restent au format AAAA-MM-JJ (réimportable). */
export function stockSheet(items: readonly StockItemView[], day: string, L: SheetLabels): { header: string[]; rows: Cell[][] } {
  const rows: Cell[][] = [];
  for (const item of [...items].sort((a, b) => a.label.localeCompare(b.label))) {
    if (item.lots.length === 0) rows.push([item.code, item.label, '', '', 0, L.out]);
    for (const lot of item.lots) rows.push([item.code, item.label, lot.lotNumber, lot.expiresAt ?? '', lot.quantity, lot.expiresAt && lot.expiresAt < day ? L.expired : L.ok]);
  }
  return { header: [L.code, L.item, L.lot, L.expiry, L.quantity, L.status], rows };
}

export type ImportProblem = 'itemUnknown' | 'codeMismatch' | 'codeInvalid' | 'labelLength' | 'priceRequired' | 'priceInvalid' | 'lotRequired' | 'quantityInvalid' | 'dateInvalid' | 'alreadyExpired' | 'duplicateInFile' | 'lotExists';
/** Produit absent du catalogue : il sera ajouté (avec son prix) en même temps que la réception du lot. */
/** `price` : montant décimal dans la devise du catalogue (ex. 12.5). */
export interface NewItem { code: string; label: string; price: number }
export interface ImportLine { row: number; itemId: string; itemLabel: string; lotNumber: string; quantity: number; expiresAt: string | null; newItem?: NewItem }
export interface ImportRowError { row: number; problem: ImportProblem; value?: string }
export type ImportFatal = 'missingColumns' | 'empty' | 'tooMany';
export interface ImportPlan { lines: ImportLine[]; errors: ImportRowError[]; newItems: NewItem[]; fatal?: ImportFatal }

export const MAX_IMPORT_ROWS = 500;

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const key = labelKey; // désignations : sans accents ni casse
const lotKey = (s: string): string => s.trim().toLowerCase();
const HEADERS = {
  code: ['code', 'codeproduit', 'reference', 'ref'],
  item: ['produit', 'designation', 'medicament', 'product', 'item', 'name', 'nom'],
  lot: ['lot', 'nlot', 'ndelot', 'numerodelot', 'nodelot', 'numerolot', 'numlot', 'lotnumber', 'batch', 'batchnumber'],
  expiry: ['peremption', 'dateperemption', 'expiration', 'dateexpiration', 'expiry', 'expirydate', 'expirationdate', 'expires'],
  qty: ['quantite', 'qte', 'quantity', 'qty'],
  price: ['prix', 'prixunitaire', 'pu', 'tarif', 'price', 'unitprice'],
} as const;

/** Date saisie → AAAA-MM-JJ ; accepte ISO, JJ/MM/AAAA, JJ-MM-AAAA et le numéro de série Excel. undefined si illisible. */
export function parseDay(text: string): string | undefined {
  const t = text.trim();
  const valid = (y: number, m: number, d: number): string | undefined => {
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : undefined;
  };
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return valid(Number(m[3]), Number(m[2]), Number(m[1]));
  if (/^\d{5}(\.0+)?$/.test(t)) {
    const serial = Math.floor(Number(t));
    if (serial >= 20000 && serial <= 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
  }
  return undefined;
}

function parseQuantity(text: string): number | undefined {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.0+)?$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** Analyse complète AVANT toute écriture : lignes valides, produits à créer et chaque erreur avec son numéro de ligne Excel. */
export function planStockImport(table: readonly (readonly string[])[], items: readonly StockItemView[], day: string): ImportPlan {
  const none = (fatal: ImportFatal): ImportPlan => ({ lines: [], errors: [], newItems: [], fatal });
  const [head, ...body] = table;
  if (!head) return none('empty');
  const col = (names: readonly string[]): number => head.findIndex((h) => names.includes(norm(h)));
  const c = { code: col(HEADERS.code), item: col(HEADERS.item), lot: col(HEADERS.lot), expiry: col(HEADERS.expiry), qty: col(HEADERS.qty), price: col(HEADERS.price) };
  if ((c.code < 0 && c.item < 0) || c.lot < 0 || c.qty < 0) return none('missingColumns');
  const data = body.map((cells, i) => ({ row: i + 2, cells })).filter((r) => r.cells.some((x) => x.trim() !== ''));
  if (data.length === 0) return none('empty');
  if (data.length > MAX_IMPORT_ROWS) return none('tooMany');
  const byCode = new Map(items.map((i) => [i.code.toUpperCase(), i]));
  const byLabel = new Map(items.map((i) => [key(i.label), i]));
  const existing = new Set(items.flatMap((i) => i.lots.map((l) => `${i.itemId}|${lotKey(l.lotNumber)}`)));
  const created = new Map<string, NewItem>(); // produits à créer, par désignation normalisée
  const seen = new Set<string>();
  const lines: ImportLine[] = [];
  const errors: ImportRowError[] = [];
  for (const { row, cells } of data) {
    const at = (i: number): string => (i >= 0 ? (cells[i] ?? '').trim() : '');
    const codeText = at(c.code).toUpperCase();
    const labelText = at(c.item).replace(/\s+/g, ' ');
    let item: StockItemView | undefined = codeText ? byCode.get(codeText) : undefined;
    let newItem: NewItem | undefined;
    if (!item) {
      const sameLabel = labelText ? byLabel.get(key(labelText)) : undefined;
      if (sameLabel && !codeText) item = sameLabel;
      else if (sameLabel || (labelText && created.has(key(labelText)) && codeText && created.get(key(labelText))!.code !== codeText)) { errors.push({ row, problem: 'codeMismatch', value: codeText }); continue; }
      else if (!labelText) { errors.push({ row, problem: 'itemUnknown', value: codeText }); continue; }
      else {
        newItem = created.get(key(labelText));
        if (!newItem) {
          if (labelText.length < 2 || labelText.length > 120) { errors.push({ row, problem: 'labelLength', value: labelText }); continue; }
          if (codeText && (!CODE_PATTERN.test(codeText) || [...created.values()].some((n) => n.code === codeText))) { errors.push({ row, problem: 'codeInvalid', value: codeText }); continue; }
          const priceText = at(c.price);
          if (!priceText) { errors.push({ row, problem: 'priceRequired', value: labelText }); continue; }
          const price = parsePrice(priceText);
          if (price === null) { errors.push({ row, problem: 'priceInvalid', value: priceText }); continue; }
          const code = codeText || suggestCode('pharmacy', [...items, ...created.values()]);
          newItem = { code, label: labelText, price };
          created.set(key(labelText), newItem);
        }
      }
    }
    const lotNumber = at(c.lot);
    if (!lotNumber) { errors.push({ row, problem: 'lotRequired' }); continue; }
    const quantity = parseQuantity(at(c.qty));
    if (quantity === undefined) { errors.push({ row, problem: 'quantityInvalid', value: at(c.qty) }); continue; }
    let expiresAt: string | null = null;
    if (at(c.expiry)) {
      const d = parseDay(at(c.expiry));
      if (!d) { errors.push({ row, problem: 'dateInvalid', value: at(c.expiry) }); continue; }
      if (d < day) { errors.push({ row, problem: 'alreadyExpired', value: d }); continue; }
      expiresAt = d;
    }
    const owner = item ? item.itemId : `new:${key(newItem!.label)}`;
    const id = `${owner}|${lotKey(lotNumber)}`;
    if (existing.has(id)) { errors.push({ row, problem: 'lotExists', value: lotNumber }); continue; }
    if (seen.has(id)) { errors.push({ row, problem: 'duplicateInFile', value: lotNumber }); continue; }
    seen.add(id);
    lines.push({ row, itemId: item?.itemId ?? '', itemLabel: item?.label ?? newItem!.label, lotNumber, quantity, expiresAt, ...(newItem ? { newItem } : {}) });
  }
  const used = new Set(lines.filter((l) => l.newItem).map((l) => l.newItem!.code));
  return { lines, errors, newItems: [...created.values()].filter((n) => used.has(n.code)) };
}
