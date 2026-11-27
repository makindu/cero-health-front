import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { PersonName } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { useCareUnits, useStaffMembers, type StaffMember } from '../_shared/reference-data';
import { apiScope } from '../reports/scope-api';

/**
 * Rapports financiers par service : on limite ce qu'un utilisateur voit (entrées et sorties) à quelques services.
 * Sans service choisi, l'utilisateur voit tout.
 */
export function ReportScopeCard() {
  const { t } = useTranslation('administration');
  const { activeFacilityId } = usePreferences();
  const units = useCareUnits();
  const staff = useStaffMembers();
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const scopes = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'report-scopes'), queryFn: apiScope.list });
  const byUser = new Map((scopes.data ?? []).map((s) => [s.userId, s.careUnitIds]));
  const unitName = (id: string) => units.data?.find((u) => u.id === id)?.name ?? `#${id}`;

  return (
    <Card>
      <h2 className="font-semibold">{t('scope.title', { defaultValue: 'Rapports financiers par service' })}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{t('scope.hint', { defaultValue: 'Choisissez les services dont chaque utilisateur voit les entrées (factures, paiements) et les sorties (dépenses). Sans service choisi, il voit tout.' })}</p>
      <ul className="divide-y">
        {(staff.data ?? []).map((m) => {
          const mine = byUser.get(m.userId) ?? [];
          return (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <PersonName name={m.name} />
                <p className="text-xs text-muted-foreground">{mine.length === 0 ? t('scope.all', { defaultValue: 'Tous les services' }) : mine.map(unitName).join(', ')}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing(m)}>{t('scope.edit', { defaultValue: 'Choisir les services' })}</Button>
            </li>
          );
        })}
      </ul>
      {editing && <ScopeDialog member={editing} current={byUser.get(editing.userId) ?? []} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function ScopeDialog({ member, current, onClose }: { member: StaffMember; current: string[]; onClose: () => void }) {
  const { t } = useTranslation('administration');
  const toast = useToast();
  const qc = useQueryClient();
  const { activeFacilityId } = usePreferences();
  const units = useCareUnits();
  const [picked, setPicked] = useState<string[]>(current);
  const save = useMutation({
    mutationFn: () => apiScope.set(member.userId, picked),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'report-scopes') });
      void qc.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'reports') });
      toast({ tone: 'success', title: t('scope.saved', { defaultValue: 'Services enregistrés' }) });
      onClose();
    },
    onError: () => toast({ tone: 'danger', title: t('scope.failed', { defaultValue: 'Enregistrement impossible' }) }),
  });
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Dialog open onClose={onClose} variant="center" title={member.name} description={t('scope.dialogHint', { defaultValue: 'Aucun service coché : cet utilisateur voit tous les services.' })}
      footer={<>
        <Button variant="outline" onClick={onClose}>{t('common.cancel', { defaultValue: 'Annuler' })}</Button>
        <Button loading={save.isPending} onClick={() => save.mutate()}>{t('scope.save', { defaultValue: 'Enregistrer' })}</Button>
      </>}>
      <ul className="grid gap-2 sm:grid-cols-2">
        {(units.data ?? []).map((u) => (
          <li key={u.id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={picked.includes(u.id)} onChange={() => toggle(u.id)} />{u.name}</label></li>
        ))}
      </ul>
    </Dialog>
  );
}
