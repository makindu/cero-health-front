import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { BusinessRuleError } from '../_shared/business-error';
import type { FinanceDeps, FinanceService, InvoiceView } from '../finance/finance-service';
import { admissionsRef, bedsRef, roomsRef } from './collections';
import * as R from './hospital-rules';
import { HospitalError, type Admission, type DischargeOutcome } from './hospital-rules';

function wrap<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof HospitalError) throw new BusinessRuleError(`hospital.${e.code}`, e.params, 'validation');
    throw e;
  }
}
const refuse = (code: string, params: Record<string, string | number> = {}, kind: 'validation' | 'conflict' = 'validation'): never => {
  throw new BusinessRuleError(`hospital.${code}`, params, kind);
};

export interface AccountView {
  admission: Admission;
  /** Factures du patient créées depuis l'admission (hors annulées). */
  invoices: InvoiceView[];
  currency: string;
  totals: { billable: number; patientShare: number; insurerShare: number; patientPaid: number; patientDue: number; organizationsOutstanding: number };
  /** Jours de chambre écoulés non encore facturés (séjour en cours), et ceux dus pour une sortie aujourd'hui. */
  unbilledNow: string[];
  unbilledForDischarge: string[];
  billedDayCount: number;
  /** Aucun solde patient dû (crédits autorisés = soldés). */
  patientCleared: boolean;
}

export interface AccountHooks {
  /** Avant la sortie, dans une unité séparée : facture les consommations en attente (jamais bloquant). */
  beforeDischarge?: (admissionId: string) => Promise<unknown>;
}

export function createAccountService(deps: FinanceDeps, finance: FinanceService, hooks: AccountHooks = {}) {
  async function build(u: Parameters<Parameters<FinanceDeps['run']>[0]>[0], adm: Admission): Promise<AccountView> {
    const today = deps.day(u.now);
    const dayOf = (iso: string) => deps.day(new Date(iso));
    const all = await finance.inUnit.patientInvoices(u, adm.patientId);
    const invoices = all.filter((v) => v.invoice.createdAt >= adm.admittedAt && v.status !== 'cancelled').sort((a, b) => a.invoice.createdAt.localeCompare(b.invoice.createdAt));
    const live = invoices.filter((v) => v.status !== 'draft');
    const dueOf = (v: InvoiceView) => (v.status === 'creditAuthorized' ? 0 : Math.max(0, v.balances.patientBalance));
    const totals = {
      billable: live.reduce((s, v) => s + v.invoice.totals.billable, 0),
      patientShare: live.reduce((s, v) => s + v.invoice.totals.patient, 0),
      insurerShare: live.reduce((s, v) => s + v.invoice.totals.insurer, 0),
      patientPaid: live.reduce((s, v) => s + v.balances.patientPaid, 0),
      patientDue: live.reduce((s, v) => s + dueOf(v), 0),
      organizationsOutstanding: live.reduce((s, v) => s + v.balances.organizationsOutstanding, 0),
    };
    return {
      admission: adm, invoices, currency: live[0]?.invoice.currency ?? 'USD', totals,
      unbilledNow: R.unbilledDays(adm, R.billableDays(adm, dayOf, today, false)).map((d) => d.day),
      unbilledForDischarge: R.unbilledDays(adm, R.billableDays(adm, dayOf, today, true)).map((d) => d.day),
      billedDayCount: Object.keys(adm.billedDays ?? {}).length,
      patientCleared: totals.patientDue <= 0,
    };
  }

  /** Crée UNE facture pour les jours de chambre non facturés ; chaque jour est une ligne avec sa source (aucune double facturation). */
  async function post(u: Parameters<Parameters<FinanceDeps['run']>[0]>[0], adm: Admission, forDischarge: boolean): Promise<Admission> {
    const today = deps.day(u.now);
    const dayOf = (iso: string) => deps.day(new Date(iso));
    const todo = R.unbilledDays(adm, R.billableDays(adm, dayOf, today, forDischarge));
    if (todo.length === 0) return refuse('nothingToPost');
    const rooms = await u.list(roomsRef);
    const lines = todo.map((d) => ({ itemId: rooms.find((r) => r.id === d.roomId)!.dailyItemId, quantity: 1 }));
    const inv = await finance.inUnit.createInvoice(u, {
      patientId: adm.patientId, lines, sources: todo.map((d) => ({ module: 'room', ref: `${adm.id}:${d.day}` })), episodeId: adm.id,
    });
    const next = R.markDaysBilled(adm, todo.map((d) => d.day), inv.invoice.id);
    await u.update(admissionsRef, adm.id, () => next, { action: 'admission:room-days' });
    return next;
  }

  return {
    account: (admissionId: string): Promise<AccountView> => deps.run(async (u) => {
      const adm = await u.get(admissionsRef, admissionId);
      if (!adm) return refuse('admissionNotFound');
      return build(u, adm);
    }),

    postRoomDays: (input: { admissionId: string; forDischarge?: boolean }): Promise<AccountView> => deps.run(async (u) => {
      deps.require(P.hospitalization.discharge);
      const adm = await u.get(admissionsRef, input.admissionId);
      if (!adm) return refuse('admissionNotFound');
      if (!R.isActive(adm)) return refuse('notActive', {}, 'conflict');
      return build(u, await post(u, adm, Boolean(input.forDischarge)));
    }),

    /**
     * Sortie effective, atomique : jours de chambre tous facturés, solde patient nul (ou crédit autorisé, ou exception motivée
     * et permissionnée), puis séjour fermé et lit en nettoyage. Le reste dû par les organismes ne bloque pas la sortie.
     */
    discharge: async (input: { admissionId: string; outcome: DischargeOutcome; note: string; exceptionReason?: string }): Promise<AccountView> => {
      deps.require(P.hospitalization.discharge);
      // Les consommations sont facturées AVANT la sortie, dans leur propre unité : la facture reste au compte même si la sortie est refusée (solde dû).
      await hooks.beforeDischarge?.(input.admissionId);
      return deps.run(async (u) => {
      const adm = await u.get(admissionsRef, input.admissionId);
      if (!adm) return refuse('admissionNotFound');
      if (!R.isActive(adm)) return refuse('notActive', {}, 'conflict');
      const account = await build(u, adm);
      if (account.unbilledForDischarge.length > 0) return refuse('roomDaysUnbilled', { count: account.unbilledForDischarge.length }, 'conflict');
      const reason = input.exceptionReason?.trim();
      if (!account.patientCleared) {
        if (!reason) return refuse('balanceDue', { due: (account.totals.patientDue / 100).toFixed(2), currency: account.currency }, 'conflict');
        deps.require(P.hospitalization.dischargeException);
      }
      const bedId = R.currentStay(adm)?.bedId;
      const next = wrap(() => R.dischargeAdmission(adm, { by: u.ctx.actor.name, now: u.now.toISOString(), outcome: input.outcome, note: input.note, exceptionReason: account.patientCleared ? undefined : reason }));
      await u.update(admissionsRef, adm.id, () => next, { action: 'admission:discharge', reason: account.patientCleared ? undefined : reason });
      if (bedId) await u.update(bedsRef, bedId, (b) => R.release(b), { action: 'bed:release' });
      return build(u, next);
      });
    },
  };
}
export type AccountService = ReturnType<typeof createAccountService>;
