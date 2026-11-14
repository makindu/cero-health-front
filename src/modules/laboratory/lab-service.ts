import type { Unit } from '@/core/local/unit-of-work';
import { defineCollection } from '@/core/local/unit-of-work';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { BusinessRuleError } from '../_shared/business-error';
import { catalogRef } from '../finance/collections';
import type { FinanceDeps, FinanceService, InvoiceView } from '../finance/finance-service';
import * as R from './lab-rules';
import { LabError, type LabOrder, type LabPriority, type LabResultValue, type LabTestLine } from './lab-rules';

export const LAB_COLLECTION = 'health-lab-orders-local';
export const labOrdersRef = defineCollection<LabOrder>(LAB_COLLECTION);

export interface LabOrderView {
  order: LabOrder;
  invoice?: InvoiceView;
  /** Le prélèvement est-il autorisé du point de vue du paiement ? */
  paymentCleared: boolean;
  paymentState: 'paid' | 'unpaid' | 'credit' | 'exception' | 'invoiceCancelled';
}

function wrap<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof LabError) throw new BusinessRuleError(`lab.${e.code}`, e.params, e.code === 'wrongStatus' ? 'conflict' : 'validation');
    throw e;
  }
}
const refuse = (code: string, kind: 'validation' | 'conflict' = 'validation'): never => {
  throw new BusinessRuleError(`lab.${code}`, {}, kind);
};

