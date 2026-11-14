import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-client';
import { env } from '@/core/config/env';
import { useLocalUser } from '@/core/local/session';
import { usePreferences } from '@/core/preferences/preferences-store';
import { notifications } from './notifications';

export const NOTIFICATIONS_AVAILABLE = env.localMode;

/** La clé contient l'utilisateur : changer d'utilisateur de démonstration change de boîte de réception. */
export function useNotifications() {
  const { activeFacilityId } = usePreferences();
  const user = useLocalUser();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'notifications', user.id),
    queryFn: () => notifications.list(),
    enabled: NOTIFICATIONS_AVAILABLE,
  });
}

export function useMarkNotifications() {
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  const done = (): void => { void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'notifications') }); };
  return {
    one: useMutation({ mutationFn: (id: string) => notifications.markRead({ id }), onSuccess: done }),
    all: useMutation({ mutationFn: () => notifications.markAllRead(), onSuccess: done }),
  };
}
