import { useState } from 'react';
import { Warehouse } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { Select } from '@/components/forms/controls';
import { healthClient } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { useToast } from '@/components/feedback/toast';
import { ActionDialog } from '../finance/ActionDialog';
import { resetReference } from '../_shared/reference-data';
import type { HospitalService } from './data';

interface Deposit { id: string; name: string }

/** Dépôts de stock de l'établissement (lecture seule). Réservé à qui gère les services : le serveur revérifie. */
function useStockDeposits(enabled: boolean) {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'administration', 'stock-deposits'),
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Deposit[]> => {
      const res = await healthClient.get<{ id: unknown; name: unknown }[]>('/stock-deposits');
      return (Array.isArray(res.data) ? res.data : []).map((d) => ({ id: String(d.id), name: String(d.name) }));
    },
  });
}

/**
 * Cellule « Dépôt de stock » d'un service : le dépôt d'où sont prélevés les produits consommés lors des visites du service.
 * Le lien se fait au niveau du service (pas utilisateur par utilisateur).
 */
export function ServiceDepositCell({ service }: { service: HospitalService }) {
  const { t } = useTranslation('administration');
  const { can } = usePermissions();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  const manage = can(PERMISSIONS.administration.manageServices);
  const deposits = useStockDeposits(manage);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState('');
  const current = service.depositId ? deposits.data?.find((d) => d.id === service.depositId) : undefined;
  const label = service.depositId ? current?.name ?? `#${service.depositId}` : t('services.depositNone');

  const save = useMutation({
    mutationFn: () => healthClient.patch(`/care-units/${service.id}`, { deposit_id: choice === '' ? null : Number(choice) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'services') });
      resetReference();
      toast({ tone: 'success', title: t('services.depositSaved') });
      setOpen(false);
    },
    onError: () => toast({ tone: 'danger', title: t('services.depositFailed') }),
  });

  return (
    <div className="flex items-center gap-2">
      <span className={service.depositId ? '' : 'text-muted-foreground'}>{label}</span>
      {manage && (
        <Button size="sm" variant="ghost" leftIcon={<Warehouse className="size-4" aria-hidden />} onClick={() => { setChoice(service.depositId ?? ''); setOpen(true); }}>
          {t('services.depositEdit')}
        </Button>
      )}
      <ActionDialog open={open} onClose={() => setOpen(false)} title={`${t('services.depositTitle')} — ${service.name ?? ''}`} description={t('services.depositBody')}
        submitLabel={t('services.depositSave')} pending={save.isPending} canSubmit={choice !== (service.depositId ?? '')} dirty={choice !== (service.depositId ?? '')} onSubmit={() => save.mutate()}>
        <FormField label={t('services.deposit')}>
          {(c) => (
            <Select {...c} value={choice} onChange={(e) => setChoice(e.target.value)} disabled={deposits.isPending}>
              <option value="">{t('services.depositNone')}</option>
              {(deposits.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          )}
        </FormField>
        {deposits.isError && <p role="alert" className="text-sm text-danger">{t('services.depositLoadFailed')}</p>}
      </ActionDialog>
    </div>
  );
}
