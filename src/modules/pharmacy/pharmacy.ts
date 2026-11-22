import { assertPermission } from '@/core/local/session';
import { runUnit } from '@/core/local/unit-of-work';
import { finance, patientsRef } from '../finance/finance';
import { referenceFromApi } from '../_shared/reference-data';
import { apiPharmacy } from './pharmacy-api';
import { createPharmacyService } from './pharmacy-service';

/** Service pharmacie du mode local : dispensation, facture et sortie de stock dans la même transaction. */
const localPharmacy = createPharmacyService(
  {
    run: (fn) => runUnit(fn),
    require: assertPermission,
    patient: (unit, id) => unit.get(patientsRef, id),
    newId: (prefix) => `${prefix}-${globalThis.crypto.randomUUID().slice(0, 12)}`,
    day: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  },
  finance,
);

/** Mode API : le serveur fait foi (lots FEFO, paiement, stock UZISHA). Mode local : le service transactionnel du navigateur. */
export const pharmacy: typeof localPharmacy = new Proxy(localPharmacy, {
  get: (target, key: string) => (referenceFromApi() ? (apiPharmacy as Record<string, unknown>)[key] : (target as Record<string, unknown>)[key]),
});