export function createLabService(deps: FinanceDeps, finance: FinanceService) {
  const gateFor = (view: InvoiceView | undefined): R.PaymentGate => ({
    patientBalance: view ? view.balances.patientBalance : Number.MAX_SAFE_INTEGER,
    creditAuthorized: Boolean(view?.invoice.credit),
    cancelledInvoice: !view || view.status === 'cancelled',
  });

  async function toView(u: Unit, order: LabOrder): Promise<LabOrderView> {
    const invoice = await finance.inUnit.invoiceState(u, order.invoiceId);
    const gate = gateFor(invoice);
    const cleared = R.paymentCleared(order, gate);
    const state: LabOrderView['paymentState'] = gate.cancelledInvoice ? 'invoiceCancelled' : gate.patientBalance <= 0 ? 'paid' : gate.creditAuthorized ? 'credit' : order.paymentException ? 'exception' : 'unpaid';
    return { order, invoice, paymentCleared: cleared, paymentState: state };
  }

  async function load(u: Unit, id: string): Promise<LabOrder> {
    const order = await u.get(labOrdersRef, id);
    if (!order) refuse('notFound');
    return order!;
  }

  const save = async (u: Unit, next: LabOrder, action: string, reason?: string) => {
    await u.update(labOrdersRef, next.id, () => next, { action, reason });
    return toView(u, next);
  };

  return {
    list: (): Promise<LabOrderView[]> => deps.run(async (u) => {
      const orders = (await u.list(labOrdersRef)).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
      return Promise.all(orders.map((o) => toView(u, o)));
    }),

    /** Examens facturables du catalogue (catégorie laboratoire, actifs). */
    catalog: (): Promise<{ id: string; code: string; label: string }[]> => deps.run(async (u) =>
      (await u.list(catalogRef)).filter((c) => c.category === 'laboratory' && c.active).map((c) => ({ id: c.id, code: c.code, label: c.label }))),

    /** Demande d'examens + facture (tarification complète) dans UNE transaction : les deux existent ou aucune. */
    order: (input: { patientId: string; testItemIds: string[]; priority: LabPriority; clinicalNote: string; consultationId?: string; primaryCoverageId?: string; secondaryCoverageId?: string }): Promise<LabOrderView> => deps.run(async (u) => {
      deps.require(P.laboratory.order);
      if (input.testItemIds.length === 0) refuse('testsRequired');
      if (new Set(input.testItemIds).size !== input.testItemIds.length) refuse('duplicateTest');
      const patient = await deps.patient(u, input.patientId);
      if (!patient) refuse('patientNotFound');
      if (patient!.mergedInto) refuse('patientMerged');
      const catalog = await u.list(catalogRef);
      const tests: LabTestLine[] = input.testItemIds.map((id) => {
        const item = catalog.find((c) => c.id === id && c.category === 'laboratory');
        if (!item) refuse('testNotInCatalog');
        if (!item!.active) refuse('testInactive');
        return { code: item!.code, label: item!.label, catalogItemId: item!.id };
      });
      const existing = await u.list(labOrdersRef);
      const orderId = deps.newId('lab');
      const invoice = await finance.inUnit.createInvoice(u, {
        patientId: input.patientId,
        lines: tests.map((t) => ({ itemId: t.catalogItemId, quantity: 1 })),
        sources: tests.map((t) => ({ module: 'laboratory', ref: `${orderId}:${t.code}` })),
        primaryCoverageId: input.primaryCoverageId, secondaryCoverageId: input.secondaryCoverageId, episodeId: input.consultationId,
      });
      const order = wrap(() => R.buildOrder({
        id: orderId, number: R.nextLabNumber(existing, Number(deps.day(u.now).slice(0, 4))), patientId: input.patientId, patientName: patient!.fullName,
        consultationId: input.consultationId, tests, priority: input.priority, clinicalNote: input.clinicalNote, by: u.ctx.actor.name, now: u.now.toISOString(), invoiceId: invoice.invoice.id,
      }));
      await u.insert(labOrdersRef, order, { action: 'lab:order' });
      return toView(u, order);
    }),

    grantPaymentException: (input: { orderId: string; reason: string }): Promise<LabOrderView> => deps.run(async (u) => {
      deps.require(P.laboratory.exception);
      const order = await load(u, input.orderId);
      return save(u, wrap(() => R.grantException(order, { by: u.ctx.actor.name, now: u.now.toISOString(), reason: input.reason })), 'lab:payment-exception', input.reason);
    }),

    collect: (input: { orderId: string; sampleNote: string }): Promise<LabOrderView> => deps.run(async (u) => {
      deps.require(P.laboratory.collect);
      const order = await load(u, input.orderId);
      const view = await toView(u, order);
      return save(u, wrap(() => R.collect(order, { by: u.ctx.actor.name, now: u.now.toISOString(), sampleNote: input.sampleNote }, gateFor(view.invoice))), 'lab:collect');
    }),

    start: (input: { orderId: string }): Promise<LabOrderView> => deps.run(async (u) => {
      deps.require(P.laboratory.resultsEnter);
      const order = await load(u, input.orderId);
      return save(u, wrap(() => R.start(order, { by: u.ctx.actor.name, now: u.now.toISOString() })), 'lab:start');
    }),

    enterResults: (input: { orderId: string; values: LabResultValue[] }): Promise<LabOrderView> => deps.run(async (u) => {
      deps.require(P.laboratory.resultsEnter);
      const order = await load(u, input.orderId);
      return save(u, wrap(() => R.enterResults(order, input.values, { by: u.ctx.actor.name, now: u.now.toISOString() })), 'lab:results');
    }),

    reopenResults: (input: { orderId: string }): Promise<LabOrderView> => deps.run(async (u) => {
      deps.require(P.laboratory.resultsEnter);
      const order = await load(u, input.orderId);
      return save(u, wrap(() => R.reopenResults(order)), 'lab:reopen');
    }),

    validate: (input: { orderId: string }): Promise<LabOrderView> => deps.run(async (u) => {
      deps.require(P.laboratory.resultsValidate);
      const order = await load(u, input.orderId);
      return save(u, wrap(() => R.validate(order, { by: u.ctx.actor.name, now: u.now.toISOString() })), 'lab:validate');
    }),

    amend: (input: { orderId: string; values: LabResultValue[]; reason: string }): Promise<LabOrderView> => deps.run(async (u) => {
      deps.require(P.laboratory.resultsValidate);
      const order = await load(u, input.orderId);
      return save(u, wrap(() => R.amend(order, input.values, { by: u.ctx.actor.name, now: u.now.toISOString(), reason: input.reason })), 'lab:amend', input.reason);
    }),

    /** Annulation avant prélèvement. La facture est annulée dans la même transaction si rien n'a été payé ; sinon le remboursement reste à faire en caisse. */
    cancel: (input: { orderId: string; reason: string }): Promise<LabOrderView> => deps.run(async (u) => {
      deps.require(P.laboratory.order);
      const order = await load(u, input.orderId);
      const view = await toView(u, order);
      const paid = (view.invoice?.balances.patientPaid ?? 0) > 0;
      const next = wrap(() => R.cancel(order, { by: u.ctx.actor.name, now: u.now.toISOString(), reason: input.reason, refundPending: paid }));
      if (view.invoice && view.invoice.status !== 'cancelled' && !paid) await finance.inUnit.cancelInvoice(u, { invoiceId: order.invoiceId, reason: `${order.number} : ${input.reason}` });
      return save(u, next, 'lab:cancel', input.reason);
    }),
  };
}

export type LabService = ReturnType<typeof createLabService>;
