/**
 * DONNÉES FICTIVES partagées par les jeux de démonstration (aucune personne réelle).
 * Chaque identifiant commence par « DEMO- » pour qu'il soit impossible de les confondre avec du réel.
 */

export type ServiceKey = 'generalMedicine' | 'pediatrics' | 'maternity' | 'emergency' | 'surgery';

export const SERVICE_KEYS: readonly ServiceKey[] = [
  'generalMedicine',
  'pediatrics',
  'maternity',
  'emergency',
  'surgery',
];

const FIRST_F = ['Amani', 'Neema', 'Zawadi', 'Imani', 'Tumaini', 'Furaha', 'Baraka', 'Upendo'];
const FIRST_M = ['Juma', 'Kito', 'Mosi', 'Pendo', 'Jabari', 'Sefu', 'Tabu', 'Ziwa'];
const LAST = ['Alpha', 'Bravo', 'Delta', 'Echo', 'Kilo', 'Lima', 'Sigma', 'Omega'];

export interface DemoPerson {
  id: string;
  fullName: string;
  sex: 'F' | 'M';
}

/** Personne fictive n°`index` (0-based), déterministe. */
export function demoPerson(index: number): DemoPerson {
  const sex = index % 2 === 0 ? 'F' : 'M';
  const first = (sex === 'F' ? FIRST_F : FIRST_M)[Math.floor(index / 2) % 8] ?? 'Demo';
  const last = LAST[(index * 3 + 1) % LAST.length] ?? 'Demo';
  return { id: `DEMO-P-${String(index + 1).padStart(3, '0')}`, fullName: `${first} ${last}`, sex };
}

export const DEMO_PATIENT_COUNT = 24;

export interface DemoStaff {
  id: string;
  name: string;
  service: ServiceKey;
}

export const DEMO_STAFF: readonly DemoStaff[] = [
  { id: 'DEMO-U-01', name: 'Dr Démo Un', service: 'generalMedicine' },
  { id: 'DEMO-U-02', name: 'Dr Démo Deux', service: 'pediatrics' },
  { id: 'DEMO-U-03', name: 'Dr Démo Trois', service: 'maternity' },
  { id: 'DEMO-U-04', name: 'Dr Démo Quatre', service: 'emergency' },
  { id: 'DEMO-U-05', name: 'Dr Démo Cinq', service: 'surgery' },
];

export const staffFor = (service: ServiceKey): string =>
  DEMO_STAFF.find((member) => member.service === service)?.name ?? DEMO_STAFF[0]?.name ?? '';

/** Choix déterministe dans une liste (jeux de démonstration reproductibles). */
export const pick = <T,>(list: readonly T[], index: number): T => list[index % list.length] as T;
