import { useTranslation } from 'react-i18next';
import { SERVICE_KEYS } from '../_shared/demo-people';
import { referenceFromApi, useCareUnits } from '../_shared/reference-data';
import type { Appointment } from './data';

/**
 * Choix de service : API réelle = unités de soin de l'établissement (valeur = identifiant) ;
 * mode local / aperçu = les cinq services fixes (valeur = clé).
 */
export function useServiceOptions(): { value: string; label: string }[] {
  const { t } = useTranslation('appointments');
  const units = useCareUnits();
  if (referenceFromApi()) return (units.data ?? []).map((u) => ({ value: u.id, label: u.name }));
  return SERVICE_KEYS.map((key) => ({ value: key, label: t(`services.${key}`) }));
}

/** Libellé du service d'un rendez-vous : nom de l'unité de soin (API) ou service fixe traduit. */
export function useServiceLabel(): (a: Pick<Appointment, 'service' | 'serviceLabel'>) => string {
  const { t } = useTranslation('appointments');
  return (a) => a.serviceLabel ?? t(`services.${a.service}`);
}
