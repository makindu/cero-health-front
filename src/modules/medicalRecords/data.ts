import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { isoDay } from '@/utils/dates';
import { createResourceService } from '../_shared/resource-service';
import { SERVICE_KEYS, demoPerson, pick, type ServiceKey } from '../_shared/demo-people';

export type RecordStatus = 'active' | 'archived' | 'locked';
export type Completeness = 'complete' | 'partial' | 'incomplete';

export interface MedicalRecord {
  id: string;
  patientId: string;
  patientName: string;
  service: ServiceKey;
  openedAt: string;
  lastUpdate: string;
  status: RecordStatus;
  completeness: Completeness;
  /** Nombre d'éléments par section : indication administrative, SANS contenu clinique. */
  counts: { consultations: number; prescriptions: number; labOrders: number; documents: number };
}

/** FICTIF. Aucun contenu clinique : uniquement des métadonnées administratives. */
export const DEMO_RECORDS: readonly MedicalRecord[] = Array.from({ length: 24 }, (_, i) => {
  const person = demoPerson(i);
  return {
    id: `DEMO-D-${String(i + 1).padStart(3, '0')}`,
    patientId: person.id,
    patientName: person.fullName,
    service: pick(SERVICE_KEYS, i),
    openedAt: isoDay(-300 + i * 9),
    lastUpdate: isoDay(-(i % 30)),
    status: pick<RecordStatus>(['active', 'active', 'active', 'archived', 'locked'], i),
    completeness: pick<Completeness>(['complete', 'partial', 'incomplete', 'complete'], i),
    counts: { consultations: (i % 6) + 1, prescriptions: i % 5, labOrders: i % 4, documents: (i * 2) % 7 },
  };
});

export const recordService = createResourceService<MedicalRecord>({
  source: 'health',
  endpoint: HEALTH_ENDPOINTS.medicalRecords.collection,
  demoRows: DEMO_RECORDS,
  searchText: (r) => `${r.patientName} ${r.patientId} ${r.id}`,
});
