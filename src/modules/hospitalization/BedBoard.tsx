import { BedDouble, CircleCheck, Sparkles, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/feedback/spinner';
import { Button } from '@/components/ui/button';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { FormField } from '@/components/forms/form-field';
import { Input } from '@/components/forms/controls';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { cn } from '@/utils/cn';
import { ActionDialog } from '../finance/ActionDialog';
import { WARDS } from './collections';
import { hospital } from './hospital';
import type { BedView } from './hospital-service';
import { BED_STYLE, BedStatusBadge } from './StatusBadges';
import { useHospitalBoard, useHospitalMutation } from './use-hospital';

/** Plan des lits par service et chambre. Chaque lit : icône + libellé (jamais la couleur seule). */
export function BedBoard({ onAdmit, onOpen }: { onAdmit: (bedId: string) => void; onOpen: (admissionId: string) => void }) {
  const { t } = useTranslation('hospitalization');
  const board = useHospitalBoard();
  const [maint, setMaint] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const mState = useHospitalMutation(hospital.setBedState, { successTitle: t('done.bedState'), onDone: () => { setMaint(null); setReason(''); } });
  if (board.isPending) return <Skeleton className="h-64" />;
  if (board.error) return <ErrorState error={board.error} onRetry={() => void board.refetch()} />;
  const beds = board.data.beds;
  if (beds.length === 0) return <EmptyState title={t('beds.empty')} />;
  const count = (s: string) => beds.filter((b) => b.bed.status === s).length;
  return (
    <div className="space-y-5">
      <StatGrid>
        <StatCard icon={CircleCheck} label={t('bedStatus.free')} value={String(count('free'))} tone="success" />
        <StatCard icon={BedDouble} label={t('bedStatus.occupied')} value={String(count('occupied'))} />
        <StatCard icon={Sparkles} label={t('bedStatus.cleaning')} value={String(count('cleaning'))} tone="warning" />
        <StatCard icon={Wrench} label={t('bedStatus.maintenance')} value={String(count('maintenance'))} />
      </StatGrid>
      {WARDS.map((ward) => {
        const wardBeds = beds.filter((b) => b.room.ward === ward);
        const rooms = [...new Set(wardBeds.map((b) => b.room.id))];
        return (
          <section key={ward} aria-labelledby={`ward-${ward}`} className="space-y-2">
            <h3 id={`ward-${ward}`} className="text-sm font-semibold">{t(`services.${ward}`)} <span className="font-normal text-muted-foreground">· {t('beds.occupancy', { occupied: wardBeds.filter((b) => b.bed.status === 'occupied').length, total: wardBeds.length })}</span></h3>
            <div className="grid gap-3 md:grid-cols-2">
              {rooms.map((roomId) => {
                const rb = wardBeds.filter((b) => b.room.id === roomId);
                return (
                  <div key={roomId} className="rounded-lg border border-border p-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">{t('beds.room', { room: rb[0]!.room.code })} · {t(`roomKind.${rb[0]!.room.kind}`)}</p>
                    <ul className="grid gap-2 sm:grid-cols-3">
                      {rb.map((b: BedView) => (
                        <li key={b.bed.id} className={cn('space-y-1 rounded-md border-2 p-2 text-sm', BED_STYLE[b.bed.status].ring)}>
                          <div className="flex items-center justify-between gap-1"><span className="font-medium">{b.bed.label}</span><BedStatusBadge status={b.bed.status} /></div>
                          {b.admission && <p className="truncate text-xs">{b.admission.patientName}</p>}
                          {b.bed.maintenanceReason && <p className="text-xs text-muted-foreground">{b.bed.maintenanceReason}</p>}
                          <div className="flex flex-wrap gap-1">
                            {b.bed.status === 'free' && <Can permission={P.hospitalization.create}><Button size="sm" onClick={() => onAdmit(b.bed.id)}>{t('beds.assign')}</Button></Can>}
                            {b.bed.status === 'occupied' && b.admission && <Button size="sm" variant="outline" onClick={() => onOpen(b.admission!.id)}>{t('beds.open')}</Button>}
                            {b.bed.status === 'cleaning' && <Can permission={P.hospitalization.assignBed}><Button size="sm" variant="outline" loading={mState.isPending} onClick={() => mState.mutate({ bedId: b.bed.id, to: 'free', reason: '' })}>{t('beds.markReady')}</Button></Can>}
                            {b.bed.status === 'maintenance' && <Can permission={P.hospitalization.assignBed}><Button size="sm" variant="outline" loading={mState.isPending} onClick={() => mState.mutate({ bedId: b.bed.id, to: 'free', reason: '' })}>{t('beds.endMaintenance')}</Button></Can>}
                            {(b.bed.status === 'free' || b.bed.status === 'cleaning') && <Can permission={P.hospitalization.assignBed}><Button size="sm" variant="ghost" onClick={() => { setReason(''); setMaint(b.bed.id); }}>{t('beds.maintenance')}</Button></Can>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      <ActionDialog open={maint !== null} onClose={() => setMaint(null)} title={t('beds.maintenanceTitle')} submitLabel={t('beds.maintenance')} pending={mState.isPending} canSubmit={reason.trim() !== ''}
        onSubmit={() => maint && mState.mutate({ bedId: maint, to: 'maintenance', reason })}>
        <FormField label={t('detail.reasonLabel')} required>{(c) => <Input {...c} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormField>
      </ActionDialog>
    </div>
  );
}
