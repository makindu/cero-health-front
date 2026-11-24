import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { healthClient, queryKeys } from '@/core/api';
import { usePreferences } from '@/core/preferences/preferences-store';
import { env } from '@/core/config/env';
import { setLiveState } from './live-status';
import { publishArrivals } from './new-arrivals';
import { queriesToRefresh, splitArrivals, type LiveEvent } from './live-sync';

type Row = Record<string, unknown>;
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});

interface LiveToken {
  token: string;
  url: string;
  expiresIn: number;
  cursor: number;
}

async function fetchToken(): Promise<LiveToken> {
  const res = await healthClient.post<Row>('/live/token', {});
  const d = rec(res.data);
  return { token: String(d.token ?? ''), url: String(d.url ?? ''), expiresIn: Number(d.expires_in) || 300, cursor: Number(d.cursor) || 0 };
}

/**
 * Temps réel : branche l'application sur la passerelle socket. Quand un autre poste ajoute un patient, l'accueille, l'oriente ou
 * l'appelle, les écrans concernés se mettent à jour seuls. Sans API réelle, ou si le temps réel n'est pas configuré côté serveur,
 * rien ne se passe et l'application fonctionne comme avant (rechargement manuel).
 */
export function useLiveSync(): void {
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();

  useEffect(() => {
    if (env.localMode || !env.api.health) return;
    let stopped = false;
    let socket: Socket | null = null;
    let renewTimer: ReturnType<typeof setTimeout> | undefined;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let cursor = 0;
    const pending = new Set<string>();
    const recentCreations = new Map<string, number>();

    const flush = () => {
      flushTimer = undefined;
      for (const name of pending) void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, name) });
      pending.clear();
    };
    const queue = (names: readonly string[]) => {
      names.forEach((n) => pending.add(n));
      if (!flushTimer) flushTimer = setTimeout(flush, 250);
    };

    /** Signaux reçus : relit les écrans concernés ; une création de catalogue est seulement annoncée (bandeau), sans relire la liste. */
    const handle = (events: readonly LiveEvent[]) => {
      const { refresh, arrivals } = splitArrivals(events, recentCreations, Date.now());
      queue(queriesToRefresh(refresh));
      if (arrivals.length > 0) publishArrivals(activeFacilityId, arrivals);
    };

    /** Après une coupure : relit ce qui a changé entre-temps ; si le serveur ne s'en souvient plus, tout est relu. */
    const catchUp = async () => {
      if (!cursor) return;
      try {
        const res = await healthClient.get<Row>(`/live/changes?since=${cursor}`);
        const d = rec(res.data);
        cursor = Number(d.cursor) || cursor;
        if (d.reset === true) void queryClient.invalidateQueries({ queryKey: ['facility', activeFacilityId ?? 'none'] });
        else handle(Array.isArray(d.events) ? (d.events as LiveEvent[]) : []);
      } catch {
        /* le prochain signal ou rechargement rattrapera */
      }
    };

    const scheduleRenew = (expiresIn: number) => {
      clearTimeout(renewTimer);
      renewTimer = setTimeout(() => {
        void (async () => {
          try {
            const next = await fetchToken();
            socket?.emit('renew', next.token, () => undefined);
            scheduleRenew(next.expiresIn);
          } catch {
            /* la connexion se fermera à l'expiration puis se rétablira avec un nouveau jeton */
          }
        })();
      }, Math.max(30, expiresIn * 0.7) * 1000);
    };

    const connect = async (attempt: number) => {
      setLiveState('connecting');
      let first: LiveToken;
      try {
        first = await fetchToken();
      } catch (error) {
        const status = (error as { status?: number } | null)?.status;
        // 503 = temps réel non configuré ; 403 = aucun droit de lecture : inutile d'insister.
        if (stopped || status === 503 || status === 403 || attempt >= 5) {
          setLiveState('off');
          return;
        }
        retryTimer = setTimeout(() => void connect(attempt + 1), 15_000 * (attempt + 1));
        return;
      }
      if (stopped || !first.url || !first.token) {
        setLiveState('off');
        return;
      }
      cursor = first.cursor;
      socket = io(first.url, {
        // Chaque (re)connexion demande un jeton frais : un jeton périmé ne bloque jamais la reconnexion.
        auth: (cb) => {
          void fetchToken().then((t) => cb({ token: t.token })).catch(() => cb({ token: '' }));
        },
        transports: ['websocket', 'polling'],
        reconnectionDelayMax: 10_000,
      });
      socket.on('ready', (r: { cursor?: number }) => {
        setLiveState('on');
        if (typeof r?.cursor === 'number' && !cursor) cursor = r.cursor;
      });
      socket.on('changes', (p: { cursor?: number; events?: LiveEvent[] }) => {
        if (typeof p?.cursor === 'number') cursor = p.cursor;
        handle(Array.isArray(p?.events) ? p.events : []);
      });
      socket.on('disconnect', () => setLiveState('connecting'));
      socket.io.on('reconnect', () => void catchUp());
      scheduleRenew(first.expiresIn);
    };

    void connect(0);

    return () => {
      stopped = true;
      clearTimeout(renewTimer);
      clearTimeout(flushTimer);
      clearTimeout(retryTimer);
      socket?.disconnect();
      setLiveState('off');
    };
  }, [queryClient, activeFacilityId]);
}
