import type { TFunction } from 'i18next';
import { unitById } from '../_shared/reference-data';

/** Nom d'un service : unité de soin du serveur (mode API) ou service fictif traduit (mode local). */
export function wardLabel(t: TFunction, ward: string): string {
  return unitById(ward)?.name ?? t(`services.${ward}`, { defaultValue: ward });
}
