import { defineCollection } from '@/core/local/unit-of-work';
import type { Admission, Bed, Room, WardKey } from './hospital-rules';

export const HOSPITAL_COLLECTIONS = { rooms: 'health-hospital-rooms', beds: 'health-hospital-beds', admissions: 'health-hospital-admissions' } as const;

export const WARDS: readonly WardKey[] = ['generalMedicine', 'pediatrics', 'maternity', 'surgery'];

/** DONNÉES FICTIVES : 4 services × (1 chambre standard à 3 lits + 1 chambre privée à 1 lit). Tous les lits partent libres. */
export const ROOM_SEED: Room[] = WARDS.flatMap((ward, w) => [
  { id: `room-${w + 1}-1`, ward, code: `${w + 1}01`, kind: 'standard' as const, dailyItemId: 'cat-08' },
  { id: `room-${w + 1}-2`, ward, code: `${w + 1}02`, kind: 'private' as const, dailyItemId: 'cat-09' },
]);
export const BED_SEED: Bed[] = ROOM_SEED.flatMap((room) =>
  Array.from({ length: room.kind === 'standard' ? 3 : 1 }, (_, i) => ({ id: `${room.id.replace('room', 'bed')}-${i + 1}`, roomId: room.id, label: `${room.code}-${i + 1}`, status: 'free' as const })),
);

export const roomsRef = defineCollection<Room>(HOSPITAL_COLLECTIONS.rooms, ROOM_SEED);
export const bedsRef = defineCollection<Bed>(HOSPITAL_COLLECTIONS.beds, BED_SEED);
export const admissionsRef = defineCollection<Admission>(HOSPITAL_COLLECTIONS.admissions);
