/**
 * Règles des visites (tour de salle) et des consommations d'un patient hospitalisé — fonctions pures.
 *
 * Principes (identiques à l'API CERO HEALTH) :
 *  - le registre est en AJOUT SEUL : une erreur se corrige par une contre-écriture motivée, jamais par une modification ou une suppression ;
 *  - une consommation est un produit (sortie de stock à la facturation) ou un service/acte (aucun stock) ;
 *  - la saisie ne facture rien et ne sort rien du stock : la facturation est automatique à la demande de sortie et à la sortie ;
 *  - une consommation déjà facturée ne se contre-passe qu'après annulation de sa facture ;
 *  - une réduction exige un droit, un motif, et reste sous un plafond.
 */
import type { CatalogItem, ServiceCategory } from '@/core/pricing/types';
import { EMPTY_DOC, docOf, docToText, para, sanitizeDoc, type RichDoc } from '../consultations/richtext/doc';

export type VisitType = 'round' | 'care';
export const VISIT_TYPES: readonly VisitType[] = ['round', 'care'];
export type EntryKind = 'consumption' | 'reversal';

export const MAX_VISIT_LINES = 30;
export const MAX_LINE_QUANTITY = 999;
export const MAX_REASON = 255;
/** Plafond de réduction par défaut : 50 % (points de base). Configurable par l'établissement plus tard. */
export const DEFAULT_MAX_DISCOUNT_BP = 5000;

/** Évolution de l'examen par rapport à l'examen précédent (ou d'entrée). */
export type Evolution = 'improved' | 'stable' | 'worsened' | 'newFindings';
export const EVOLUTIONS: readonly Evolution[] = ['improved', 'stable', 'worsened', 'newFindings'];
/** Décision sur le traitement en cours : le maintenir, le modifier / y ajouter quelque chose, ou l'arrêter. */
export type TreatmentDecision = 'continue' | 'modify' | 'stop';
export const TREATMENT_DECISIONS: readonly TreatmentDecision[] = ['continue', 'modify', 'stop'];

export const MAX_CLINICAL_TEXT = 2000;
export const MAX_DIAGNOSIS = 500;

/**
 * Volet clinique d'une visite, en quatre étapes : 1) plaintes, 2) examen / observations, 3) conclusion = diagnostic, 4) plan.
 * Chaque étape est facultative mais s'enchaîne : pas de diagnostic sans examen, pas de plan sans diagnostic.
 * Écrit une seule fois avec la visite (registre en ajout seul) ; une correction se fait par une nouvelle visite.
 */
export interface VisitClinical {
  complaints?: { none: boolean; text: RichDoc };
  examination?: { evolution: Evolution; text: RichDoc };
  diagnosis?: string;
  plan?: { treatment?: TreatmentDecision; labs: boolean; discharge: boolean; note: RichDoc };
}

/** Saisie du volet clinique : les textes libres sont des documents riches (JSON), jamais du HTML ; un texte simple (anciennes saisies) est accepté. */
export type RichInput = RichDoc | string;
export interface VisitClinicalInput {
  complaints?: { none: boolean; text: RichInput };
  examination?: { evolution: Evolution; text: RichInput };
  diagnosis?: string;
  plan?: { treatment?: TreatmentDecision; labs: boolean; discharge: boolean; note: RichInput };
}

/** Document riche à partir d'une saisie ou d'une ancienne valeur en texte simple. */
export const toDoc = (v: unknown): RichDoc => (typeof v === 'string' ? (v.trim() === '' ? EMPTY_DOC : docOf(...v.split('\n').map((l) => para(l)))) : sanitizeDoc(v));

export interface Visit {
  id: string;
  admissionId: string;
  type: VisitType;
  visitedAt: string;
  by: string;
  clinical?: VisitClinical;
}

/** Ligne du registre : une consommation ou sa contre-écriture (jamais modifiée après coup). */
export interface ConsumptionEntry {
  id: string;
  admissionId: string;
  visitId: string;
  kind: EntryKind;
  /** Contre-écriture : consommation d'origine. */
  reversesId?: string;
  /** Rang de la ligne dans sa visite (ordre d'affichage stable). */
  line?: number;
  itemId: string;
  itemLabel: string;
  category: ServiceCategory;
  quantity: number;
  reason?: string;
  at: string;
  by: string;
}

