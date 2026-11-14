import { balances } from '@/core/billing/invoice';
import type { FinanceSnapshot } from './types';

/** Indicateurs du tableau de bord assurances — calculés sur les écritures réelles (jamais inventés). */
export function insuranceIndicators(data: FinanceSnapshot) {
  const validated = data.coverages.filter((c) => c.status === 'validated' && c.validFrom <= data.day && data.day <= c.validTo);
  const spentByCoverage: Record<string, number> = {};
  const orgs = new Map<string, { organizationId: string; name: string; due: number; settled: number; outstanding: number; disputed: number }>();
  let rejectedTotal = 0;
  let rejectedCount = 0;
  for (const { invoice, ledger, status } of data.invoices) {
    if (status === 'cancelled') continue;
    for (const [cov, amount] of Object.entries(invoice.usage?.coverageSpent ?? {})) spentByCoverage[cov] = (spentByCoverage[cov] ?? 0) + amount;
    for (const o of balances(invoice, ledger).organizations) {
      const row = orgs.get(o.organizationId) ?? { organizationId: o.organizationId, name: data.organizations.find((x) => x.id === o.organizationId)?.name ?? o.organizationId, due: 0, settled: 0, outstanding: 0, disputed: 0 };
      row.due += o.due; row.settled += o.settled; row.outstanding += o.outstanding; row.disputed += o.disputed;
      orgs.set(o.organizationId, row);
    }
    for (const e of ledger) if (e.kind === 'insurerRejection' && !ledger.some((x) => x.reversalOf === e.id)) { rejectedTotal += e.amount; rejectedCount += 1; }
  }
  const byOrganization = [...orgs.values()].sort((a, b) => b.outstanding - a.outstanding);
  return {
    activeInsured: new Set(validated.filter((c) => c.kind === 'insurance').map((c) => c.patientId)).size,
    mutuelleMembers: new Set(validated.filter((c) => c.kind === 'mutuelle').map((c) => c.patientId)).size,
    activeSubscriptions: data.subscriptions.filter((s) => s.status === 'active' && s.validFrom <= data.day && data.day <= s.validTo).length,
    pendingValidations: data.coverages.filter((c) => c.status === 'pending').length,
    rejectedTotal, rejectedCount,
    receivableTotal: byOrganization.reduce((s, o) => s + o.outstanding, 0),
    byOrganization, spentByCoverage,
  };
}
