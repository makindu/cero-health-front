import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { assertPermission } from '@/core/local/session';
import { collectionNameFor } from '@/core/local/repository';
import { defineCollection, runUnit } from '@/core/local/unit-of-work';
import { patientsSeedForFinance, type PatientLite } from './patients-ref';
import { createFinanceService } from './finance-service';

const patientsRef = defineCollection<PatientLite>(collectionNameFor(HEALTH_ENDPOINTS.patients.collection), patientsSeedForFinance);

/** Jour civil de l'établissement : ici celui de l'appareil (le fuseau de l'établissement viendra de CERO ID CORE). */
const civilDay = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Service financier du mode local : écritures atomiques, permissions vérifiées dans le service (pas seulement dans l'interface). */
export const finance = createFinanceService({
  run: (fn) => runUnit(fn),
  require: assertPermission,
  patient: (unit, id) => unit.get(patientsRef, id),
  newId: (prefix) => `${prefix}-${globalThis.crypto.randomUUID().slice(0, 12)}`,
  day: civilDay,
});

export { patientsRef };
