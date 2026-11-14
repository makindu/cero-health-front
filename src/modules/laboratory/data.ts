import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { isoAt } from '@/utils/dates';
import { createResourceService } from '../_shared/resource-service';
import { SERVICE_KEYS, demoPerson, pick, staffFor } from '../_shared/demo-people';

export type LabStatus = 'requested' | 'collected' | 'inProgress' | 'resultEntered' | 'validated' | 'cancelled';
export type LabTest = 'cbc' | 'glucose' | 'malaria' | 'creatinine' | 'pregnancy' | 'urinalysis';

export interface LabOrder {
  id: string;
  patientId: string;
  patientName: string;
  requestedBy: string;
  requestedAt: string;
  priority: 'routine' | 'urgent';
  status: LabStatus;
  tests: LabTest[];
}

export const LAB_FLOW: readonly LabStatus[] = ['requested', 'collected', 'inProgress', 'resultEntered', 'validated'];
const TESTS: readonly LabTest[] = ['cbc', 'glucose', 'malaria', 'creatinine', 'pregnancy', 'urinalysis'];

/** FICTIF : demandes d'examens. AUCUN résultat ni valeur n'est fourni. */
export const DEMO_LAB_ORDERS: readonly LabOrder[] = Array.from({ length: 24 }, (_, i) => {
  const person = demoPerson((i * 7 + 3) % 24);
  return {
    id: `DEMO-L-${String(i + 1).padStart(3, '0')}`,
    patientId: person.id,
    patientName: person.fullName,
    requestedBy: staffFor(pick(SERVICE_KEYS, i)),
    requestedAt: isoAt(-(i % 8), 8 + (i % 8)),
    priority: i % 5 === 0 ? 'urgent' : 'routine',
    status: pick<LabStatus>(['requested', 'collected', 'inProgress', 'resultEntered', 'validated', 'validated', 'cancelled'], i),
    tests: Array.from({ length: 1 + (i % 3) }, (_, n) => pick(TESTS, i + n * 2)),
  };
});

export const labOrderService = createResourceService<LabOrder>({
  source: 'health',
  endpoint: HEALTH_ENDPOINTS.laboratory.orders,
  demoRows: DEMO_LAB_ORDERS,
  searchText: (o) => `${o.patientName} ${o.patientId} ${o.id}`,
  sortValue: (o, column) => String((o as unknown as Record<string, unknown>)[column] ?? ''),
});
