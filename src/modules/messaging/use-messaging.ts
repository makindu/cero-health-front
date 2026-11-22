import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { queryKeys } from '@/core/api/query-client';
import { env } from '@/core/config/env';
import { useAuth } from '@/core/auth/cero-id';
import { useLocalUser } from '@/core/local/session';
import { usePreferences } from '@/core/preferences/preferences-store';
import { describeBusinessError } from '../_shared/business-error';
import { referenceFromApi } from '../_shared/reference-data';
import { messaging } from './messaging';
import { fetchDirectory } from './messaging-api';
import { HEARTBEAT_MS } from './messaging-rules';

export const MESSAGING_AVAILABLE = env.localMode || referenceFromApi();
/** Mode API : les signaux du serveur rafraîchissent aussitôt ; l'actualisation périodique ne sert que de filet de sécurité. */
const POLL_MS = referenceFromApi() ? 20_000 : 4_000;

export interface ChatMe { id: string; name: string }

function useLocalMe(): ChatMe | null {
  const u = useLocalUser();
  return { id: u.id, name: u.name };
}
/** Mode API : « moi » est mon profil de personnel (celui qu'attend le serveur). Sans profil actif, pas de messagerie. */
function useApiMe(): ChatMe | null {
  const { user } = useAuth();
  const { activeFacilityId } = usePreferences();
  // Annuaire de la messagerie (ouvert à tous) : la liste du personnel exige un droit que beaucoup d'utilisateurs n'ont pas.
  const dir = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'messaging', 'directory'), queryFn: () => fetchDirectory(true), enabled: referenceFromApi(), staleTime: 60_000 });
  const mine = (dir.data ?? []).find((m) => m.userId === String(user?.id ?? ''));
  return mine ? { id: mine.id, name: mine.name } : null;
}
/** Le mode est fixé au démarrage : le choix du hook ne change jamais en cours de route. */
export const useChatMe: () => ChatMe | null = referenceFromApi() ? useApiMe : useLocalMe;

/** Les clés contiennent l'utilisateur : changer de rôle de démonstration change de boîte. Actualisation toutes les 4 s (pas de push). */
function useScope() {
  const { activeFacilityId } = usePreferences();
  const me = useChatMe();
  return { facilityId: activeFacilityId, userId: me?.id ?? '' };
}

export function useConversations() {
  const s = useScope();
  return useQuery({ queryKey: queryKeys.scoped(s.facilityId, 'messaging', 'list', s.userId), queryFn: () => messaging.conversations(), enabled: MESSAGING_AVAILABLE && s.userId !== '', refetchInterval: POLL_MS, refetchOnWindowFocus: true });
}
export function useThread(conversationId: string | undefined) {
  const s = useScope();
  return useQuery({ queryKey: queryKeys.scoped(s.facilityId, 'messaging', 'thread', s.userId, conversationId ?? ''), queryFn: () => messaging.thread(conversationId!), enabled: MESSAGING_AVAILABLE && s.userId !== '' && Boolean(conversationId), refetchInterval: POLL_MS, refetchOnWindowFocus: true });
}
export function useContacts() {
  const s = useScope();
  return useQuery({ queryKey: queryKeys.scoped(s.facilityId, 'messaging', 'contacts', s.userId), queryFn: () => messaging.contacts(), enabled: MESSAGING_AVAILABLE && s.userId !== '', select: (list) => list.filter((c) => c.id !== s.userId) });
}

/** Qui écrit dans la conversation ouverte. Relu à chaque signal du serveur ; tant que quelqu'un écrit, relu toutes les 3 s pour voir l'indicateur s'éteindre. */
export function useTypists(conversationId: string | undefined) {
  const s = useScope();
  return useQuery({
    queryKey: queryKeys.scoped(s.facilityId, 'messaging', 'typing', s.userId, conversationId ?? ''),
    queryFn: () => messaging.typists(conversationId!),
    enabled: referenceFromApi() && s.userId !== '' && Boolean(conversationId),
    refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? 3_000 : false),
  });
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
    createChannel: useMutation({ mutationFn: (i: { title: string; memberIds: string[] }) => messaging.createChannel(i), onSuccess: refresh, onError }),
    addMembers: useMutation({ mutationFn: (i: { conversationId: string; memberIds: string[] }) => messaging.addMembers(i), onSuccess: refresh, onError }),
    typing: useMutation({ mutationFn: (id: string) => messaging.typing(id) }),   // silencieux : jamais de message d'erreur pour un simple indicateur
    markRead: useMutation({ mutationFn: (id: string) => messaging.markRead(id), onSuccess: refresh }),
  };
}

/** Signale « je suis là » toutes les 20 s tant que l'onglet est visible, et dès que l'on revient dessus. */
export function useHeartbeat(): void {
  const me = useChatMe();
  const { activeFacilityId } = usePreferences();
  const meId = me?.id ?? '';
  useEffect(() => {
    if (!MESSAGING_AVAILABLE || !meId) return;
    const beat = (): void => { if (globalThis.document?.visibilityState !== 'hidden') void messaging.heartbeat().catch(() => undefined); };
    beat();
    const timer = globalThis.setInterval(beat, HEARTBEAT_MS);
    globalThis.document?.addEventListener('visibilitychange', beat);
    return () => { globalThis.clearInterval(timer); globalThis.document?.removeEventListener('visibilitychange', beat); };
  }, [meId, activeFacilityId]);
}

export function usePresence() {
  const s = useScope();
  return useQuery({ queryKey: queryKeys.scoped(s.facilityId, 'messaging', 'presence', s.userId), queryFn: () => messaging.presence(), enabled: MESSAGING_AVAILABLE && s.userId !== '', refetchInterval: 10_000, refetchOnWindowFocus: true });
}

export function useReads(conversationId: string | undefined) {
  const s = useScope();
  return useQuery({ queryKey: queryKeys.scoped(s.facilityId, 'messaging', 'reads', s.userId, conversationId ?? ''), queryFn: () => messaging.reads(conversationId!), enabled: MESSAGING_AVAILABLE && s.userId !== '' && Boolean(conversationId), refetchInterval: POLL_MS });
}
