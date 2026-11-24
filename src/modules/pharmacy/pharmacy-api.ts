import { ApiError, healthClient } from '@/core/api';
import { authorName } from '../consultations/record-api';
import { ensureReference } from '../_shared/reference-data';
import { rxFromApi } from '../prescriptions/rx-api';
import type { CatalogItem } from '@/core/pricing/types';
import { importPharmacyCatalog, productToImport } from './catalog-api';
import { checkPackaging, type PackagingInput } from './packaging';
import type { Dispensation, DispensationLine, DeviationKind } from './pharmacy-rules';
import type { DispensationView, PharmacyService, QueueRow, StockItemView } from './pharmacy-service';

/**
 * Pharmacie sur l'API réelle (HEALTH) : /prescriptions (file d'attente), /dispensations (préparation, remise, annulation,
 * exception de paiement) et /catalog-items (produits). Le stock et les lots vivent dans UZISHA : le serveur choisit les lots (FEFO),
 * refuse un stock insuffisant et vérifie le paiement ; l'interface n'en calcule rien.
 */
type Row = Record<string, unknown>;
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const list = (v: unknown): Row[] => (Array.isArray(v) ? v.map(rec) : []);
const STOCKED = ['medication', 'consumable', 'medical_device'];

const refuse = (message: string): never => {
  throw new ApiError('validation', message, { source: 'health', status: 422, code: 'invalid_input' });
};
const id = (value: string, what: string): number => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : refuse(what);
};

const PAYMENT: Record<string, DispensationView['paymentState']> = {
  paid: 'paid', unpaid: 'unpaid', waived: 'waived', exception: 'exception', no_invoice: 'noInvoice', invoice_cancelled: 'invoiceCancelled',
};

/** « Amoxicilline 500 · Comprimé » ; pour un produit conditionné servi en boîtes : « … · Boîte (= 40 comprimés) ». */
function itemLabelOf(l: Row): string {
  const unit = text(l.item_unit);
  const perUnit = Number(l.per_unit) || 1;
  const base = text(l.item_base_unit);
  const total = Number(l.base_quantity) || 0;
  return [text(l.item_label), unit && `${unit}${perUnit > 1 && base ? ` (= ${total} ${base})` : ''}`].filter(Boolean).join(' · ');
}

export function dispensationFromApi(r: Row): DispensationView {
  const patient = rec(r.patient);
  const status = text(r.status);
  const exception = r.payment_exception ? rec(r.payment_exception) : null;
  const cancellation = r.cancellation ? rec(r.cancellation) : null;
  const dispensed = r.dispensed_at ? { at: text(r.dispensed_at), by: authorName(r.dispensed_by_user_id) } : undefined;
  const lines: DispensationLine[] = list(r.lines).map((l, i) => {
    const dev = l.deviation ? rec(l.deviation) : null;
    return {
      rxLineIndex: (Number(l.line_no) || i + 1) - 1,
      rxLabel: text(l.rx_label),
      itemId: text(l.catalog_item_id),
      itemLabel: itemLabelOf(l),
      quantity: Number(l.quantity) || 0,
      lots: list(l.allocations).map((a) => ({ lotId: text(a.stock_history_id), lotNumber: text(a.batch_number) || `#${text(a.stock_history_id)}`, quantity: Number(a.quantity) || 0 })),
      ...(dev ? { deviation: { kinds: (Array.isArray(dev.kinds) ? dev.kinds.map(text) : []) as DeviationKind[], reason: text(dev.reason) } } : {}),
    };
  });
  const dispensation: Dispensation = {
    id: text(r.id), number: text(r.number), prescriptionId: text(r.prescription_id), rxNumber: text(r.prescription_number),
    patientId: text(r.patient_id), patientName: text(patient.full_name) || `Patient n°${text(r.patient_id)}`,
    status: (['prepared', 'dispensed', 'cancelled'].includes(status) ? status : 'prepared') as Dispensation['status'],
    lines, invoiceId: '', preparedBy: authorName(r.prepared_by_user_id), preparedAt: text(r.prepared_at),
    ...(exception ? { paymentException: { at: text(exception.at), by: authorName(exception.by_user_id), reason: text(exception.reason) } } : {}),
    ...(dispensed ? { dispensed } : {}),
    ...(cancellation ? { cancellation: { at: text(cancellation.at), by: authorName(cancellation.by_user_id), reason: text(cancellation.reason), refundPending: cancellation.refund_pending === true } } : {}),
  };
  const state = PAYMENT[text(r.payment_state)] ?? 'unpaid';
  return { dispensation, paymentState: state, paymentCleared: state === 'paid' || state === 'waived' || state === 'exception' };
}

const wrapOne = async (call: Promise<{ data: unknown }>): Promise<DispensationView> => dispensationFromApi(rec((await call).data));

