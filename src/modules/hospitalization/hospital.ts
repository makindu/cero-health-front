import { assertPermission } from '@/core/local/session';
import { runUnit } from '@/core/local/unit-of-work';
import { finance, patientsRef } from '../finance/finance';
import type { FinanceDeps } from '../finance/finance-service';
import { createAccountService } from './account-service';
import { createHospitalService } from './hospital-service';

/** Service d'hospitalisation du mode local : admission et occupation du lit sont atomiques. */
const deps: FinanceDeps = {
  run: (fn) => runUnit(fn),
  require: assertPermission,
  patient: (unit, id) => unit.get(patientsRef, id),
  newId: (prefix) => `${prefix}-${globalThis.crypto.randomUUID().slice(0, 12)}`,
  day: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
};

export const hospital = createHospitalService(deps);
/** Compte hospitalier : jours de chambre facturés via le moteur de prix, sortie conditionnée au solde. */
export const hospitalAccount = createAccountService(deps, finance);
