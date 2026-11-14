import { localDayKey } from '../appointments/scheduling';
import { ApiError, healthClient } from '@/core/api';
import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { env } from '@/core/config/env';
import { isoDay } from '@/utils/dates';
import { DEMO_APPOINTMENTS } from '../appointments/data';
import { DEMO_INVOICES } from '../billing/data';
import { DEMO_BEDS } from '../hospitalization/data';
import { DEMO_LAB_ORDERS } from '../laboratory/data';
import { DEMO_PRESCRIPTIONS } from '../prescriptions/data';
import { DEMO_TRIAGE } from '../nursing/data';
import { DEMO_PRODUCTS, stockLevel } from '../inventory/data';

/**
 * Contrat cible de GET /health/reports/dashboard (à valider avec le backend) :
 * des compteurs du jour pour l'établissement actif.
 */
export interface DashboardSummary {
  appointmentsToday: number;
  waitingNow: number;
  bedsOccupied: number;
  bedsTotal: number;
  pendingLabOrders: number;
  toDispense: number;
  stockAlerts: number;
  unpaidInvoices: number;
}

export interface DashboardResult {
  summary: DashboardSummary;
  isDemo: boolean;
}

/** Calculé à partir des jeux FICTIFS : cohérent avec ce que montrent les autres pages en démonstration. */
function demoSummary(): DashboardSummary {
  const today = isoDay(0); // jour civil local
  return {
    appointmentsToday: DEMO_APPOINTMENTS.filter((a) => localDayKey(a.startsAt) === today).length,
    waitingNow: DEMO_TRIAGE.filter((e) => e.status === 'waiting' || e.status === 'inTriage').length,
    bedsOccupied: DEMO_BEDS.filter((b) => b.status === 'occupied').length,
    bedsTotal: DEMO_BEDS.length,
    pendingLabOrders: DEMO_LAB_ORDERS.filter((o) => o.status !== 'validated' && o.status !== 'cancelled').length,
    toDispense: DEMO_PRESCRIPTIONS.filter((p) => p.status === 'validated').length,
    stockAlerts: DEMO_PRODUCTS.filter((p) => stockLevel(p) !== 'ok').length,
    unpaidInvoices: DEMO_INVOICES.filter((i) => i.status === 'issued' || i.status === 'partial').length,
  };
}

export const dashboardService = {
  async get(): Promise<DashboardResult> {
    if (env.api.health) {
      const result = await healthClient.get<DashboardSummary>(HEALTH_ENDPOINTS.reports.dashboard);
      return { summary: result.data, isDemo: false };
    }
    if (env.previewMode) return { summary: demoSummary(), isDemo: true };
    throw new ApiError('config', 'Service "health" non configuré.', { source: 'health' });
  },
};
