import {
  BedDouble,
  CalendarClock,
  FlaskConical,
  HeartPulse,
  Boxes,
  Pill,
  Receipt,
  type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/feedback/spinner';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { queryKeys } from '@/core/api';
import { useFormatters } from '@/core/i18n/useFormatters';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { minutesSince } from '@/utils/dates';
import { appointmentService } from '../appointments/data';
import { DemoNotice } from '../_shared/demo-notice';
import { productService, stockLevel } from '../inventory/data';
import { triageService } from '../nursing/data';
import { useResourceList } from '../_shared/use-resource';
import { dashboardService, type DashboardSummary } from './data';
import { DoctorQueue } from './DoctorQueue';
import { NurseQueue } from './NurseQueue';
import { CashClosureCard } from '../billing/CashClosureCard';
import { TreasuryCard } from '../treasury/TreasuryCard';
import { referenceFromApi } from '../_shared/reference-data';
import { PersonName } from '@/components/ui/avatar';

interface Tile {
  key: keyof DashboardSummary | 'beds';
  icon: LucideIcon;
  to: string;
  permission: string;
  tone?: 'warning' | 'danger' | 'info' | 'success';
}

const TILES: readonly Tile[] = [
  { key: 'appointmentsToday', icon: CalendarClock, to: '/appointments', permission: PERMISSIONS.appointments.view, tone: 'info' },
  { key: 'waitingNow', icon: HeartPulse, to: '/nursing', permission: PERMISSIONS.nursing.view, tone: 'warning' },
  { key: 'beds', icon: BedDouble, to: '/hospitalization', permission: PERMISSIONS.hospitalization.view },
  { key: 'pendingLabOrders', icon: FlaskConical, to: '/laboratory', permission: PERMISSIONS.laboratory.view },
  { key: 'toDispense', icon: Pill, to: '/pharmacy', permission: PERMISSIONS.pharmacy.view },
  { key: 'stockAlerts', icon: Boxes, to: '/inventory', permission: PERMISSIONS.inventory.view, tone: 'warning' },
  { key: 'unpaidInvoices', icon: Receipt, to: '/billing', permission: PERMISSIONS.billing.view, tone: 'danger' },
];

function MiniListState({ loading, error, empty, onRetry, emptyLabel }: { loading: boolean; error: unknown; empty: boolean; onRetry: () => void; emptyLabel: string }) {
  if (loading) return <Skeleton className="h-24" />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (empty) return <p className="py-4 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  return null;
}

function UpcomingAppointments() {
  const { t } = useTranslation('dashboard');
  const f = useFormatters();
  const list = useResourceList('appointments', appointmentService, {
    page: 1, perPage: 5, search: '', filters: { period: 'today', status: 'confirmed' }, sort: { columnId: 'startsAt', direction: 'asc' },
  });
  const rows = list.data?.rows ?? [];
  return (
    <Card title={t('lists.appointments')} actions={<Link to="/appointments" className="text-sm font-medium text-primary-ink underline">{t('lists.seeAll')}</Link>}>
      <MiniListState loading={list.isPending} error={list.error} empty={rows.length === 0} onRetry={() => void list.refetch()} emptyLabel={t('lists.none')} />
      <ul className="divide-y divide-border text-sm">
        {rows.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 py-2">
            <PersonName name={a.patientName} size="sm" />
            <span className="text-muted-foreground">{f.time(a.startsAt)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function WaitingQueue() {
  const { t } = useTranslation('dashboard');
  const list = useResourceList('triage', triageService, {
    page: 1, perPage: 5, search: '', filters: { status: 'waiting' }, sort: { columnId: 'priority', direction: 'asc' },
  });
  const rows = list.data?.rows ?? [];
  return (
    <Card title={t('lists.queue')} actions={<Link to="/nursing" className="text-sm font-medium text-primary-ink underline">{t('lists.seeAll')}</Link>}>
      <MiniListState loading={list.isPending} error={list.error} empty={rows.length === 0} onRetry={() => void list.refetch()} emptyLabel={t('lists.none')} />
      <ul className="divide-y divide-border text-sm">
        {rows.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 py-2">
            <PersonName name={e.patientName} size="sm" />
            <span className="text-muted-foreground">{t('lists.minutes', { count: minutesSince(e.arrivedAt) })}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function StockAlerts() {
  const { t } = useTranslation('dashboard');
  const f = useFormatters();
  const list = useResourceList('products', productService, {
    page: 1, perPage: 100, search: '', filters: {}, sort: { columnId: 'quantity', direction: 'asc' },
  });
  const rows = (list.data?.rows ?? []).filter((p) => stockLevel(p) === 'low' || stockLevel(p) === 'out').slice(0, 5);
  return (
    <Card title={t('lists.stock')} actions={<Link to="/inventory" className="text-sm font-medium text-primary-ink underline">{t('lists.seeAll')}</Link>}>
      <MiniListState loading={list.isPending} error={list.error} empty={rows.length === 0} onRetry={() => void list.refetch()} emptyLabel={t('lists.none')} />
      <ul className="divide-y divide-border text-sm">
        {rows.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-2">
            <span className="font-medium">{p.name}</span>
            <span className="tabular-nums text-muted-foreground">{f.number(p.quantity)} {p.unit}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation('dashboard');
  const f = useFormatters();
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  // Le médecin a sa propre file (ci-dessus) : les listes générales feraient double emploi.
  const doctorDesk = referenceFromApi() && can(PERMISSIONS.consultations.create);
  // L'infirmier a sa file de triage complète avec ses actions (ci-dessous) : la mini-liste ferait double emploi.
  const nurseDesk = referenceFromApi() && !doctorDesk && can(PERMISSIONS.nursing.record);
  const query = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'dashboard'),
    queryFn: () => dashboardService.get(),
  });

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      {referenceFromApi() && can(PERMISSIONS.billing.pay) && <CashClosureCard />}
      {referenceFromApi() && (can(PERMISSIONS.treasury.manage) || can(PERMISSIONS.billing.pay)) && <TreasuryCard finance={can(PERMISSIONS.treasury.manage)} />}
      {doctorDesk && <DoctorQueue />}
      {nurseDesk && <NurseQueue />}
      {query.data?.isDemo && <DemoNotice endpoint="/health/reports/dashboard" />}

      {query.isPending && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      )}
      {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && (
        <StatGrid>
          {TILES.filter((tile) => can(tile.permission) && (tile.key === 'beds' ? query.data.summary.bedsOccupied !== undefined : query.data.summary[tile.key] !== undefined)).map((tile) => {
            const s = query.data.summary;
            const value = tile.key === 'beds' ? `${f.number(s.bedsOccupied ?? 0)} / ${f.number(s.bedsTotal ?? 0)}` : f.number(s[tile.key] ?? 0);
            return <StatCard key={tile.key} icon={tile.icon} tone={tile.tone} label={t(`tiles.${tile.key}`)} value={value} to={tile.to} />;
          })}
        </StatGrid>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {!doctorDesk && can(PERMISSIONS.appointments.view) && <UpcomingAppointments />}
        {!doctorDesk && !nurseDesk && can(PERMISSIONS.nursing.view) && <WaitingQueue />}
        {/* En mode API, les quantités vivent dans UZISHA et aucune route n'est confirmée : pas de carte vide en erreur. */}
        {!referenceFromApi() && can(PERMISSIONS.inventory.view) && <StockAlerts />}
      </div>
    </>
  );
}
