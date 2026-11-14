import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { isoAt } from '@/utils/dates';
import { createResourceService } from '../_shared/resource-service';
import { SERVICE_KEYS, demoPerson, pick, staffFor } from '../_shared/demo-people';

export type PrescriptionStatus = 'toValidate' | 'validated' | 'dispensed' | 'cancelled';

export interface PrescriptionItem {
  label: string;
  quantity: number;
}

export interface Prescription {
  id: string;
  patientId: string;
  patientName: string;
  practitioner: string;
  date: string;
  status: PrescriptionStatus;
  items: PrescriptionItem[];
}

/** FICTIF : articles génériques, SANS posologie ni indication thérapeutique. */
export const DEMO_PRESCRIPTIONS: readonly Prescription[] = Array.from({ length: 26 }, (_, i) => {
  const person = demoPerson((i * 5 + 1) % 24);
  return {
    id: `DEMO-R-${String(i + 1).padStart(3, '0')}`,
    patientId: person.id,
    patientName: person.fullName,
    practitioner: staffFor(pick(SERVICE_KEYS, i)),
    date: isoAt(-(i % 10), 9 + (i % 7)),
    status: pick<PrescriptionStatus>(['toValidate', 'validated', 'dispensed', 'validated', 'dispensed', 'cancelled'], i),
    items: Array.from({ length: 1 + (i % 3) }, (_, n) => ({
      label: `Article démo ${String(((i + n * 7) % 30) + 1).padStart(2, '0')}`,
      quantity: 1 + ((i + n) % 3),
    })),
  };
});

export const prescriptionService = createResourceService<Prescription>({
  source: 'health',
  endpoint: HEALTH_ENDPOINTS.prescriptions.collection,
  demoRows: DEMO_PRESCRIPTIONS,
  searchText: (p) => `${p.patientName} ${p.patientId} ${p.practitioner} ${p.id}`,
  sortValue: (p, column) => String((p as unknown as Record<string, unknown>)[column] ?? ''),
});
