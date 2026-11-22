import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/feedback/spinner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { Input, Select } from '@/components/forms/controls';
import { ActionDialog } from '../finance/ActionDialog';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { unitById } from '../_shared/reference-data';
import { apiHospital, type ConfigRoom } from './hospital-api';
import { RoomSetupDialog } from './RoomSetupDialog';
import { useHospitalMutation } from './use-hospital';

/** Espace du gestionnaire d'hospitalisation : services, chambres et lits (ajout, activation, désactivation). */
export function RoomsConfig() {
  const { t } = useTranslation('hospitalization');
  const { activeFacilityId } = usePreferences();
  const rooms = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'hospital', 'rooms'), queryFn: () => apiHospital.rooms() });
  const [adding, setAdding] = useState(false);
  type Target = { type: 'room'; room: ConfigRoom } | { type: 'bed'; id: string; label: string };
  const [edit, setEdit] = useState<Target | null>(null);
  const [del, setDel] = useState<Target | null>(null);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'standard' | 'private'>('standard');
  const [labels, setLabels] = useState<Record<string, string>>({});
  const roomActive = useHospitalMutation(apiHospital.setRoomActive, { successTitle: t('config.saved', { defaultValue: 'Modification enregistrée.' }) });
  const bedActive = useHospitalMutation(apiHospital.setBedActive, { successTitle: t('config.saved', { defaultValue: 'Modification enregistrée.' }) });
  const saved = t('config.saved', { defaultValue: 'Modification enregistrée.' });
  const mEditRoom = useHospitalMutation(apiHospital.updateRoom, { successTitle: saved, onDone: () => setEdit(null) });
  const mRenameBed = useHospitalMutation(apiHospital.renameBed, { successTitle: saved, onDone: () => setEdit(null) });
  const mDelRoom = useHospitalMutation(apiHospital.deleteRoom, { successTitle: t('config.deleted', { defaultValue: 'Supprimé.' }), onDone: () => setDel(null) });
  const mDelBed = useHospitalMutation(apiHospital.deleteBed, { successTitle: t('config.deleted', { defaultValue: 'Supprimé.' }), onDone: () => setDel(null) });
  const addBed = useHospitalMutation(apiHospital.addBed, { successTitle: t('config.bedAdded', { defaultValue: 'Lit ajouté.' }) });
  if (rooms.isPending) return <Skeleton className="h-64" />;
  if (rooms.error) return <ErrorState error={rooms.error} onRetry={() => void rooms.refetch()} />;
  const byUnit = new Map<string, ConfigRoom[]>();
  for (const r of rooms.data) byUnit.set(r.careUnitId, [...(byUnit.get(r.careUnitId) ?? []), r]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('config.hint', { defaultValue: 'Une chambre ou un lit désactivé n’est plus proposé pour les admissions. Un lit occupé ne peut pas être désactivé.' })}</p>
        <Button leftIcon={<Plus className="size-4" />} onClick={() => setAdding(true)}>{t('setup.button', { defaultValue: 'Ajouter une chambre' })}</Button>
      </div>
      {rooms.data.length === 0 && <EmptyState title={t('config.empty', { defaultValue: 'Aucune chambre pour le moment.' })} description={t('config.emptyHint', { defaultValue: 'Ajoutez une chambre et ses lits pour pouvoir admettre des patients.' })} />}
      {[...byUnit.entries()].map(([unitId, list]) => (
        <section key={unitId} className="space-y-2">
          <h3 className="text-sm font-semibold">{unitById(unitId)?.name ?? `Service n°${unitId}`}</h3>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),1fr))]">
            {list.map((room) => (
              <div key={room.id} className="min-w-0 space-y-3 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{t('beds.room', { room: room.code })} <span className="text-xs font-normal text-muted-foreground">· {t(`roomKind.${room.kind}`)}{room.active ? '' : ` · ${t('config.inactive', { defaultValue: 'désactivée' })}`}</span></p>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setText(room.code); setKind(room.kind); setEdit({ type: 'room', room }); }}>{t('config.edit', { defaultValue: 'Modifier' })}</Button>
                    <Button size="sm" variant="outline" loading={roomActive.isPending} onClick={() => roomActive.mutate({ roomId: room.id, active: !room.active })}>
                      {room.active ? t('config.deactivate', { defaultValue: 'Désactiver' }) : t('config.activate', { defaultValue: 'Réactiver' })}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDel({ type: 'room', room })}>{t('config.delete', { defaultValue: 'Supprimer' })}</Button>
                  </div>
                </div>
                <ul className="space-y-1 text-sm">
                  {room.beds.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-2">
                      <span className={b.active ? '' : 'text-muted-foreground line-through'}>{b.label} <span className="text-xs text-muted-foreground">· {t(`bedStatus.${b.status}`, { defaultValue: b.status })}</span></span>
                      <span className="flex shrink-0 gap-1">
                        <Button size="sm" variant="ghost" disabled={b.status === 'occupied'} onClick={() => { setText(b.label); setEdit({ type: 'bed', id: b.id, label: b.label }); }}>{t('config.edit', { defaultValue: 'Modifier' })}</Button>
                        <Button size="sm" variant="ghost" disabled={b.status === 'occupied'} onClick={() => bedActive.mutate({ bedId: b.id, active: !b.active })}>
                          {b.active ? t('config.deactivate', { defaultValue: 'Désactiver' }) : t('config.activate', { defaultValue: 'Réactiver' })}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={b.status === 'occupied'} onClick={() => setDel({ type: 'bed', id: b.id, label: b.label })}>{t('config.delete', { defaultValue: 'Supprimer' })}</Button>
                      </span>
                    </li>
                  ))}
                </ul>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const label = (labels[room.id] ?? '').trim(); if (label) addBed.mutate({ roomId: room.id, label }, { onSuccess: () => setLabels((l) => ({ ...l, [room.id]: '' })) }); }}>
                  <Input aria-label={t('config.newBed', { defaultValue: 'Nouveau lit' })} placeholder={`${room.code}-${room.beds.length + 1}`} value={labels[room.id] ?? ''} onChange={(e) => setLabels((l) => ({ ...l, [room.id]: e.target.value }))} />
                  <Button type="submit" size="sm" loading={addBed.isPending} disabled={(labels[room.id] ?? '').trim() === ''}>{t('config.addBed', { defaultValue: 'Ajouter un lit' })}</Button>
                </form>
              </div>
            ))}
          </div>
        </section>
      ))}
      <ActionDialog open={edit !== null} onClose={() => setEdit(null)} title={edit?.type === 'room' ? t('config.editRoom', { defaultValue: 'Modifier la chambre' }) : t('config.editBed', { defaultValue: 'Renommer le lit' })}
        submitLabel={t('config.save', { defaultValue: 'Enregistrer' })} pending={mEditRoom.isPending || mRenameBed.isPending} canSubmit={text.trim() !== ''}
        onSubmit={() => { if (edit?.type === 'room') mEditRoom.mutate({ roomId: edit.room.id, code: text, kind }); else if (edit) mRenameBed.mutate({ bedId: edit.id, label: text }); }}>
        <FormField label={edit?.type === 'room' ? t('setup.code', { defaultValue: 'Code de la chambre' }) : t('config.newBed', { defaultValue: 'Nom du lit' })} required>{(c) => <Input {...c} value={text} onChange={(e) => setText(e.target.value)} />}</FormField>
        {edit?.type === 'room' && (
          <FormField label={t('setup.kind', { defaultValue: 'Type' })}>
            {(c) => <Select {...c} value={kind} onChange={(e) => setKind(e.target.value as 'standard' | 'private')}><option value="standard">{t('roomKind.standard')}</option><option value="private">{t('roomKind.private')}</option></Select>}
          </FormField>
        )}
      </ActionDialog>
      <ActionDialog open={del !== null} onClose={() => setDel(null)} tone="danger" title={t('config.deleteTitle', { defaultValue: 'Supprimer définitivement ?' })}
        description={del?.type === 'room'
          ? t('config.deleteRoomBody', { defaultValue: 'La chambre et tous ses lits seront supprimés. Impossible si un lit a déjà accueilli un patient : désactivez-la alors.' })
          : t('config.deleteBedBody', { defaultValue: 'Ce lit sera supprimé. Impossible s’il a déjà accueilli un patient : désactivez-le alors.' })}
        submitLabel={t('config.delete', { defaultValue: 'Supprimer' })} pending={mDelRoom.isPending || mDelBed.isPending}
        onSubmit={() => { if (del?.type === 'room') mDelRoom.mutate({ roomId: del.room.id }); else if (del) mDelBed.mutate({ bedId: del.id }); }}>
        <p className="text-sm font-medium">{del?.type === 'room' ? t('beds.room', { room: del.room.code }) : del?.label}</p>
      </ActionDialog>
      {adding && <RoomSetupDialog onClose={() => setAdding(false)} />}
    </div>
  );
}
