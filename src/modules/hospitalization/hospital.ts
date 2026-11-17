import { assertPermission } from '@/core/local/session';
import { runUnit } from '@/core/local/unit-of-work';
import { finance, patientsRef } from '../finance/finance';
import type { FinanceDeps } from '../finance/finance-service';
import { createAccountService } from './account-service';
import { createHospitalService } from './hospital-service';
import { createVisitService } from './visit-service';

/** Service d'hospitalisation du mode local : admission et occupation du lit sont atomiques. */
const deps: FinanceDeps = {
  run: (fn) => runUnit(fn),
  require: assertPermission,
  patient: (unit, id) => unit.get(patientsRef, id),
  newId: (prefix) => `${prefix}-${globalThis.crypto.randomUUID().slice(0, 12)}`,
  day: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
};

/** Visites (tour de salle) et consommations : registre en ajout seul, contre-écritures, facturation automatique à la sortie. */
export const visits = createVisitService(deps, finance);

export const hospital = createHospitalService(deps, {
  beforeCancel: visits.inUnit.assertCanCancel,
  afterDischargeRequest: (admissionId) => visits.autoBill(admissionId),
});
/** Compte hospitalier : jours de chambre facturés via le moteur de prix, sortie conditionnée au solde. */
export const hospitalAccount = createAccountService(deps, finance, { beforeDischarge: (admissionId) => visits.autoBill(admissionId) });
