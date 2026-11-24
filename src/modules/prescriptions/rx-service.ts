import { defineCollection } from '@/core/local/unit-of-work';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { BusinessRuleError } from '../_shared/business-error';
import type { FinanceDeps } from '../finance/finance-service';
import { dispensationsRef } from '../pharmacy/collections';
import * as R from './rx-rules';
import { RxError, type Rx, type RxItem } from './rx-rules';

export const RX_COLLECTION = 'health-prescriptions-local';
export const rxRef = defineCollection<Rx>(RX_COLLECTION);

function wrap<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof RxError) throw new BusinessRuleError(`rx.${e.code}`, e.params, e.code === 'wrongStatus' ? 'conflict' : 'validation');
    throw e;
  }
}
const refuse = (code: string): never => {
  throw new BusinessRuleError(`rx.${code}`, {}, 'validation');
};

export function createRxService(deps: FinanceDeps) {
  return {
    list: (): Promise<Rx[]> => deps.run(async (u) => (await u.list(rxRef)).sort((a, b) => b.prescribedAt.localeCompare(a.prescribedAt))),

    create: (input: { patientId: string; items: RxItem[]; note: string; consultationId?: string; visitId?: string }): Promise<Rx> => deps.run(async (u) => {
      deps.require(P.prescriptions.create);
      const patient = await deps.patient(u, input.patientId);
      if (!patient) refuse('patientNotFound');
      if (patient!.mergedInto) refuse('patientMerged');
      const existing = await u.list(rxRef);
      const rx = wrap(() => R.buildRx({
        id: deps.newId('rx'), number: R.nextRxNumber(existing, Number(deps.day(u.now).slice(0, 4))), patientId: input.patientId, patientName: patient!.fullName,
        consultationId: input.consultationId?.trim() || undefined, items: input.items, note: input.note, by: u.ctx.actor.name, byId: u.ctx.actor.id, now: u.now.toISOString(),
      }));
      await u.insert(rxRef, rx, { action: 'rx:create' });
      return rx;
    }),

    validate: (input: { id: string }): Promise<Rx> => deps.run(async (u) => {
      deps.require(P.prescriptions.validate);
      const rx = await u.get(rxRef, input.id);
      if (!rx) return refuse('notFound');
      const next = wrap(() => R.validateRx(rx, { by: u.ctx.actor.name, now: u.now.toISOString() }));
      await u.update(rxRef, rx.id, () => next, { action: 'rx:validate' });
      return next;
    }),

    /** Annulation par le prescripteur ou par la pharmacie (motif obligatoire, tracé). */
    cancel: (input: { id: string; reason: string }): Promise<Rx> => deps.run(async (u) => {
      try { deps.require(P.prescriptions.create); } catch { deps.require(P.prescriptions.validate); }
      const rx = await u.get(rxRef, input.id);
      if (!rx) return refuse('notFound');
      if ((await u.list(dispensationsRef)).some((d) => d.prescriptionId === rx.id && d.status !== 'cancelled')) return refuse('hasDispensation');
      const next = wrap(() => R.cancelRx(rx, { by: u.ctx.actor.name, now: u.now.toISOString(), reason: input.reason }));
      await u.update(rxRef, rx.id, () => next, { action: 'rx:cancel', reason: input.reason });
      return next;
    }),
  };
}
export type RxService = ReturnType<typeof createRxService>;
