import {
  BedDouble,
  Boxes,
  Building2,
  Coins,
  CalendarClock,
  ClipboardList,
  FlaskConical,
  FolderOpen,
  Route,
  HeartPulse,
  LayoutDashboard,
  Pill,
  Receipt,
  ScrollText,
  ShieldCheck,
  Settings,
  Stethoscope,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { PERMISSIONS } from '@/core/permissions/permissions';

export interface NavItem {
  id: string;
  path: string;
  /** Clé i18n (espace de noms « common »). */
  labelKey: string;
  icon: LucideIcon;
  /** Permission requise pour voir l'entrée. Confort d'interface uniquement : l'API revérifie. */
  permission: string;
  /** Phase de livraison prévue (docs/ARCHITECTURE_FRONTEND.md §11). */
  phase: number;
}

export interface NavGroup {
  id: string;
  labelKey: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    labelKey: 'nav.groups.overview',
    items: [
      {
        id: 'dashboard',
        path: '/',
        labelKey: 'nav.dashboard',
        icon: LayoutDashboard,
        permission: PERMISSIONS.dashboard.view,
        phase: 3,
      },
    ],
  },
  {
    id: 'patientFlow',
    labelKey: 'nav.groups.patientFlow',
    items: [
      {
        id: 'patientFlowBoard',
        path: '/patient-flow',
        labelKey: 'nav.patientFlowBoard',
        icon: Route,
        // Noms, lieux et heures seulement (aucune donnée clinique) : visible de tous les rôles qui voient le tableau de bord.
        permission: PERMISSIONS.dashboard.view,
        phase: 4,
      },
      {
        id: 'patients',
        path: '/patients',
        labelKey: 'nav.patients',
        icon: Users,
        permission: PERMISSIONS.patients.view,
        phase: 3,
      },
      {
        id: 'appointments',
        path: '/appointments',
        labelKey: 'nav.appointments',
        icon: CalendarClock,
        permission: PERMISSIONS.appointments.view,
        phase: 4,
      },
      {
        id: 'medicalRecords',
        path: '/medical-records',
        labelKey: 'nav.medicalRecords',
        icon: FolderOpen,
        permission: PERMISSIONS.medicalRecords.view,
        phase: 4,
      },
      {
        id: 'consultations',
        path: '/consultations',
        labelKey: 'nav.consultations',
        icon: Stethoscope,
        permission: PERMISSIONS.consultations.view,
        phase: 4,
      },
      {
        id: 'nursing',
        path: '/nursing',
        labelKey: 'nav.nursing',
        icon: HeartPulse,
        permission: PERMISSIONS.nursing.view,
        phase: 4,
      },
    ],
  },
  {
    id: 'care',
    labelKey: 'nav.groups.care',
    items: [
      {
        id: 'prescriptions',
        path: '/prescriptions',
        labelKey: 'nav.prescriptions',
        icon: ClipboardList,
        permission: PERMISSIONS.prescriptions.view,
        phase: 5,
      },
      {
        id: 'pharmacy',
        path: '/pharmacy',
        labelKey: 'nav.pharmacy',
        icon: Pill,
        permission: PERMISSIONS.pharmacy.view,
        phase: 5,
      },
      {
        id: 'laboratory',
        path: '/laboratory',
        labelKey: 'nav.laboratory',
        icon: FlaskConical,
        permission: PERMISSIONS.laboratory.view,
        phase: 5,
      },
      {
        id: 'hospitalization',
        path: '/hospitalization',
        labelKey: 'nav.hospitalization',
        icon: BedDouble,
        permission: PERMISSIONS.hospitalization.view,
        phase: 5,
      },
    ],
  },
  {
    id: 'resources',
    labelKey: 'nav.groups.resources',
    items: [
      {
        id: 'billing',
        path: '/billing',
        labelKey: 'nav.billing',
        icon: Receipt,
        permission: PERMISSIONS.billing.view,
        phase: 5,
      },
      {
        id: 'insurance',
        path: '/insurance',
        labelKey: 'nav.insurance',
        icon: ShieldCheck,
        permission: PERMISSIONS.insurance.view,
        phase: 3,
      },
      {
        id: 'cash',
        path: '/cash',
        labelKey: 'nav.cash',
        icon: Wallet,
        permission: PERMISSIONS.cash.view,
        phase: 5,
      },
      {
        id: 'expenses',
        path: '/expenses',
        labelKey: 'nav.expenses',
        icon: Coins,
        permission: PERMISSIONS.expenses.view,
        phase: 5,
      },
      {
        id: 'inventory',
        path: '/inventory',
        labelKey: 'nav.inventory',
        icon: Boxes,
        permission: PERMISSIONS.inventory.view,
        phase: 5,
      },
    ],
  },
  {
    id: 'management',
    labelKey: 'nav.groups.management',
    items: [
      {
        id: 'reports',
        path: '/reports',
        labelKey: 'nav.reports',
        icon: TrendingUp,
        permission: PERMISSIONS.reports.view,
        phase: 6,
      },
      {
        id: 'administration',
        path: '/administration',
        labelKey: 'nav.administration',
        icon: Settings,
        permission: PERMISSIONS.administration.view,
        phase: 6,
      },
      {
        id: 'audit',
        path: '/audit',
        labelKey: 'nav.audit',
        icon: ScrollText,
        permission: PERMISSIONS.audit.view,
        phase: 6,
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export function findNavItem(id: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.id === id);
}

/** Icône de l'établissement (sélecteur d'établissement). */
export const FacilityIcon = Building2;
