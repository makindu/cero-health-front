import type { Unit } from '@/core/local/unit-of-work';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { BusinessRuleError } from '../_shared/business-error';
import type { FinanceDeps } from '../finance/finance-service';
import { admissionsRef, bedsRef, roomsRef } from './collections';
import * as R from './hospital-rules';
import { HospitalError, type Admission, type Bed, type Room } from './hospital-rules';

function wrap<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof HospitalError) throw new BusinessRuleError(`hospital.${e.code}`, e.params, ['wrongStatus', 'bedNotFree', 'bedOccupied', 'alreadyAdmitted', 'notActive'].includes(e.code) ? 'conflict' : 'validation');
    throw e;
  }
}
const refuse = (code: string): never => {
  throw new BusinessRuleError(`hospital.${code}`, {}, 'validation');
};

export interface BedView { bed: Bed; room: Room; admission?: Admission }

/** Points d'extension (visites et consommations) : branchés dans `hospital.ts`, absents des tests du seul plan des lits. */
export interface HospitalHooks {
  /** Dans l'unité d'annulation : peut refuser (ex. des consommations existent). */
  beforeCancel?: (u: Unit, admission: Admission) => Promise<void>;
  /** Après l'enregistrement de la demande de sortie, dans une unité séparée ; ne bloque jamais la demande. */
  afterDischargeRequest?: (admissionId: string) => Promise<unknown>;
}

