import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { BusinessRuleError } from '../_shared/business-error';
import { catalogRef } from '../finance/collections';
import type { FinanceDeps, FinanceService, InvoiceView } from '../finance/finance-service';
import { rxRef } from '../prescriptions/rx-service';
import { markRxDispensed, type Rx } from '../prescriptions/rx-rules';
import { dispensationsRef, lotsRef, movementsRef } from './collections';
import * as R from './pharmacy-rules';
import { PharmacyError, type Dispensation, type StockLot, type StockMovement } from './pharmacy-rules';
import { round2 } from '@/utils/numbers';

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
  paymentState: 'paid' | 'unpaid' | 'credit' | 'exception' | 'invoiceCancelled';
}
export interface QueueRow {
  prescription: Rx;
  remaining: number[];
}
export interface StockItemView {
  itemId: string;
  label: string;
  code: string;
  total: number;
  usable: number;
  lots: StockLot[];
}

export function createPharmacyService(deps: FinanceDeps, finance: FinanceService) {
  const gateFor = (view: InvoiceView | undefined): R.PaymentGate => ({
    patientBalance: view ? view.balances.patientBalance : Number.MAX_SAFE_INTEGER,
    creditAuthorized: Boolean(view?.invoice.credit),
    cancelledInvoice: !view || view.status === 'cancelled',
  });

  async function toView(u: Parameters<Parameters<FinanceDeps['run']>[0]>[0], d: Dispensation): Promise<DispensationView> {
    const invoice = await finance.inUnit.invoiceState(u, d.invoiceId);
    const gate = gateFor(invoice);
    const state: DispensationView['paymentState'] = gate.cancelledInvoice ? 'invoiceCancelled' : gate.patientBalance <= 0 ? 'paid' : gate.creditAuthorized ? 'credit' : d.paymentException ? 'exception' : 'unpaid';
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
      const items = catalog.filter((c) => c.category === 'pharmacy').map((c) => {
        const mine = lots.filter((l) => l.itemId === c.id);
        return { itemId: c.id, label: c.label, code: c.code, total: mine.reduce((s, l) => s + l.quantity, 0), usable: R.available(lots, c.id, day), lots: mine };
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
        if (R.available(lots, l.itemId, day) < l.quantity) throw new BusinessRuleError('pharmacy.insufficientStock', { available: R.available(lots, l.itemId, day) }, 'conflict');
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
      wrap(() => R.markDispensed(d, d.lines, { by: u.ctx.actor.name, now }, gateFor(invoice))); // paiement et statut vérifiés avant toute sortie de stock
      const lots = await u.list(lotsRef);
      const working = lots.map((l) => ({ ...l }));
      const moves: StockMovement[] = [];
      const lines = d.lines.map((line) => {
        const alloc = wrap(() => R.allocateFefo(working, line.itemId, line.quantity, day));
        for (const a of alloc) {
          const lot = working.find((l) => l.id === a.lotId)!;
          lot.quantity = round2(lot.quantity - a.quantity);
          moves.push({ id: deps.newId('mov'), at: now, by: u.ctx.actor.name, itemId: line.itemId, lotId: a.lotId, delta: -a.quantity, kind: 'dispense', ref: `${d.number}` });
        }
        return { ...line, lots: alloc };
      });
      const next = wrap(() => R.markDispensed(d, lines, { by: u.ctx.actor.name, now }, gateFor(invoice)));
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
      wrap(() => R.checkReceive(input, deps.day(u.now)));
      const lots = await u.list(lotsRef);
      if (lots.some((l) => l.itemId === input.itemId && l.lotNumber.trim().toLowerCase() === input.lotNumber.trim().toLowerCase())) return refuse('lotExists');
      const lot: StockLot = { id: deps.newId('lot'), itemId: input.itemId, lotNumber: input.lotNumber.trim(), expiresAt: input.expiresAt, quantity: input.quantity };
      await u.insert(lotsRef, lot, { action: 'stock:receive' });
      await u.insert(movementsRef, { id: deps.newId('mov'), at: u.now.toISOString(), by: u.ctx.actor.name, itemId: lot.itemId, lotId: lot.id, delta: lot.quantity, kind: 'receive' }, { action: 'stock:movement' });
      return lot;
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
