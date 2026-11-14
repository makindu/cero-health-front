import { DEMO_PATIENTS } from '../patients/data';

/** Vue minimale d'un patient pour la facturation (évite de dépendre de toute la fiche). */
export interface PatientLite {
  id: string;
  fullName: string;
  fileNumber?: string;
  status?: 'active' | 'inactive';
  mergedInto?: string;
}

export const patientsSeedForFinance: readonly PatientLite[] = DEMO_PATIENTS;