export function createHospitalService(deps: FinanceDeps, hooks: HospitalHooks = {}) {
  const view = (beds: Bed[], rooms: Room[], adms: Admission[]): BedView[] =>
    beds.map((bed) => ({ bed, room: rooms.find((r) => r.id === bed.roomId)!, admission: bed.admissionId ? adms.find((a) => a.id === bed.admissionId) : undefined }))
      .sort((a, b) => a.bed.label.localeCompare(b.bed.label));

  return {
    board: (): Promise<{ beds: BedView[]; admissions: Admission[]; day: string }> => deps.run(async (u) => {
      const [beds, rooms, adms] = await Promise.all([u.list(bedsRef), u.list(roomsRef), u.list(admissionsRef)]);
      return { beds: view(beds, rooms, adms), admissions: adms.sort((a, b) => b.admittedAt.localeCompare(a.admittedAt)), day: deps.day(u.now) };
    }),

    /** Admission + occupation du lit dans la même transaction (jamais deux patients sur un lit, jamais deux admissions actives pour un patient). */
    admit: (input: { patientId: string; bedId: string; reason: string; attending: string; expectedDischarge?: string; consultationId?: string }): Promise<Admission> => deps.run(async (u) => {
      deps.require(P.hospitalization.create);
      const patient = await deps.patient(u, input.patientId);
      if (!patient) return refuse('patientNotFound');
      if (patient.mergedInto) return refuse('patientMerged');
      const [bed, adms] = await Promise.all([u.get(bedsRef, input.bedId), u.list(admissionsRef)]);
      const room = bed ? await u.get(roomsRef, bed.roomId) : undefined;
      wrap(() => R.checkAdmit(input, bed, adms.find((a) => a.patientId === input.patientId && R.isActive(a)), deps.day(u.now)));
      const adm = wrap(() => R.buildAdmission({
        id: deps.newId('adm'), number: R.nextNumber(adms, Number(deps.day(u.now).slice(0, 4))), patientId: input.patientId, patientName: patient.fullName,
        consultationId: input.consultationId?.trim() || undefined, bed: bed!, room: room!, reason: input.reason, attending: input.attending, expectedDischarge: input.expectedDischarge,
        by: u.ctx.actor.name, now: u.now.toISOString(),
      }));
      await u.insert(admissionsRef, adm, { action: 'admission:create' });
      await u.update(bedsRef, bed!.id, (b) => R.occupy(b, adm.id), { action: 'bed:occupy' });
      return adm;
    }),

    /** Changement de lit : l'ancien passe en nettoyage, le nouveau est occupé, l'historique des séjours est conservé. */
    transfer: (input: { admissionId: string; bedId: string; reason: string }): Promise<Admission> => deps.run(async (u) => {
      deps.require(P.hospitalization.assignBed);
      const adm = await u.get(admissionsRef, input.admissionId);
      if (!adm) return refuse('admissionNotFound');
      const newBed = await u.get(bedsRef, input.bedId);
      if (!newBed) return refuse('bedNotFound');
      const newRoom = (await u.get(roomsRef, newBed.roomId))!;
      const oldId = R.currentStay(adm)?.bedId;
      const next = wrap(() => R.transfer(adm, newBed, newRoom, { by: u.ctx.actor.name, now: u.now.toISOString(), reason: input.reason }));
      await u.update(admissionsRef, adm.id, () => next, { action: 'admission:transfer', reason: input.reason });
      if (oldId) await u.update(bedsRef, oldId, (b) => R.release(b), { action: 'bed:release' });
      await u.update(bedsRef, newBed.id, (b) => R.occupy(b, adm.id), { action: 'bed:occupy' });
      return next;
    }),

    /** Annulation d'une admission saisie par erreur : le lit passe en nettoyage. Motif obligatoire. */
    cancel: (input: { admissionId: string; reason: string }): Promise<Admission> => deps.run(async (u) => {
      deps.require(P.hospitalization.create);
      const adm = await u.get(admissionsRef, input.admissionId);
      if (!adm) return refuse('admissionNotFound');
      await hooks.beforeCancel?.(u, adm);
      const bedId = R.currentStay(adm)?.bedId;
      const next = wrap(() => R.cancelAdmission(adm, { by: u.ctx.actor.name, now: u.now.toISOString(), reason: input.reason }));
      await u.update(admissionsRef, adm.id, () => next, { action: 'admission:cancel', reason: input.reason });
      if (bedId) await u.update(bedsRef, bedId, (b) => R.release(b), { action: 'bed:release' });
      return next;
    }),

    /** Demande de sortie (le lit reste occupé). La sortie effective et le bilan financier sont traités avec le compte hospitalier. */
    requestDischarge: async (input: { admissionId: string; note: string }): Promise<Admission> => {
      const next = await deps.run(async (u) => {
        deps.require(P.hospitalization.discharge);
        const adm = await u.get(admissionsRef, input.admissionId);
        if (!adm) return refuse('admissionNotFound');
        const changed = wrap(() => R.requestDischarge(adm, { by: u.ctx.actor.name, now: u.now.toISOString(), note: input.note }));
        await u.update(admissionsRef, adm.id, () => changed, { action: 'admission:discharge-request' });
        return changed;
      });
      // Facturation automatique des consommations : dans une unité à part, la demande de sortie est déjà enregistrée quoi qu'il arrive.
      await hooks.afterDischargeRequest?.(input.admissionId);
      return next;
    },
    revokeDischarge: (input: { admissionId: string }): Promise<Admission> => deps.run(async (u) => {
      deps.require(P.hospitalization.discharge);
      const adm = await u.get(admissionsRef, input.admissionId);
      if (!adm) return refuse('admissionNotFound');
      const next = wrap(() => R.revokeDischarge(adm));
      await u.update(admissionsRef, adm.id, () => next, { action: 'admission:discharge-revoke' });
      return next;
    }),

    setBedState: (input: { bedId: string; to: 'free' | 'maintenance'; reason: string }): Promise<Bed> => deps.run(async (u) => {
      deps.require(P.hospitalization.assignBed);
      const bed = await u.get(bedsRef, input.bedId);
      if (!bed) return refuse('bedNotFound');
      const next = wrap(() => R.setBedState(bed, input.to, input.reason));
      await u.update(bedsRef, bed.id, () => next, { action: `bed:${input.to}`, reason: input.reason || undefined });
      return next;
    }),
  };
}
export type HospitalService = ReturnType<typeof createHospitalService>;
