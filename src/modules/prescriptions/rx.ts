import { assertPermission } from '@/core/local/session';
import { runUnit } from '@/core/local/unit-of-work';
import { patientsRef } from '../finance/finance';
import { createRxService } from './rx-service';

/** Service prescriptions du mode local. Prescrire n'est pas dispenser : la dispensation vient avec la pharmacie. */
export const rx = createRxService({
  run: (fn) => runUnit(fn),
  require: assertPermission,
  patient: (unit, id) => unit.get(patientsRef, id),
  newId: (prefix) => `${prefix}-${globalThis.crypto.randomUUID().slice(0, 12)}`,
  day: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
});
