import { assertPermission } from '@/core/local/session';
import { runUnit } from '@/core/local/unit-of-work';
import { finance, patientsRef } from '../finance/finance';
import { createPharmacyService } from './pharmacy-service';

/** Service pharmacie du mode local : dispensation, facture et sortie de stock dans la même transaction. */
export const pharmacy = createPharmacyService(
  {
    run: (fn) => runUnit(fn),
    require: assertPermission,
    patient: (unit, id) => unit.get(patientsRef, id),
    newId: (prefix) => `${prefix}-${globalThis.crypto.randomUUID().slice(0, 12)}`,
    day: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  },
  finance,
);
