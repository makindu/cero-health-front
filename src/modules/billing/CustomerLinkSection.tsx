import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/feedback/toast';
import { ApiError } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { describeBusinessError } from '../_shared/business-error';
import { apiCustomer, canLink } from './customer-api';

/**
 * Fiche client du patient : obligatoire avant toute facture. Affiche un état clair, propose de lier un client existant
 * (doublons détectés par le serveur) ou de créer la fiche. Rafraîchit la facturation du patient après le lien.
 */
export function CustomerLinkSection({ patientId }: { patientId: string }) {
  const { t } = useTranslation('finance');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  const canLinkCustomer = can(PERMISSIONS.billing.linkCustomer);
  const [confirmNew, setConfirmNew] = useState(false);

  const keyOf = queryKeys.scoped(activeFacilityId, 'billing', 'customer', patientId);
  const has = useQuery({ queryKey: keyOf, queryFn: () => apiCustomer.hasCustomer(patientId) });
  const candidates = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'billing', 'customer-candidates', patientId),
    queryFn: () => apiCustomer.candidates(patientId),
    enabled: canLinkCustomer && has.data === false,
  });

  const done = (): void => {
    toast({ tone: 'success', title: t('customerLink.done', { defaultValue: 'Fiche client liée au patient' }) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'billing') });
    void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'patients') });
  };
  const failed = (error: unknown): void => {
    const business = describeBusinessError(t, error);
    const server = !business && error instanceof ApiError && error.status && error.status < 500 ? error.message : undefined;
    toast({ tone: 'danger', title: business ?? server ?? t('module.saveFailed') });
  };
  const link = useMutation({ mutationFn: (customerId: string) => apiCustomer.link(patientId, customerId), onSuccess: done, onError: failed });
  const [key] = useState(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `cust-${Date.now()}`));
  const create = useMutation({ mutationFn: () => apiCustomer.create(patientId, confirmNew, key), onSuccess: done, onError: failed });

  if (has.isPending || has.data !== false) {
    return has.data === true
      ? <p className="text-sm text-muted-foreground">{t('customerLink.linked', { defaultValue: 'Fiche client liée : la facturation est possible.' })}</p>
      : null;
  }

  const list = candidates.data ?? [];
  return (
    <section aria-label={t('customerLink.title', { defaultValue: 'Fiche client' })} className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3">
      <h3 className="text-sm font-semibold">{t('customerLink.title', { defaultValue: 'Fiche client' })}</h3>
      <p className="text-sm">{t('customerLink.missing', { defaultValue: "Ce patient n'a pas encore de fiche client. Elle est nécessaire pour facturer ses consommations." })}</p>
      {!canLinkCustomer ? (
        <p className="text-sm text-muted-foreground">{t('customerLink.noRight', { defaultValue: "Demandez à une personne autorisée à lier un client (droit « lier un client ») de le faire." })}</p>
      ) : (
        <>
          {list.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium">{t('customerLink.candidates', { defaultValue: 'Clients existants qui ressemblent à ce patient' })}</p>
              <ul className="divide-y divide-border text-sm">
                {list.map((c) => (
                  <li key={c.customerId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{c.name}{c.phone ? ` · ${c.phone}` : ''}</span>
                    {canLink(c)
                      ? <Button size="sm" variant="outline" disabled={link.isPending} onClick={() => link.mutate(c.customerId)}>{t('customerLink.link', { defaultValue: 'Lier ce client' })}</Button>
                      : <span className="text-muted-foreground">{t('customerLink.taken', { defaultValue: 'Déjà lié à un autre patient' })}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {list.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmNew} onChange={(e) => setConfirmNew(e.target.checked)} />
              {t('customerLink.confirmNone', { defaultValue: 'Aucun de ces clients ne correspond à ce patient' })}
            </label>
          )}
          <Button size="sm" disabled={create.isPending || candidates.isPending || (list.length > 0 && !confirmNew)} onClick={() => create.mutate()}>
            {t('customerLink.create', { defaultValue: 'Créer la fiche client' })}
          </Button>
        </>
      )}
    </section>
  );
}