/** Facturation d'une consommation (une ligne par consommation facturée). */
export interface ConsumptionBilling {
  id: string;
  admissionId: string;
  consumptionId: string;
  invoiceId: string;
  quantity: number;
  discountBp: number;
  discountReason?: string;
  discountBy?: string;
  /** Le stock a été sorti pour cette consommation (jamais ressorti à une nouvelle facture). */
  stockWithdrawn: boolean;
  at: string;
}

export class VisitError extends Error {
  constructor(readonly code: string, readonly params: Record<string, string | number> = {}) {
    super(code);
    this.name = 'VisitError';
  }
}
const fail = (code: string, params?: Record<string, string | number>): never => {
  throw new VisitError(code, params);
};

/** Produit = sort du stock à la facturation ; tout le reste est un service/acte. */
export const isProduct = (category: ServiceCategory): boolean => category === 'pharmacy' || category === 'consumable';

/** Une prestation de chambre ne se « consomme » pas en visite : elle est facturée par jour de séjour. */
export const isConsumable = (item: CatalogItem): boolean => item.active && item.category !== 'room' && item.category !== 'consultation';

export interface LineInput { itemId: string; quantity: number }

/** Valide les lignes d'une visite. Une visite peut être vide (simple tour de salle sans consommation). */
export function checkLines(lines: readonly LineInput[], catalog: readonly CatalogItem[]): CatalogItem[] {
  if (lines.length > MAX_VISIT_LINES) fail('tooManyLines', { max: MAX_VISIT_LINES });
  const seen = new Set<string>();
  return lines.map((l) => {
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > MAX_LINE_QUANTITY) fail('quantityInvalid', { max: MAX_LINE_QUANTITY });
    if (seen.has(l.itemId)) fail('lineDuplicate');
    seen.add(l.itemId);
    const item = catalog.find((c) => c.id === l.itemId);
    if (!item || !isConsumable(item)) return fail('itemInvalid');
    return item;
  });
}

/**
 * Valide et normalise le volet clinique. Les plaintes peuvent être saisies par tout soignant autorisé à enregistrer une visite ;
 * l'examen, le diagnostic et le plan exigent le droit clinique. Renvoie `undefined` si rien n'est saisi.
 */
