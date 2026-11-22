import { assertPermission } from '@/core/local/session';
import { runUnit } from '@/core/local/unit-of-work';
import { finance, patientsRef } from '../finance/finance';
import { referenceFromApi } from '../_shared/reference-data';
import { apiLab } from './lab-api';
import { createLabService } from './lab-service';

/** Service laboratoire du mode local : la demande et sa facture sont écrites dans la même transaction. */
const localLab = createLabService(
  {
    run: (fn) => runUnit(fn),
    require: assertPermission,
    patient: (unit, id) => unit.get(patientsRef, id),
    newId: (prefix) => `${prefix}-${globalThis.crypto.randomUUID().slice(0, 12)}`,
    day: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  },
  finance,
);

/** Mode API : le serveur fait foi. Mode local : le service transactionnel du navigateur. Choix fait à chaque appel. */
export const lab: typeof localLab = new Proxy(localLab, {
  get: (target, key: string) => (referenceFromApi() ? (apiLab as Record<string, unknown>)[key] : (target as Record<string, unknown>)[key]),
});
