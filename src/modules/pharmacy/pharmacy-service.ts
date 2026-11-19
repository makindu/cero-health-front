import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { paymentPolicy } from '../patients/payment-policy';
import { BusinessRuleError } from '../_shared/business-error';
import { decimalsOf } from '@/core/money/money';
import type { CatalogItem } from '@/core/pricing/types';
import { labelKey } from '../catalog/catalog-rules';
import { catalogRef } from '../finance/collections';
import type { FinanceDeps, FinanceService, InvoiceView } from '../finance/finance-service';
import { rxRef } from '../prescriptions/rx-service';
import { markRxDispensed, type Rx } from '../prescriptions/rx-rules';
import { dispensationsRef, lotsRef, movementsRef } from './collections';
import * as R from './pharmacy-rules';
import { PharmacyError, type Dispensation, type StockLot, type StockMovement } from './pharmacy-rules';
import { round2 } from '@/utils/numbers';
import { checkPackaging, deriveUnits, holdsStock, stockLink, type PackagingInput } from './packaging';
import { notificationsRef } from '../notifications/collections';
import { buildRxDeviationNotification } from '../notifications/notification-rules';

function wrap<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof PharmacyError) {
      const kind = e.code === 'wrongStatus' || e.code === 'insufficientStock' || e.code === 'paymentRequired' ? 'conflict' : 'validation';
      throw new BusinessRuleError(`pharmacy.${e.code}`, e.params, kind);
    }
    throw e;
  }
}
const refuse = (code: string): never => {
  throw new BusinessRuleError(`pharmacy.${code}`, {}, 'validation');
};

export interface DispensationView {
  dispensation: Dispensation;
  invoice?: InvoiceView;
  paymentCleared: boolean;
  paymentState: 'paid' | 'unpaid' | 'credit' | 'exception' | 'invoiceCancelled' | 'waived';
}
export interface QueueRow {
  prescription: Rx;
  remaining: number[];
}
export interface StockItemView {
  itemId: string;
  label: string;
  code: string;
  /** Stock total et utilisable, en UNITÉ DE BASE du produit (le comprimé, pour un produit conditionné). */
  total: number;
  usable: number;
  lots: StockLot[];
  /** Quantité utilisable exprimée dans l'unité DE VENTE de cet article (boîte, sachet, comprimé). */
  usableUnits: number;
  /** Unité de vente de cet article. */
  unit?: string;
  /** Conditionnement du produit (présent seulement s'il est conditionné). */
  packaging?: { perUnit: number; unit: string; baseUnit: string };
  /** Article dérivé (sachet, comprimé…) : il n'a pas de lots propres, il puise dans le produit principal. */
  derivedOf?: string;
}

