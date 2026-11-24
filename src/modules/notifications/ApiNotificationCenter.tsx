import { Bell } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { Dropdown } from '@/components/ui/dropdown';
import { queryKeys } from '@/core/api/query-client';
import { useFormatters } from '@/core/i18n/useFormatters';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { usePreferences } from '@/core/preferences/preferences-store';
import { NOTIFICATIONS_READ, apiNotifications, describeNotification } from './notifications-api';

/** Cloche branchée au serveur : le compteur et la liste se mettent à jour dès qu'une notification arrive (signal en direct). */
export function ApiNotificationCenter() {
  const { t } = useTranslation();
  const f = useFormatters();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  const allowed = can(NOTIFICATIONS_READ);
  const unreadQ = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'notifications', 'unread'), queryFn: () => apiNotifications.unread(), enabled: allowed });
  const listQ = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'notifications', 'inbox'), queryFn: () => apiNotifications.list(), enabled: allowed });
  const done = (): void => { void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'notifications') }); };
  const readOne = useMutation({ mutationFn: (id: string) => apiNotifications.read(id), onSuccess: done });
  const readAll = useMutation({ mutationFn: () => apiNotifications.readAll(), onSuccess: done });
  const unread = unreadQ.data ?? 0;
  const items = listQ.data ?? [];
  return (
    <Dropdown
      label={unread > 0 ? t('notifications.titleUnread', { count: unread }) : t('notifications.title')}
      panelClassName="w-96"
      trigger={
        <span className="relative inline-flex">
          <Bell aria-hidden className="size-5" />
          {unread > 0 && (
            <span aria-hidden className="absolute -end-2 -top-2 inline-flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-danger-foreground">{unread > 9 ? '9+' : unread}</span>
          )}
        </span>
      }
    >
      {(close) => (
        <div className="max-h-[70vh] overflow-y-auto">
          {listQ.isError ? (
            <div className="px-3 py-4 text-center">
              <p className="text-sm font-medium">{t('notifications.api.failed', { defaultValue: 'Impossible de charger les notifications' })}</p>
              <button type="button" onClick={() => void listQ.refetch()} className="mt-1 text-xs underline">{t('notifications.api.retry', { defaultValue: 'Réessayer' })}</button>
            </div>
          ) : items.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-sm font-medium">{t('notifications.empty')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('notifications.emptyHint')}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-muted-foreground">{t('notifications.unread', { count: unread })}</span>
                <button type="button" disabled={unread === 0 || readAll.isPending} onClick={() => readAll.mutate()} className="text-xs font-medium text-primary-ink underline disabled:opacity-50">{t('notifications.markAll')}</button>
              </div>
              <ul className="divide-y divide-border">
                {items.map((n) => {
                  const v = describeNotification(n);
                  const isRead = n.readAt !== '';
                  return (
                    <li key={n.id} className={isRead ? 'px-3 py-2 opacity-75' : 'bg-warning-soft px-3 py-2'}>
                      <p className="text-sm font-medium">{t(`notifications.api.${v.key}`, { defaultValue: v.title })}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {f.dateTime(n.createdAt)}
                        {v.lines > 0 && ` · ${t('notifications.api.lines', { defaultValue: '{{count}} ligne(s) différente(s)', count: v.lines })}`}
                      </p>
                      <div className="mt-2 flex gap-3 text-xs">
                        {v.to && <NavLink to={v.to} onClick={() => { if (!isRead) readOne.mutate(n.id); close(); }} className="font-medium text-primary-ink underline">{t('notifications.api.open', { defaultValue: 'Ouvrir' })}</NavLink>}
                        {!isRead && <button type="button" onClick={() => readOne.mutate(n.id)} className="underline">{t('notifications.markRead')}</button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </Dropdown>
  );
}
