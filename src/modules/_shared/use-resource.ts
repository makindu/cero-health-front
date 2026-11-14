import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api';
import { usePreferences } from '@/core/preferences/preferences-store';
import type { ListParams, ResourceService } from './resource-service';

/**
 * Hooks de lecture/écriture. Toutes les clés de cache sont rattachées à l'établissement actif
 * (queryKeys.scoped) : aucune donnée d'un établissement ne peut s'afficher dans un autre.
 */

export function useResourceList<T extends { id: string }>(
  name: string,
  service: ResourceService<T>,
  params: ListParams,
) {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, name, 'list', params),
    queryFn: () => service.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useResourceItem<T extends { id: string }>(
  name: string,
  service: ResourceService<T>,
  id: string | undefined,
) {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, name, 'item', id),
    queryFn: () => service.get(id ?? ''),
    enabled: Boolean(id),
  });
}

export function useCreateResource<T extends { id: string }>(
  name: string,
  service: ResourceService<T>,
) {
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  return useMutation({
    mutationFn: (input: Record<string, string>) => service.create(input),
    onSuccess: (result) => {
      // En démonstration rien n'a changé côté serveur : inutile de recharger.
      if (!result.isDemo) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, name) });
      }
    },
  });
}
