import { BedDouble, CircleCheck, Sparkles, Wrench, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/feedback/spinner';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/forms/search-input';
import { Dialog } from '@/components/ui/dialog';
import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { cn } from '@/utils/cn';
import { CommandButton } from '../_shared/command-button';
import { DemoNotice } from '../_shared/demo-notice';
import { DescriptionList } from '../_shared/detail-view';
import { FormDialog } from '../_shared/form-dialog';
import { createResourceService } from '../_shared/resource-service';
import { useResourceList } from '../_shared/use-resource';
import { bedService, WARDS, type Bed, type BedStatus } from './data';
import { PersonName } from '@/components/ui/avatar';

const STATUS: Record<BedStatus, { tone: StatusTone; icon: LucideIcon; ring: string }> = {
  free: { tone: 'success', icon: CircleCheck, ring: 'border-success' },
  occupied: { tone: 'info', icon: BedDouble, ring: 'border-info' },
  cleaning: { tone: 'warning', icon: Sparkles, ring: 'border-warning' },
  maintenance: { tone: 'neutral', icon: Wrench, ring: 'border-border-strong' },
};
const STATUSES = Object.keys(STATUS) as BedStatus[];

/** Plan des lits par service et chambre. Chaque lit : icône + libellé de statut (jamais la couleur seule). */
export function BedMap() {
  const { t } = useTranslation('hospitalization');
  const [selected, setSelected] = useState<Bed | null>(null);
  const [assigning, setAssigning] = useState<Bed | null>(null);
  const [q, setQ] = useState('');
  const list = useResourceList('beds', bedService, { page: 1, perPage: 300, search: '', filters: {}, sort: null });

  // Contrat cible : POST /health/beds/{id}/assign (voir docs/API_CONTRACTS_NEEDED.md).
  const assignService = useMemo(
    () =>
      createResourceService<{ id: string }>({
        source: 'health',
        endpoint: assigning ? `${HEALTH_ENDPOINTS.beds.collection}/${encodeURIComponent(assigning.id)}/assign` : undefined,
        demoRows: [],
      }),
    [assigning],
  );

  if (list.isPending) return <Skeleton className="h-64" />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  const beds = list.data?.rows ?? [];
  if (beds.length === 0) return <EmptyState title={t('beds.empty')} />;

  const count = (status: BedStatus) => beds.filter((b) => b.status === status).length;
  // Recherche rapide : lit, chambre, service, statut ou patient.
  const needle = q.trim().toLowerCase();
  const visible = needle === '' ? beds : beds.filter((b) => [b.label, b.room, t(`services.${b.ward}`), t(`bedStatus.${b.status}`), b.patientName ?? ''].join(' ').toLowerCase().includes(needle));

  return (
    <div>
      {list.data?.isDemo && <DemoNotice endpoint={bedService.endpoint} />}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUSES.map((status) => {
          const Icon = STATUS[status].icon;
          return <span key={status} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm"><Icon aria-hidden className="size-4" /><span className="text-muted-foreground">{t(`bedStatus.${status}`)}</span><strong>{count(status)}</strong></span>;
        })}
        <div className="ms-auto w-full sm:w-72"><SearchInput label={t('search')} placeholder={t('beds.searchPlaceholder', { defaultValue: 'Rechercher…' })} value={q} onChange={setQ} /></div>
      </div>
      {needle !== '' && visible.length === 0 && <EmptyState title={t('beds.noMatch', { defaultValue: 'Aucun lit ne correspond à la recherche.' })} />}
      <div className="space-y-6">
        {WARDS.map((ward) => {
          const wardBeds = visible.filter((b) => b.ward === ward);
          if (wardBeds.length === 0) return null;
          const rooms = [...new Set(wardBeds.map((b) => b.room))];
          return (
            <section key={ward} aria-labelledby={`ward-${ward}`} className="rounded-card border border-border bg-surface p-4 shadow-card">
              <h3 id={`ward-${ward}`} className="mb-3 text-base font-semibold">
                {t(`services.${ward}`)}
                <span className="ms-2 text-sm font-normal text-muted-foreground">
                  {t('beds.occupancy', { occupied: beds.filter((b) => b.ward === ward && b.status === 'occupied').length, total: beds.filter((b) => b.ward === ward).length })}
                </span>
              </h3>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,16rem),1fr))]">
                {rooms.map((room) => (
                  <div key={room} className="min-w-0">
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('beds.room', { room })}
                    </p>
                    <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,7.5rem),1fr))]">
                      {wardBeds
                        .filter((b) => b.room === room)
                        .map((bed) => {
                          const style = STATUS[bed.status];
                          const Icon = style.icon;
                          return (
                            <li key={bed.id}>
                              <button
                                type="button"
                                onClick={() => setSelected(bed)}
                                className={cn(
                                  'flex h-full w-full min-w-0 flex-col items-center gap-1 rounded-md border-2 bg-surface p-3 text-center text-xs transition-colors hover:bg-surface-muted',
                                  style.ring,
                                )}
                              >
                                <Icon aria-hidden className="size-5" />
                                <span className="max-w-full break-words font-semibold">{bed.label}</span>
                                <span className="max-w-full break-words text-muted-foreground">{t(`bedStatus.${bed.status}`)}</span>
                                {bed.patientName && <span className="max-w-full break-words leading-snug">{bed.patientName}</span>}
                              </button>
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <Dialog open={selected !== null} onClose={() => setSelected(null)} title={selected ? t('beds.bed', { label: selected.label }) : ''}>
        {selected && (
          <div className="space-y-4">
            <DescriptionList
              items={[
                { label: t('beds.ward'), value: t(`services.${selected.ward}`) },
                { label: t('beds.roomLabel'), value: selected.room },
                {
                  label: t('beds.status'),
                  value: (
                    <StatusBadge tone={STATUS[selected.status].tone} icon={STATUS[selected.status].icon}>
                      {t(`bedStatus.${selected.status}`)}
                    </StatusBadge>
                  ),
                },
                { label: t('beds.patient'), value: selected.patientName ? <PersonName name={selected.patientName} size="sm" /> : null },
              ]}
            />
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {selected.status === 'free' && (
                <Can permission={PERMISSIONS.hospitalization.assignBed}>
                  <Button
                    size="sm"
                    onClick={() => {
                      setAssigning(selected);
                      setSelected(null);
                    }}
                  >
                    {t('beds.assign')}
                  </Button>
                </Can>
              )}
              {selected.status === 'cleaning' && (
                <CommandButton
                  name="beds"
                  service={bedService}
                  id={selected.id}
                  action="ready"
                  label={t('beds.markReady')}
                  permission={PERMISSIONS.hospitalization.assignBed}
                  confirmTitle={t('beds.markReadyTitle')}
                  onDone={() => setSelected(null)}
                />
              )}
            </div>
          </div>
        )}
      </Dialog>

      <FormDialog
        open={assigning !== null}
        onClose={() => setAssigning(null)}
        name="beds"
        service={assignService}
        title={assigning ? t('beds.assignTitle', { label: assigning.label }) : ''}
        submitLabel={t('beds.assign')}
        fields={[
          { name: 'patient', label: t('beds.patientField'), type: 'text', required: true, span: 2 },
          { name: 'expectedDischarge', label: t('beds.expectedDischarge'), type: 'date' },
        ]}
      />
    </div>
  );
}
