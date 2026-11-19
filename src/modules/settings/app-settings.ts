import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-client';
import { assertPermission } from '@/core/local/session';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { localRepositoryFor } from '../_shared/resource-service';

/**
 * Paramètres de l'établissement modifiables SANS toucher au code (durée d'une consultation, etc.).
 * Mode local : stockés dans l'appareil. Contrat cible proposé : GET/PUT /health/settings/{clé}.
 */
export interface SettingRow { id: string; value: string }

const repo = localRepositoryFor<SettingRow>('/health/app-settings');

export async function readSetting(key: string, fallback: string): Promise<string> {
  try {
    return (await repo.get(key))?.value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function writeSetting(key: string, value: string): Promise<void> {
  assertPermission(PERMISSIONS.administration.manageSettings);
  const current = await repo.get(key);
  if (current) await repo.update(key, (row) => ({ ...row, value }), { action: 'setting' });
  else await repo.insert({ id: key, value }, { action: 'setting' });
}

export function useSetting(key: string, fallback: string) {
  const { activeFacilityId } = usePreferences();
  return useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'app-settings', key), queryFn: () => readSetting(key, fallback), staleTime: 30_000 });
}

export function useInvalidateSetting(key: string) {
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'app-settings', key) });
}

export const CONSULTATION_DURATION_KEY = 'consultation.durationDays';
export const DEFAULT_CONSULTATION_DAYS = 1;
/** Durée valide : nombre entier de jours, de 1 à 365. */
export const validDuration = (raw: string | undefined): number | null => {
  const n = Number((raw ?? '').trim());
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : null;
};
