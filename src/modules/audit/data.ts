import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { isoAt } from '@/utils/dates';
import { createResourceService } from '../_shared/resource-service';
import { demoPerson, pick } from '../_shared/demo-people';

export type AuditAction = 'view' | 'create' | 'update' | 'validate' | 'cancel' | 'export' | 'login';
export type AuditResource = 'patient' | 'medicalRecord' | 'prescription' | 'labOrder' | 'invoice' | 'stock' | 'session';

export interface AuditEntry {
  id: string;
  at: string;
  user: string;
  action: AuditAction;
  resource: AuditResource;
  reference: string;
  outcome: 'success' | 'denied';
}

export const AUDIT_ACTIONS: readonly AuditAction[] = ['view', 'create', 'update', 'validate', 'cancel', 'export', 'login'];
export const AUDIT_RESOURCES: readonly AuditResource[] = ['patient', 'medicalRecord', 'prescription', 'labOrder', 'invoice', 'stock', 'session'];

/** FICTIF : journal de démonstration. */
export const DEMO_AUDIT: readonly AuditEntry[] = Array.from({ length: 48 }, (_, i) => {
  const resource = pick(AUDIT_RESOURCES, i * 2 + 1);
  return {
    id: `DEMO-J-${String(i + 1).padStart(4, '0')}`,
    at: isoAt(-Math.floor(i / 10), 8 + (i % 10), (i * 11) % 60),
    user: `Utilisateur démo ${(i % 5) + 1}`,
    action: resource === 'session' ? 'login' : pick(AUDIT_ACTIONS.filter((a) => a !== 'login'), i),
    resource,
    reference: resource === 'session' ? '—' : demoPerson((i * 5) % 24).id,
    outcome: i % 11 === 10 ? 'denied' : 'success',
  };
});

export const auditService = createResourceService<AuditEntry>({
  source: 'health',
  endpoint: HEALTH_ENDPOINTS.audit.collection,
  demoRows: DEMO_AUDIT,
  searchText: (e) => `${e.user} ${e.reference} ${e.id}`,
  sortValue: (e, column) => String((e as unknown as Record<string, unknown>)[column] ?? ''),
});
