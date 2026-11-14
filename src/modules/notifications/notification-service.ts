import type { Unit } from '@/core/local/unit-of-work';
import * as R from './notification-rules';
import { notificationsRef } from './collections';

export interface NotificationDeps {
  run: <T>(fn: (u: Unit) => Promise<T>) => Promise<T>;
}

/** Chacun ne voit et ne marque que SES notifications (aucune permission particulière : ce sont les siennes). */
export function createNotificationService(deps: NotificationDeps) {
  const mine = async (u: Unit): Promise<R.AppNotification[]> => {
    const me = u.ctx.actor;
    return (await u.list(notificationsRef)).filter((n) => R.isFor(n, me)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  };
  return {
    list: (): Promise<R.AppNotification[]> => deps.run(mine),

    markRead: (input: { id: string }): Promise<void> => deps.run(async (u) => {
      const n = (await mine(u)).find((x) => x.id === input.id);
      if (!n || n.readAt) return;
      await u.update(notificationsRef, n.id, (cur) => R.markRead(cur, u.now.toISOString()), { action: 'notification:read' });
    }),

    markAllRead: (): Promise<void> => deps.run(async (u) => {
      for (const n of (await mine(u)).filter((x) => !x.readAt)) {
        await u.update(notificationsRef, n.id, (cur) => R.markRead(cur, u.now.toISOString()), { action: 'notification:read' });
      }
    }),
  };
}
export type NotificationService = ReturnType<typeof createNotificationService>;