export function createPharmacyService(deps: FinanceDeps, finance: FinanceService) {
  const gateFor = (view: InvoiceView | undefined, waived = false): R.PaymentGate => ({
    waived,
    patientBalance: view ? view.balances.patientBalance : Number.MAX_SAFE_INTEGER,
    creditAuthorized: Boolean(view?.invoice.credit),
    cancelledInvoice: !view || view.status === 'cancelled',
  });

  async function toView(u: Parameters<Parameters<FinanceDeps['run']>[0]>[0], d: Dispensation): Promise<DispensationView> {
    const invoice = await finance.inUnit.invoiceState(u, d.invoiceId);
    const gate = gateFor(invoice, !(await paymentPolicy(u, d.patientId)).medication);
    const state: DispensationView['paymentState'] = gate.cancelledInvoice ? 'invoiceCancelled' : gate.patientBalance <= 0 ? 'paid' : gate.waived ? 'waived' : gate.creditAuthorized ? 'credit' : d.paymentException ? 'exception' : 'unpaid';
    return { dispensation: d, invoice, paymentCleared: R.paymentCleared(d, gate), paymentState: state };
  }

  return {
    /** Prescriptions validées avec la quantité restant à dispenser par ligne. */
    queue: (): Promise<QueueRow[]> => deps.run(async (u) => {
      const [rxs, disp] = await Promise.all([u.list(rxRef), u.list(dispensationsRef)]);
      return rxs.filter((r) => r.status === 'validated').sort((a, b) => a.prescribedAt.localeCompare(b.prescribedAt))
        .map((prescription) => ({ prescription, remaining: R.remaining(prescription.items, disp.filter((d) => d.prescriptionId === prescription.id)) }));
    }),

    dispensations: (): Promise<DispensationView[]> => deps.run(async (u) => {
      const list = (await u.list(dispensationsRef)).sort((a, b) => b.preparedAt.localeCompare(a.preparedAt));
      return Promise.all(list.map((d) => toView(u, d)));
    }),

    stock: (): Promise<{ items: StockItemView[]; movements: StockMovement[]; day: string }> => deps.run(async (u) => {
      const [lots, catalog, movements] = await Promise.all([u.list(lotsRef), u.list(catalogRef), u.list(movementsRef)]);
      const day = deps.day(u.now);
      const pharmacyItems = catalog.filter((c) => c.category === 'pharmacy');
      const items = pharmacyItems.map((c) => {
        const { stockId, factor } = stockLink(c);
        const holder = pharmacyItems.find((x) => x.id === stockId) ?? c;
        const mine = lots.filter((l) => l.itemId === stockId);
        const usable = R.available(lots, stockId, day);
        const perUnit = holder.stock?.perUnit ?? 1;
        const packaging = perUnit > 1 ? { perUnit, unit: holder.unit ?? '', baseUnit: holder.baseUnit ?? '' } : undefined;
        return {
          itemId: c.id, label: c.label, code: c.code, total: mine.reduce((s, l) => s + l.quantity, 0), usable, lots: mine,
          usableUnits: Math.floor(usable / factor), ...(c.unit ? { unit: c.unit } : {}), ...(packaging ? { packaging } : {}), ...(holdsStock(c) ? {} : { derivedOf: stockId }),
        };
      });
      return { items, movements: movements.sort((a, b) => b.at.localeCompare(a.at)), day };
    }),

    /** Établit la dispensation et SA facture (même transaction). Aucun stock n'est sorti à ce stade. */
    prepare: (input: { prescriptionId: string; lines: { rxLineIndex: number; itemId: string; quantity: number; reason?: string }[]; primaryCoverageId?: string; secondaryCoverageId?: string }): Promise<DispensationView> => deps.run(async (u) => {
      deps.require(P.pharmacy.dispense);
      const rx = await u.get(rxRef, input.prescriptionId);
      if (!rx) return refuse('prescriptionNotFound');
      if (rx.status !== 'validated') return refuse('prescriptionNotValidated');
      const all = await u.list(dispensationsRef);
      wrap(() => R.checkPrepare(input.lines, rx.items, all.filter((d) => d.prescriptionId === rx.id)));
      const [catalog, lots] = await Promise.all([u.list(catalogRef), u.list(lotsRef)]);
      const day = deps.day(u.now);
      const left = R.remaining(rx.items, all.filter((d) => d.prescriptionId === rx.id));
      const lines = input.lines.map((l) => {
        const item = catalog.find((c) => c.id === l.itemId && c.category === 'pharmacy');
        if (!item) return refuse('itemNotInCatalog');
        if (!item!.active) return refuse('itemInactive');
        const { stockId, factor } = stockLink(item!);
        const free = R.available(lots, stockId, day);
        if (free < round2(l.quantity * factor)) throw new BusinessRuleError('pharmacy.insufficientStock', { available: Math.floor(free / factor) }, 'conflict');
        const rxLabel = rx.items[l.rxLineIndex]!.label;
        const deviation = wrap(() => R.checkDeviation(R.deviationKinds({ rxLabel, itemLabel: item!.label, quantity: l.quantity, remaining: left[l.rxLineIndex]! }), l.reason));
        return { rxLineIndex: l.rxLineIndex, rxLabel, itemId: l.itemId, itemLabel: item!.label, quantity: l.quantity, lots: [], ...(deviation ? { deviation } : {}) };
      });
      const id = deps.newId('dis');
      const invoice = await finance.inUnit.createInvoice(u, {
        patientId: rx.patientId,
        lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
        sources: lines.map((_l, i) => ({ module: 'pharmacy', ref: `${id}:${i}` })),
        primaryCoverageId: input.primaryCoverageId, secondaryCoverageId: input.secondaryCoverageId, episodeId: rx.consultationId,
      });
      const d: Dispensation = {
        id, number: R.nextNumber(all, Number(day.slice(0, 4))), prescriptionId: rx.id, rxNumber: rx.number, patientId: rx.patientId, patientName: rx.patientName,
        status: 'prepared', lines, invoiceId: invoice.invoice.id, preparedBy: u.ctx.actor.name, preparedAt: u.now.toISOString(),
      };
      await u.insert(dispensationsRef, d, { action: 'dispensation:prepare' });
      // Le prescripteur est le premier responsable de son ordonnance : tout écart de la pharmacie lui est notifié (même transaction).
      const deviating = d.lines.filter((l) => l.deviation);
      if (deviating.length > 0) {
        await u.insert(notificationsRef, buildRxDeviationNotification({
          id: deps.newId('ntf'), now: d.preparedAt, prescriberId: rx.prescriberId, prescriberName: rx.prescriber,
          payload: {
            rxId: rx.id, rxNumber: rx.number, patientName: rx.patientName, dispensationNumber: d.number, by: u.ctx.actor.name,
            lines: deviating.map((l) => ({ rxLabel: l.rxLabel, itemLabel: l.itemLabel, quantity: l.quantity, kinds: l.deviation!.kinds, reason: l.deviation!.reason })),
          },
        }), { action: 'notification:rxDeviation' });
      }
      return toView(u, d);
    }),

    grantPaymentException: (input: { id: string; reason: string }): Promise<DispensationView> => deps.run(async (u) => {
      deps.require(P.pharmacy.exception);
      const d = await u.get(dispensationsRef, input.id);
      if (!d) return refuse('notFound');
      const next = wrap(() => R.grantException(d, { by: u.ctx.actor.name, now: u.now.toISOString(), reason: input.reason }));
      await u.update(dispensationsRef, d.id, () => next, { action: 'dispensation:payment-exception', reason: input.reason });
      return toView(u, next);
    }),

    /** Remise au patient : paiement vérifié, lots périmés exclus, sortie de stock FEFO + mouvements + dispensation, dans UNE transaction. */
    dispense: (input: { id: string }): Promise<DispensationView> => deps.run(async (u) => {
      deps.require(P.pharmacy.dispense);
      const d = await u.get(dispensationsRef, input.id);
      if (!d) return refuse('notFound');
      const invoice = await finance.inUnit.invoiceState(u, d.invoiceId);
      const now = u.now.toISOString();
      const day = deps.day(u.now);
      const waived = !(await paymentPolicy(u, d.patientId)).medication;
      wrap(() => R.markDispensed(d, d.lines, { by: u.ctx.actor.name, now }, gateFor(invoice, waived))); // paiement et statut vérifiés avant toute sortie de stock
      const [lots, catalogNow] = await Promise.all([u.list(lotsRef), u.list(catalogRef)]);
      const working = lots.map((l) => ({ ...l }));
      const moves: StockMovement[] = [];
      const lines = d.lines.map((line) => {
        const sold = catalogNow.find((c) => c.id === line.itemId);
        const { stockId, factor } = sold ? stockLink(sold) : { stockId: line.itemId, factor: 1 };
        // Les lots utilisés sont notés en unité de base (celle du stock) ; la quantité facturée reste dans l'unité vendue.
        const alloc = wrap(() => R.allocateFefo(working, stockId, round2(line.quantity * factor), day));
        for (const a of alloc) {
          const lot = working.find((l) => l.id === a.lotId)!;
          lot.quantity = round2(lot.quantity - a.quantity);
          moves.push({ id: deps.newId('mov'), at: now, by: u.ctx.actor.name, itemId: stockId, lotId: a.lotId, delta: -a.quantity, kind: 'dispense', ref: `${d.number}` });
        }
        return { ...line, lots: alloc };
      });
      const next = wrap(() => R.markDispensed(d, lines, { by: u.ctx.actor.name, now }, gateFor(invoice, waived)));
      for (const lot of working) {
        const before = lots.find((l) => l.id === lot.id)!;
        if (before.quantity !== lot.quantity) await u.update(lotsRef, lot.id, () => lot, { action: 'stock:dispense' });
      }
      for (const m of moves) await u.insert(movementsRef, m, { action: 'stock:movement' });
      await u.update(dispensationsRef, d.id, () => next, { action: 'dispensation:dispense' });
      const rx = await u.get(rxRef, d.prescriptionId);
      const all = await u.list(dispensationsRef);
      if (rx && rx.status === 'validated' && R.allDispensed(rx.items, all.filter((x) => x.prescriptionId === rx.id))) {
        const done = wrap(() => markRxDispensed(rx));
        await u.update(rxRef, rx.id, () => done, { action: 'rx:dispensed' });
      }
      return toView(u, next);
    }),

    /** Annulation avant remise. Facture impayée annulée atomiquement ; sinon remboursement à faire en caisse. */
    cancel: (input: { id: string; reason: string }): Promise<DispensationView> => deps.run(async (u) => {
      deps.require(P.pharmacy.dispense);
      const d = await u.get(dispensationsRef, input.id);
      if (!d) return refuse('notFound');
      const view = await toView(u, d);
      const paid = (view.invoice?.balances.patientPaid ?? 0) > 0;
      const next = wrap(() => R.cancel(d, { by: u.ctx.actor.name, now: u.now.toISOString(), reason: input.reason, refundPending: paid }));
      if (view.invoice && view.invoice.status !== 'cancelled' && !paid) await finance.inUnit.cancelInvoice(u, { invoiceId: d.invoiceId, reason: `${d.number} : ${input.reason}` });
      await u.update(dispensationsRef, d.id, () => next, { action: 'dispensation:cancel', reason: input.reason });
      return toView(u, next);
    }),

    receiveLot: (input: { itemId: string; lotNumber: string; quantity: number; expiresAt: string | null }): Promise<StockLot> => deps.run(async (u) => {
      deps.require(P.inventory.receive);
      const item = (await u.list(catalogRef)).find((c) => c.id === input.itemId && c.category === 'pharmacy');
      if (!item) return refuse('itemNotInCatalog');
      if (!holdsStock(item)) return refuse('itemIsDerived');
      wrap(() => R.checkReceive(input, deps.day(u.now)));
      // Réception saisie dans l'unité principale (boîte) : le stock est tenu en unité de base (comprimé).
      const perUnit = item.stock?.perUnit ?? 1;
      const lots = await u.list(lotsRef);
      if (lots.some((l) => l.itemId === input.itemId && l.lotNumber.trim().toLowerCase() === input.lotNumber.trim().toLowerCase())) return refuse('lotExists');
      const lot: StockLot = { id: deps.newId('lot'), itemId: input.itemId, lotNumber: input.lotNumber.trim(), expiresAt: input.expiresAt, quantity: input.quantity * perUnit };
      await u.insert(lotsRef, lot, { action: 'stock:receive' });
      await u.insert(movementsRef, { id: deps.newId('mov'), at: u.now.toISOString(), by: u.ctx.actor.name, itemId: lot.itemId, lotId: lot.id, delta: lot.quantity, kind: 'receive' }, { action: 'stock:movement' });
      return lot;
    }),

    /**
     * Réception de plusieurs lots (importation d'un fichier) : TOUT ou RIEN, dans une seule transaction, un mouvement par lot.
     * Une ligne peut porter `newItem` : le produit absent du catalogue pharmacie est alors créé (avec son prix) avant la réception.
     */
    importLots: (inputs: ReadonlyArray<{ itemId: string; newItem?: { code: string; label: string; price: number }; lotNumber: string; quantity: number; expiresAt: string | null }>): Promise<{ count: number; created: number }> => deps.run(async (u) => {
      deps.require(P.inventory.receive);
      if (inputs.length === 0) return refuse('importEmpty');
      if (inputs.length > 500) return refuse('importTooMany');
      const everything = await u.list(catalogRef);
      const catalog = everything.filter((c) => c.category === 'pharmacy');
      if (inputs.some((i) => i.newItem)) deps.require(P.pharmacy.catalog);
      const currency = everything[0]?.price.currency ?? 'USD';
      const clean = (t: string): string => t.trim().replace(/\s+/g, ' ');
      const same = labelKey;
      const made = new Map<string, CatalogItem>();
      const taken = new Set((await u.list(lotsRef)).map((l) => `${l.itemId}|${l.lotNumber.trim().toLowerCase()}`));
      const day = deps.day(u.now);
      const lots: StockLot[] = [];
      for (const input of inputs) {
        let itemId = input.itemId;
        if (input.newItem) {
          const label = clean(input.newItem.label);
          const code = input.newItem.code.trim().toUpperCase();
          let item = made.get(same(label));
          if (!item) {
            if (label.length < 2 || label.length > 120 || !/^[A-Z0-9-]{2,20}$/.test(code) || !(input.newItem.price > 0)) return refuse('catalogItemInvalid');
            if (everything.some((c) => c.code.toUpperCase() === code) || [...made.values()].some((c) => c.code === code)) return refuse('catalogCodeTaken');
            if (catalog.some((c) => same(c.label) === same(label))) return refuse('catalogLabelTaken');
            item = { id: deps.newId('cat'), code, label, category: 'pharmacy', price: { minor: Math.round(input.newItem.price * 10 ** decimalsOf(currency)), currency }, active: true };
            made.set(same(label), item);
          }
          itemId = item.id;
        } else {
          const known = catalog.find((c) => c.id === itemId);
          if (!known) return refuse('itemNotInCatalog');
          if (!holdsStock(known)) return refuse('itemIsDerived');
        }
        wrap(() => R.checkReceive(input, day));
        const id = `${itemId}|${input.lotNumber.trim().toLowerCase()}`;
        if (taken.has(id)) return refuse('lotExists');
        taken.add(id);
        lots.push({ id: deps.newId('lot'), itemId, lotNumber: input.lotNumber.trim(), expiresAt: input.expiresAt, quantity: input.quantity * (catalog.find((c) => c.id === itemId)?.stock?.perUnit ?? 1) });
      }
      for (const item of made.values()) await u.insert(catalogRef, item, { action: 'catalog:save' });
      for (const lot of lots) {
        await u.insert(lotsRef, lot, { action: 'stock:receive' });
        await u.insert(movementsRef, { id: deps.newId('mov'), at: u.now.toISOString(), by: u.ctx.actor.name, itemId: lot.itemId, lotId: lot.id, delta: lot.quantity, kind: 'receive', reason: 'Importation' }, { action: 'stock:movement' });
      }
      return { count: lots.length, created: made.size };
    }),

    /**
     * Crée ou modifie un produit avec son conditionnement : unité principale (boîte), unité de base (comprimé) et autres unités
     * de vente (sachet…), chacune avec son prix. Les unités dérivées sont des articles du catalogue qui puisent dans le même stock.
     */
    saveProduct: (input: { item: CatalogItem; packaging: PackagingInput }): Promise<CatalogItem> => deps.run(async (u) => {
      deps.require(P.pharmacy.catalog);
      const pack = checkPackaging(input.packaging);
      const row = input.item;
      if (row.category !== 'pharmacy') return refuse('itemNotInCatalog');
      if (!(row.price.minor >= 0)) return refuse('amountInvalid');
      const label = row.label.trim().replace(/\s+/g, ' ');
      if (label.length < 2 || label.length > 120) return refuse('catalogLabelLength');
      if (!/^[A-Z0-9-]{2,20}$/.test(row.code)) return refuse('catalogCodeInvalid');
      const everything = await u.list(catalogRef);
      const others = everything.filter((i) => i.id !== row.id);
      if (others.some((i) => i.code.toUpperCase() === row.code.toUpperCase())) return refuse('catalogCodeTaken');
      if (others.some((i) => i.category === 'pharmacy' && labelKey(i.label) === labelKey(label))) return refuse('catalogLabelTaken');
      const previous = everything.find((i) => i.id === row.id);
      const before = previous?.stock?.perUnit ?? 1;
      if (before !== pack.perPack) {
        // Changer le contenu d'une boîte fausserait les quantités déjà en stock : on exige un stock vide.
        const stocked = (await u.list(lotsRef)).some((l) => l.itemId === row.id && l.quantity > 0);
        if (stocked) return refuse('packagingLocked');
      }
      const saved: CatalogItem = {
        ...row, label,
        ...(pack.perPack > 1 ? { stock: { itemId: row.id, perUnit: pack.perPack }, unit: pack.unit, baseUnit: pack.baseUnit } : { stock: undefined, unit: undefined, baseUnit: undefined }),
      };
      const clean = Object.fromEntries(Object.entries(saved).filter(([, v]) => v !== undefined)) as unknown as CatalogItem;
      await u.put(catalogRef, clean, { action: 'catalog:save' });
      // Unités dérivées : mises à jour ou créées ; une unité retirée est désactivée (jamais supprimée : l'historique la référence).
      const currency = row.price.currency;
      const wanted = pack.extras.map((e) => ({ ...e, id: e.id ?? `${row.id}~${deps.newId('u').slice(-6)}`, minor: Math.round(e.price * 10 ** decimalsOf(currency)) }));
      const taken = new Set(others.map((i) => i.code.toUpperCase()).concat(clean.code.toUpperCase()));
      const existingDerived = everything.filter((i) => i.stock && i.stock.itemId === row.id && i.id !== row.id);
      for (const old of existingDerived) taken.delete(old.code.toUpperCase());
      for (const d of deriveUnits(clean, wanted, taken)) {
        const old = existingDerived.find((x) => x.id === d.id);
        await u.put(catalogRef, old ? { ...d, code: old.code } : d, { action: 'catalog:save' });
      }
      for (const old of existingDerived) if (!wanted.some((w) => w.id === old.id) && old.active) await u.put(catalogRef, { ...old, active: false }, { action: 'catalog:save' });
      return clean;
    }),

    /** Correction d'inventaire : motif obligatoire, mouvement tracé, jamais de stock négatif. */
    adjust: (input: { lotId: string; delta: number; reason: string }): Promise<StockLot> => deps.run(async (u) => {
      deps.require(P.inventory.adjust);
      const lot = await u.get(lotsRef, input.lotId);
      if (!lot) return refuse('lotNotFound');
      wrap(() => R.checkAdjust(lot, input.delta, input.reason));
      const next = { ...lot, quantity: lot.quantity + input.delta };
      await u.update(lotsRef, lot.id, () => next, { action: 'stock:adjust', reason: input.reason });
      await u.insert(movementsRef, { id: deps.newId('mov'), at: u.now.toISOString(), by: u.ctx.actor.name, itemId: lot.itemId, lotId: lot.id, delta: input.delta, kind: 'adjust', reason: input.reason.trim() }, { action: 'stock:movement' });
      return next;
    }),
  };
}
export type PharmacyService = ReturnType<typeof createPharmacyService>;