export function checkClinical(input: VisitClinicalInput | undefined, canClinical: boolean): VisitClinical | undefined {
  if (!input) return undefined;
  const out: VisitClinical = {};
  /** Document filtré (liste blanche) + longueur mesurée sur le texte brut. */
  const rich = (v: RichInput): { doc: RichDoc; text: string } => {
    const doc = toDoc(v);
    const text = docToText(doc);
    if (text.length > MAX_CLINICAL_TEXT) fail('textTooLong', { max: MAX_CLINICAL_TEXT });
    return { doc, text };
  };
  if (input.complaints) {
    const c = rich(input.complaints.text);
    if (!input.complaints.none && c.text === '') fail('complaintsRequired');
    out.complaints = input.complaints.none ? { none: true, text: EMPTY_DOC } : { none: false, text: c.doc };
  }
  const clinicalPart = input.examination !== undefined || input.diagnosis !== undefined || input.plan !== undefined;
  if (clinicalPart && !canClinical) fail('clinicalForbidden');
  if (input.examination) {
    if (!EVOLUTIONS.includes(input.examination.evolution)) fail('evolutionInvalid');
    const e = rich(input.examination.text);
    if (e.text === '') fail('examinationRequired');
    out.examination = { evolution: input.examination.evolution, text: e.doc };
  }
  if (input.diagnosis !== undefined) {
    const d = input.diagnosis.trim();
    if (d === '') fail('diagnosisRequired');
    if (d.length > MAX_DIAGNOSIS) fail('textTooLong', { max: MAX_DIAGNOSIS });
    if (!out.examination) fail('diagnosisNeedsExamination');
    out.diagnosis = d;
  }
  if (input.plan) {
    const p = input.plan;
    if (!out.diagnosis) fail('planNeedsDiagnosis');
    if (p.treatment !== undefined && !TREATMENT_DECISIONS.includes(p.treatment)) fail('treatmentInvalid');
    if (p.treatment === undefined && !p.labs && !p.discharge) fail('planEmpty');
    out.plan = { ...(p.treatment ? { treatment: p.treatment } : {}), labs: Boolean(p.labs), discharge: Boolean(p.discharge), note: rich(p.note).doc };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export type RowStatus = 'pending' | 'billed' | 'reversed' | 'reversal';

export interface LedgerRow {
  entry: ConsumptionEntry;
  status: RowStatus;
  /** Quantité nette (consommation moins contre-écritures) ; 0 pour une contre-écriture. */
  net: number;
  /** Facturation active (facture non annulée) de cette consommation. */
  billing?: ConsumptionBilling;
}

/**
 * État du registre. Une facturation compte tant que sa facture n'est pas annulée : annuler la facture libère
 * la consommation (elle redevient « à facturer », contre-passable, refacturable sans nouvelle sortie de stock).
 */
export function buildLedger(entries: readonly ConsumptionEntry[], billings: readonly ConsumptionBilling[], activeInvoiceIds: ReadonlySet<string>): LedgerRow[] {
  // Ordre : date, puis consommations avant leurs contre-écritures de même instant, puis rang dans la visite.
  const sorted = [...entries].sort((a, b) => a.at.localeCompare(b.at) || Number(a.kind === 'reversal') - Number(b.kind === 'reversal') || (a.line ?? 0) - (b.line ?? 0) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  return sorted.map((entry) => {
    if (entry.kind === 'reversal') return { entry, status: 'reversal' as const, net: 0 };
    const reversed = sorted.filter((e) => e.kind === 'reversal' && e.reversesId === entry.id).reduce((s, e) => s + e.quantity, 0);
    const net = entry.quantity - reversed;
    const billing = billings.find((b) => b.consumptionId === entry.id && activeInvoiceIds.has(b.invoiceId));
    const status: RowStatus = billing ? 'billed' : net <= 0 ? 'reversed' : 'pending';
    return { entry, status, net, billing };
  });
}

export const hasNetConsumption = (rows: readonly LedgerRow[]): boolean => rows.some((r) => r.entry.kind === 'consumption' && r.net > 0);

/** Contre-écriture : motif obligatoire, pas sur du facturé, jamais plus que le reste. Renvoie la quantité à contre-passer. */
export function checkReverse(row: LedgerRow | undefined, input: { reason: string; quantity?: number }): number {
  if (!row || row.entry.kind !== 'consumption') return fail('consumptionNotFound');
  if (!input.reason.trim()) fail('reasonRequired');
  if (input.reason.trim().length > MAX_REASON) fail('reasonTooLong', { max: MAX_REASON });
  if (row.billing) fail('alreadyBilled');
  if (row.net <= 0) fail('alreadyReversed');
  const qty = input.quantity ?? row.net;
  if (!Number.isInteger(qty) || qty < 1) fail('quantityInvalid', { max: MAX_LINE_QUANTITY });
  if (qty > row.net) fail('overReversal', { net: row.net });
  return qty;
}

/** Quantités nettes à facturer, regroupées par prestation (ordre de première saisie). */
export interface PendingLine { itemId: string; itemLabel: string; category: ServiceCategory; quantity: number; consumptionIds: string[] }
export function pendingLines(rows: readonly LedgerRow[]): PendingLine[] {
  const out: PendingLine[] = [];
  for (const r of rows) {
    if (r.status !== 'pending') continue;
    const found = out.find((l) => l.itemId === r.entry.itemId);
    if (found) { found.quantity += r.net; found.consumptionIds.push(r.entry.id); }
    else out.push({ itemId: r.entry.itemId, itemLabel: r.entry.itemLabel, category: r.entry.category, quantity: r.net, consumptionIds: [r.entry.id] });
  }
  return out;
}

/** Réduction : droit, motif, plafond. Renvoie le taux retenu (points de base, 0 = aucune réduction). */
export function checkDiscount(input: { bp?: number; reason?: string }, canDiscount: boolean, maxBp: number = DEFAULT_MAX_DISCOUNT_BP): number {
  const bp = input.bp ?? 0;
  if (bp === 0) return 0;
  if (!Number.isInteger(bp) || bp < 0 || bp > 10000) fail('discountInvalid');
  if (!canDiscount) fail('discountForbidden');
  if (bp > maxBp) fail('discountTooHigh', { max: maxBp / 100 });
  if (!(input.reason ?? '').trim()) fail('discountReasonRequired');
  return bp;
}

/** Prix unitaire après réduction, arrondi « demi vers le haut » (même formule que l'API). */
export const discountedUnit = (unitMinor: number, bp: number): number => Math.floor((unitMinor * (10000 - bp) + 5000) / 10000);
