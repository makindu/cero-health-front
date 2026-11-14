import { assertPermission } from '@/core/local/session';
import { runUnit } from '@/core/local/unit-of-work';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { appointmentRepo } from '../appointments/data';
import { consultationRepo } from '../consultations/data';
import { invoicesRef, ledgerRef } from '../finance/collections';
import { admissionsRef } from '../hospitalization/collections';
import { labOrdersRef } from '../laboratory/lab-service';
import { triageRepo } from '../nursing/data';
import { patientRepo } from '../patients/data';
import { dispensationsRef } from '../pharmacy/collections';
import { rxRef } from '../prescriptions/rx-service';
import * as R from './flow-rules';

export interface FlowSnapshot {
  now: string;
  events: R.FlowEvent[];
  board: R.FlowRow[];
}

/**
 * Lecture seule : rassemble les événements datés de tous les modules de l'établissement actif.
 * Aucune écriture, aucune donnée clinique (ni diagnostic, ni observation, ni résultat).
 * Visible de tous les rôles du mode local (permission du tableau de bord) : ce ne sont que des noms, des lieux et des heures.
 */
export const patientFlow = {
  async snapshot(): Promise<FlowSnapshot> {
    assertPermission(P.dashboard.view);
    const now = new Date();
    const [appointments, triage, consultations, patients, unit] = await Promise.all([
      appointmentRepo.list(), triageRepo.list(), consultationRepo.list(), patientRepo.list(),
      runUnit(async (u) => ({
        rx: await u.list(rxRef), lab: await u.list(labOrdersRef), dispensations: await u.list(dispensationsRef),
        invoices: await u.list(invoicesRef), payments: await u.list(ledgerRef), admissions: await u.list(admissionsRef),
      })),
    ]);
    const events = R.buildEvents({
      appointments, triage, consultations, ...unit,
      names: new Map(patients.map((p) => [p.id, p.fullName])),
    });
    return { now: now.toISOString(), events, board: R.buildBoard(events, unit.admissions, now) };
  },
};
