import { assertPermission } from '@/core/local/session';
import { runUnit } from '@/core/local/unit-of-work';
import { patientsRef } from '../finance/finance';
import { referenceFromApi } from '../_shared/reference-data';
import { rxApi } from './rx-api';
import { createRxService, type RxService } from './rx-service';

/** Service prescriptions du mode local. Prescrire n'est pas dispenser : la dispensation vient avec la pharmacie. */
const localRx = createRxService({
  run: (fn) => runUnit(fn),
  require: assertPermission,
  patient: (unit, id) => unit.get(patientsRef, id),
  newId: (prefix) => `${prefix}-${globalThis.crypto.randomUUID().slice(0, 12)}`,
  day: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
});

/** API réelle quand elle est configurée (hors mode local), sinon le service local. */
export const rx: RxService = {
  list: () => (referenceFromApi() ? rxApi.list() : localRx.list()),
  create: (input) => (referenceFromApi() ? rxApi.create(input) : localRx.create(input)),
  validate: (input) => (referenceFromApi() ? rxApi.validate(input) : localRx.validate(input)),
  cancel: (input) => (referenceFromApi() ? rxApi.cancel(input) : localRx.cancel(input)),
};
