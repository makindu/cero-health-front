import { useQuery, useQueryClient } from '@tanstack/react-query';
import { healthClient } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { referenceFromApi } from '../_shared/reference-data';

/** Type de service créé par l'établissement (en plus de la liste commune). */
export interface CustomCareUnitType {
  code: string;
  label: string;
}

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export const careUnitTypeFrom = (r: Record<string, unknown>): CustomCareUnitType => ({ code: text(r.code), label: text(r.label) });

/** Options de la liste « Type de service » : types communs (traduits) puis types propres à l'établissement. */
export function careUnitTypeOptions(
  common: readonly string[],
  commonLabel: (code: string) => string,
  custom: readonly CustomCareUnitType[],
): { value: string; label: string }[] {
  const base = common.map((code) => ({ value: code, label: commonLabel(code) }));
  return [...base, ...custom.filter((c) => c.code && !common.includes(c.code)).map((c) => ({ value: c.code, label: c.label }))];
}

export async function createCareUnitType(label: string): Promise<CustomCareUnitType> {
  const res = await healthClient.post<Record<string, unknown>>('/care-unit-types', { label });
  return careUnitTypeFrom((res.data ?? {}) as Record<string, unknown>);
}

/** Types propres à l'établissement actif. Se relit tout seul quand un confrère en ajoute un (temps réel : entité care_unit_types). */
export function useCareUnitTypes() {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'care-unit-types'),
    queryFn: async () => {
      const res = await healthClient.get<Record<string, unknown>[]>('/care-unit-types');
      return (Array.isArray(res.data) ? res.data : []).map(careUnitTypeFrom);
    },
    enabled: referenceFromApi(),
    staleTime: 30_000,
  });
}

export function useRefreshCareUnitTypes(): () => void {
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'care-unit-types') });
}
