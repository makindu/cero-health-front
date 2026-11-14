import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { isoDay } from '@/utils/dates';
import { createResourceService } from '../_shared/resource-service';
import { demoPerson, pick, staffFor, type ServiceKey } from '../_shared/demo-people';

export type BedStatus = 'free' | 'occupied' | 'cleaning' | 'maintenance';
export type AdmissionStatus = 'admitted' | 'dischargePending' | 'discharged';

export interface Bed {
  id: string;
  ward: ServiceKey;
  room: string;
  label: string;
  status: BedStatus;
  patientName: string | null;
}

export interface Admission {
  id: string;
  patientId: string;
  patientName: string;
  ward: ServiceKey;
  bed: string;
  admittedAt: string;
  expectedDischarge: string;
  attending: string;
  status: AdmissionStatus;
}

export const WARDS: readonly ServiceKey[] = ['generalMedicine', 'pediatrics', 'maternity', 'surgery'];

/** FICTIF : 4 services × 2 chambres × 3 lits. */
export const DEMO_BEDS: readonly Bed[] = WARDS.flatMap((ward, w) =>
  [1, 2].flatMap((room) =>
    [1, 2, 3].map((bed, b) => {
      const index = w * 6 + (room - 1) * 3 + b;
      const status = pick<BedStatus>(['occupied', 'free', 'occupied', 'cleaning', 'free', 'occupied', 'maintenance', 'occupied'], index);
      return {
        id: `DEMO-B-${String(index + 1).padStart(2, '0')}`,
        ward,
        room: `${w + 1}0${room}`,
        label: `${w + 1}0${room}-${bed}`,
        status,
        patientName: status === 'occupied' ? demoPerson((index * 3) % 24).fullName : null,
      };
    }),
  ),
);

/** FICTIF : une admission par lit occupé. */
export const DEMO_ADMISSIONS: readonly Admission[] = DEMO_BEDS.filter((b) => b.status === 'occupied').map((bed, i) => {
  const person = demoPerson(((DEMO_BEDS.indexOf(bed) * 3) % 24));
  return {
    id: `DEMO-H-${String(i + 1).padStart(3, '0')}`,
    patientId: person.id,
    patientName: person.fullName,
    ward: bed.ward,
    bed: bed.label,
    admittedAt: isoDay(-(i % 9) - 1),
    expectedDischarge: isoDay((i % 6) + 1),
    attending: staffFor(bed.ward),
    status: pick<AdmissionStatus>(['admitted', 'admitted', 'dischargePending', 'admitted'], i),
  };
});

export const bedService = createResourceService<Bed>({
  source: 'health',
  endpoint: HEALTH_ENDPOINTS.beds.collection,
  demoRows: DEMO_BEDS,
});

export const admissionService = createResourceService<Admission>({
  source: 'health',
  endpoint: HEALTH_ENDPOINTS.admissions.collection,
  demoRows: DEMO_ADMISSIONS,
  searchText: (a) => `${a.patientName} ${a.patientId} ${a.bed} ${a.id}`,
  sortValue: (a, column) => String((a as unknown as Record<string, unknown>)[column] ?? ''),
});
