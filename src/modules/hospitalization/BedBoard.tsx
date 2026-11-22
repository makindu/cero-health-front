import { BedDouble, CircleCheck, Sparkles, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/feedback/spinner';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/forms/search-input';
import { FormField } from '@/components/forms/form-field';
import { Input } from '@/components/forms/controls';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { cn } from '@/utils/cn';
import { ActionDialog } from '../finance/ActionDialog';
import { wardLabel } from './ward';
import { hospital } from './hospital';
import type { BedView } from './hospital-service';
import { BED_STYLE, BedStatusBadge } from './StatusBadges';
import { useHospitalBoard, useHospitalMutation } from './use-hospital';
import { Avatar } from '@/components/ui/avatar';

/** Plan des lits par service et chambre. Chaque lit : icône + libellé (jamais la couleur seule). */
export function BedBoard({ onAdmit, onOpen }: { onAdmit: (bedId: string) => void; onOpen: (admissionId: string) => void }) {
  const { t } = useTranslation('hospitalization');
  const board = useHospitalBoard();
  const [maint, setMaint] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [q, setQ] = useState('');
  const mState = useHospitalMutation(hospital.setBedState, { successTitle: t('done.bedState'), onDone: () => { setMaint(null); setReason(''); } });
  if (board.isPending) return <Skeleton className="h-64" />;
  if (board.error) return <ErrorState error={board.error} onRetry={() => void board.refetch()} />;
  const beds = board.data.beds;
  if (beds.length === 0) return <EmptyState title={t('beds.empty')} />;
  const count = (s: string) => beds.filter((b) => b.bed.status === s).length;
  // Recherche rapide : lit, chambre, service, statut, patient hospitalisé ou motif de maintenance.
  const wards = [...new Set(beds.map((b) => b.room.ward))];
  const needle = q.trim().toLowerCase();
  const visible = needle === '' ? beds : beds.filter((b) => [
    b.bed.label, b.room.code, wardLabel(t, b.room.ward), t(`bedStatus.${b.bed.status}`), t(`roomKind.${b.room.kind}`), b.admission?.patientName ?? '', b.admission?.number ?? '', b.bed.maintenanceReason ?? '',
  ].join(' ').toLowerCase().includes(needle));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {([['free', CircleCheck, 'text-success'], ['occupied', BedDouble, 'text-info'], ['cleaning', Sparkles, 'text-warning'], ['maintenance', Wrench, 'text-muted-foreground']] as const).map(([st, Icon, c]) => (
          <span key={st} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm"><Icon aria-hidden className={`size-4 ${c}`} /><span className="text-muted-foreground">{t(`bedStatus.${st}`)}</span><strong>{count(st)}</strong></span>
        ))}
        <div className="ms-auto w-full sm:w-72"><SearchInput label={t('search')} placeholder={t('beds.searchPlaceholder', { defaultValue: 'Rechercher…' })} value={q} onChange={setQ} /></div>
      </div>
      {needle !== '' && visible.length === 0 && <EmptyState title={t('beds.noMatch', { defaultValue: 'Aucun lit ne correspond à la recherche.' })} />}
      {wards.map((ward) => {
        const wardBeds = visible.filter((b) => b.room.ward === ward);
        if (wardBeds.length === 0) return null;
        const rooms = [...new Set(wardBeds.map((b) => b.room.id))];
        return (
          <section key={ward} aria-labelledby={`ward-${ward}`} className="space-y-2">
            <h3 id={`ward-${ward}`} className="text-sm font-semibold">{wardLabel(t, ward)} <span className="font-normal text-muted-foreground">· {t('beds.occupancy', { occupied: beds.filter((b) => b.room.ward === ward && b.bed.status === 'occupied').length, total: beds.filter((b) => b.room.ward === ward).length })}</span></h3>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
              {rooms.map((roomId) => {
                const rb = wardBeds.filter((b) => b.room.id === roomId);
                return (
                  <div key={roomId} className="min-w-0 rounded-lg border border-border p-3">
                    <p className="mb-2 break-words text-xs font-medium text-muted-foreground">{t('beds.room', { room: rb[0]!.room.code })} · {t(`roomKind.${rb[0]!.room.kind}`)}</p>
                    <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,11rem),1fr))]">
                      {rb.map((b: BedView) => (
                        <li key={b.bed.id} className={cn('flex min-w-0 flex-col gap-2 rounded-md border-2 bg-surface p-3 text-sm', BED_STYLE[b.bed.status].ring)}>
                          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                            <span className="min-w-0 break-words font-semibold">{b.bed.label}</span>
                            <BedStatusBadge status={b.bed.status} />
                          </div>
                          {b.admission && (
                            <div className="flex min-w-0 items-start gap-2" title={b.admission.patientName}>
                              <Avatar name={b.admission.patientName} size="sm" className="shrink-0" />
                              <span className="min-w-0 flex-1 break-words leading-snug">{b.admission.patientName}</span>
                            </div>
                          )}
                          {b.bed.maintenanceReason && <p className="break-words text-xs text-muted-foreground">{b.bed.maintenanceReason}</p>}
                          <div className="mt-auto flex flex-wrap gap-1 pt-1">
                            {b.bed.status === 'free' && <Can permission={P.hospitalization.create}><Button size="sm" onClick={() => onAdmit(b.bed.id)}>{t('beds.assign')}</Button></Can>}
                            {b.bed.status === 'occupied' && b.admission && <Button size="sm" variant="outline" onClick={() => onOpen(b.admission!.id)}>{t('beds.open')}</Button>}
                            {b.bed.status === 'cleaning' && <Can permission={P.hospitalization.assignBed}><Button size="sm" variant="outline" loading={mState.isPending} onClick={() => mState.mutate({ bedId: b.bed.id, to: 'free', reason: '', from: b.bed.status })}>{t('beds.markReady')}</Button></Can>}
                            {b.bed.status === 'maintenance' && <Can permission={P.hospitalization.assignBed}><Button size="sm" variant="outline" loading={mState.isPending} onClick={() => mState.mutate({ bedId: b.bed.id, to: 'free', reason: '', from: b.bed.status })}>{t('beds.endMaintenance')}</Button></Can>}
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
