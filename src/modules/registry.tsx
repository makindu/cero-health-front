import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Registre des pages de module : identifiant de navigation → page chargée à la demande.
 * Un module sans entrée ici retombe sur `ModulePlaceholderPage` (filet de sécurité).
 */
export const MODULE_PAGES: Record<string, LazyExoticComponent<ComponentType>> = {
  dashboard: lazy(() => import('@/modules/dashboard/DashboardPage')),
  patients: lazy(() => import('@/modules/patients/PatientsPage')),
  appointments: lazy(() => import('@/modules/appointments/AppointmentsPage')),
  medicalRecords: lazy(() => import('@/modules/medicalRecords/MedicalRecordsPage')),
  consultations: lazy(() => import('@/modules/consultations/ConsultationsPage')),
  nursing: lazy(() => import('@/modules/nursing/NursingPage')),
  prescriptions: lazy(() => import('@/modules/prescriptions/PrescriptionsPage')),
  pharmacy: lazy(() => import('@/modules/pharmacy/PharmacyPage')),
  laboratory: lazy(() => import('@/modules/laboratory/LaboratoryPage')),
  hospitalization: lazy(() => import('@/modules/hospitalization/HospitalizationPage')),
  billing: lazy(() => import('@/modules/billing/BillingPage')),
  insurance: lazy(() => import('@/modules/insurance/InsurancePage')),
  cash: lazy(() => import('@/modules/cash/CashPage')),
  inventory: lazy(() => import('@/modules/inventory/InventoryPage')),
  reports: lazy(() => import('@/modules/reports/ReportsPage')),
  administration: lazy(() => import('@/modules/administration/AdministrationPage')),
  audit: lazy(() => import('@/modules/audit/AuditPage')),
};
