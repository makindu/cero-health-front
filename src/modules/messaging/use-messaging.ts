import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { queryKeys } from '@/core/api/query-client';
import { env } from '@/core/config/env';
import { useLocalUser } from '@/core/local/session';
import { usePreferences } from '@/core/preferences/preferences-store';
import { describeBusinessError } from '../_shared/business-error';
import { messaging } from './messaging';
import { HEARTBEAT_MS } from './messaging-rules';

export const MESSAGING_AVAILABLE = env.localMode;
const POLL_MS = 4_000;

/** Les clés contiennent l'utilisateur : changer de rôle de démonstration change de boîte. Actualisation toutes les 4 s (pas de push). */
function useScope() {
  const { activeFacilityId } = usePreferences();
  const user = useLocalUser();
  return { facilityId: activeFacilityId, userId: user.id };
}

export function useConversations() {
  const s = useScope();
  return useQuery({ queryKey: queryKeys.scoped(s.facilityId, 'messaging', 'list', s.userId), queryFn: () => messaging.conversations(), enabled: MESSAGING_AVAILABLE, refetchInterval: POLL_MS, refetchOnWindowFocus: true });
}
export function useThread(conversationId: string | undefined) {
  const s = useScope();
  return useQuery({ queryKey: queryKeys.scoped(s.facilityId, 'messaging', 'thread', s.userId, conversationId ?? ''), queryFn: () => messaging.thread(conversationId!), enabled: MESSAGING_AVAILABLE && Boolean(conversationId), refetchInterval: POLL_MS, refetchOnWindowFocus: true });
}
export function useContacts() {
  const s = useScope();
  return useQuery({ queryKey: queryKeys.scoped(s.facilityId, 'messaging', 'contacts', s.userId), queryFn: () => messaging.contacts(), enabled: MESSAGING_AVAILABLE });
}

export function useMessagingActions() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  const refresh = (): void => { void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'messaging') }); };
  const onError = (error: unknown): void => { toast({ tone: 'danger', title: describeBusinessError(t, error) ?? t('module.saveFailed') }); };
  return {
    send: useMutation({ mutationFn: (i: { conversationId: string; body: string }) => messaging.send(i), onSuccess: refresh, onError }),
    openDirect: useMutation({ mutationFn: (otherId: string) => messaging.openDirect(otherId), onSuccess: refresh, onError }),
    markRead: useMutation({ mutationFn: (id: string) => messaging.markRead(id), onSuccess: refresh }),
  };
}

/** Signale « je suis là » toutes les 20 s tant que l'onglet est visible, et dès que l'on revient dessus. */
export function useHeartbeat(): void {
  const user = useLocalUser();
  const { activeFacilityId } = usePreferences();
  useEffect(() => {
    if (!MESSAGING_AVAILABLE) return;
    const beat = (): void => { if (globalThis.document?.visibilityState !== 'hidden') void messaging.heartbeat().catch(() => undefined); };
    beat();
    const timer = globalThis.setInterval(beat, HEARTBEAT_MS);
    globalThis.document?.addEventListener('visibilitychange', beat);
    return () => { globalThis.clearInterval(timer); globalThis.document?.removeEventListener('visibilitychange', beat); };
  }, [user.id, activeFacilityId]);
}

export function usePresence() {
  const s = useScope();
  return useQuery({ queryKey: queryKeys.scoped(s.facilityId, 'messaging', 'presence', s.userId), queryFn: () => messaging.presence(), enabled: MESSAGING_AVAILABLE, refetchInterval: 10_000, refetchOnWindowFocus: true });
}

export function useReads(conversationId: string | undefined) {
  const s = useScope();
  return useQuery({ queryKey: queryKeys.scoped(s.facilityId, 'messaging', 'reads', s.userId, conversationId ?? ''), queryFn: () => messaging.reads(conversationId!), enabled: MESSAGING_AVAILABLE && Boolean(conversationId), refetchInterval: POLL_MS });
}