export const apiPharmacy = {
  /** Ordonnances validées ; le reste à servir tient compte des préparations en cours et des remises. */
  async queue(): Promise<QueueRow[]> {
    await ensureReference();
    const res = await healthClient.get<Row[]>('/prescriptions', { params: { status: 'validated', per_page: 100 } });
    const rows = list(res.data);
    return rows
      .map((r) => ({ prescription: rxFromApi(r), remaining: list(r.items).map((i) => Math.max(0, (Number(i.quantity) || 0) - (Number(i.committed_quantity) || 0))) }))
      .sort((a, b) => a.prescription.prescribedAt.localeCompare(b.prescription.prescribedAt));
  },

  async dispensations(): Promise<DispensationView[]> {
    await ensureReference();
    const res = await healthClient.get<Row[]>('/dispensations', { params: { per_page: 100 } });
    return list(res.data).map(dispensationFromApi);
  },

  /** Produits du catalogue pharmacie. Les quantités et les lots sont dans UZISHA : ils ne sont pas lus ici. */
  async stock(): Promise<{ items: StockItemView[]; movements: []; day: string }> {
    const res = await healthClient.get<Row[]>('/catalog-items', { params: { is_active: 'true', per_page: 100 } });
    const items = list(res.data)
      .filter((c) => STOCKED.includes(text(c.nature)))
      .map((c): StockItemView => {
        const article = rec(c.article);
        const label = text(article.name) || [text(c.generic_name), text(c.strength)].filter(Boolean).join(' ');
        // Conditionnement : le stock est tenu dans l'unité de base (le comprimé) ; une boîte vaut N unités de base.
        // Un article « dérivé » (comprimé, sachet) puise dans le stock du produit principal (stock_item_id).
        const perUnit = Number(c.stock_per_unit) || 1;
        const unit = text(c.unit_label);
        const base = text(c.base_unit_label);
        return {
          itemId: text(c.id), label, code: text(article.code_manuel) || text(c.id), total: 0, usable: 0, usableUnits: 0, lots: [],
          ...(unit ? { unit } : {}),
          ...(perUnit > 1 ? { packaging: { perUnit, unit, baseUnit: base } } : {}),
          ...(c.stock_item_id ? { derivedOf: text(c.stock_item_id) } : {}),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
    return { items, movements: [], day: new Date().toISOString().slice(0, 10) };
  },

  async prepare(input: Parameters<PharmacyService['prepare']>[0]): Promise<DispensationView> {
    await ensureReference();
    const rxId = id(input.prescriptionId, 'Ordonnance introuvable.');
    const careUnit = id(input.careUnitId ?? '', "Choisissez l'unité de soins (pharmacie) qui sert cette ordonnance.");
    // Les lignes de l'ordonnance portent leur identifiant côté serveur, dans l'ordre affiché.
    const detail = await healthClient.get<Row>(`/prescriptions/${rxId}`);
    const items = list(rec(detail.data).items);
    const lines = input.lines.map((l) => {
      const item = items[l.rxLineIndex];
      if (!item) return refuse("Ligne d'ordonnance introuvable : rechargez la page.");
      return {
        prescription_item_id: id(text(item.id), "Ligne d'ordonnance introuvable."),
        catalog_item_id: id(l.itemId, 'Choisissez un produit.'),
        quantity: l.quantity,
        ...(l.reason ? { reason: l.reason } : {}),
      };
    });
    return wrapOne(healthClient.post<Row>('/dispensations', { prescription_id: rxId, care_unit_id: careUnit, lines }));
  },

  grantPaymentException: (input: { id: string; reason: string }): Promise<DispensationView> =>
    wrapOne(healthClient.post<Row>(`/dispensations/${encodeURIComponent(input.id)}/actions/payment-exception`, { reason: input.reason })),

  dispense: (input: { id: string; witnessUserId?: string }): Promise<DispensationView> =>
    wrapOne(healthClient.post<Row>(`/dispensations/${encodeURIComponent(input.id)}/actions/dispense`, input.witnessUserId ? { witness_user_id: Number(input.witnessUserId) } : {})),

  cancel: (input: { id: string; reason: string }): Promise<DispensationView> =>
    wrapOne(healthClient.post<Row>(`/dispensations/${encodeURIComponent(input.id)}/actions/cancel`, { reason: input.reason })),

  /** Les réceptions, imports de lots et corrections de stock se font dans UZISHA ; le catalogue et les prix, ici. */
  receiveLot: (): Promise<never> => Promise.reject(new ApiError('validation', 'Le stock se gère dans UZISHA.', { source: 'health', status: 422, code: 'stock_in_uzisha' })),
  importLots: (): Promise<never> => Promise.reject(new ApiError('validation', 'Le stock se gère dans UZISHA.', { source: 'health', status: 422, code: 'stock_in_uzisha' })),
  /** Ajout ou modification d'un médicament (prix et unités de vente) : même chemin que l'importation, avec une seule ligne. */
  async saveProduct(input: { item: CatalogItem; packaging: PackagingInput }): Promise<{ created: number; updated: number; unchanged: number }> {
    return importPharmacyCatalog({ items: [productToImport(input.item, checkPackaging(input.packaging))] });
  },
  adjust: (): Promise<never> => Promise.reject(new ApiError('validation', 'Le stock se gère dans UZISHA.', { source: 'health', status: 422, code: 'stock_in_uzisha' })),
};
