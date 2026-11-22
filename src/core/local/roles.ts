import { PERMISSIONS } from '@/core/permissions/permissions';

const P = PERMISSIONS;

export type LocalRole = 'receptionist' | 'cashier' | 'doctor' | 'nurse' | 'labTech' | 'pharmacist' | 'wardManager' | 'admin';

export interface LocalUser {
  id: string;
  /** Nom FICTIF, clairement identifié comme utilisateur de démonstration. */
  name: string;
  role: LocalRole;
  permissions: readonly string[];
}

/**
 * Permissions par rôle (mode local). Les permissions sont vérifiées dans les services (assertPermission), pas seulement
 * par le masquage des boutons. Les noms définitifs viendront de CERO ID CORE ; ils restent centralisés dans permissions.ts.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<LocalRole, readonly string[]> = {
  receptionist: [
    P.dashboard.view, P.patients.view, P.patients.create, P.patients.update,
    P.appointments.view, P.appointments.create, P.appointments.update, P.appointments.cancel, P.appointments.checkIn,
    P.nursing.view, P.billing.view, P.insurance.view, P.insurance.manage,
  ],
  cashier: [P.dashboard.view, P.patients.view, P.billing.view, P.billing.create, P.billing.pay, P.billing.settle, P.insurance.view, P.insurance.validate, P.cash.view, P.cash.record, P.cash.close, P.reports.view],
  doctor: [
    P.dashboard.view, P.patients.view, P.appointments.view, P.appointments.create, P.appointments.update, P.medicalRecords.view,
    P.consultations.view, P.consultations.create, P.consultations.update, P.consultations.sign, P.consultations.close,
    P.prescriptions.view, P.prescriptions.create, P.laboratory.view, P.laboratory.order,
    P.hospitalization.view, P.hospitalization.create, P.nursing.view, P.nursing.validateCare,
    P.hospitalization.visitView, P.hospitalization.visitRecord, P.hospitalization.visitClinical, P.hospitalization.consumptionReverse, P.medicalRecords.export,
  ],
  nurse: [P.dashboard.view, P.patients.view, P.nursing.view, P.nursing.record, P.medicalRecords.view, P.prescriptions.view, P.prescriptions.create, P.laboratory.view, P.laboratory.order, P.hospitalization.view, P.pharmacy.view,
    P.hospitalization.visitView, P.hospitalization.visitRecord, P.hospitalization.visitClinical, P.hospitalization.consumptionReverse],
  labTech: [P.dashboard.view, P.patients.view, P.laboratory.view, P.laboratory.collect, P.laboratory.resultsEnter, P.laboratory.resultsValidate, P.laboratory.catalog],
  pharmacist: [P.dashboard.view, P.pharmacy.view, P.pharmacy.dispense, P.pharmacy.catalog, P.prescriptions.view, P.prescriptions.validate, P.prescriptions.dispense, P.inventory.view, P.inventory.receive, P.inventory.adjust],
  wardManager: [P.dashboard.view, P.patients.view, P.hospitalization.view, P.hospitalization.create, P.hospitalization.assignBed, P.hospitalization.discharge, P.medicalRecords.view, P.medicalRecords.manage, P.medicalRecords.export, P.billing.view, P.billing.credit, P.nursing.view, P.consultations.view,
    P.hospitalization.visitView, P.hospitalization.visitRecord, P.hospitalization.visitClinical, P.hospitalization.consumptionReverse, P.billing.discount],
  admin: ['health.*'],
};

const NAMES: Record<LocalRole, string> = {
  receptionist: 'Réceptionniste (démo)',
  cashier: 'Caissier (démo)',
  doctor: 'Médecin (démo)',
  nurse: 'Infirmier (démo)',
  labTech: 'Laborantin (démo)',
  pharmacist: 'Pharmacien (démo)',
  wardManager: 'Responsable hospitalisation (démo)',
  admin: 'Administrateur (démo)',
};

export const LOCAL_ROLES = Object.keys(DEFAULT_ROLE_PERMISSIONS) as LocalRole[];

export const LOCAL_USERS: readonly LocalUser[] = LOCAL_ROLES.map((role) => ({
  id: `local-user-${role}`,
  name: NAMES[role],
  role,
  permissions: DEFAULT_ROLE_PERMISSIONS[role],
}));

export const DEFAULT_LOCAL_USER: LocalUser = LOCAL_USERS.find((u) => u.role === 'admin') ?? LOCAL_USERS[0]!;

/** Libellés de rôle sans la mention « démo », pour les écrans d'administration. */
export const ROLE_LABELS: Record<LocalRole, string> = {
  receptionist: 'Réceptionniste',
  cashier: 'Caissier',
  doctor: 'Médecin',
  nurse: 'Infirmier',
  labTech: 'Laborantin',
  pharmacist: 'Pharmacien',
  wardManager: 'Resp. hospitalisation',
  admin: 'Administrateur',
};
