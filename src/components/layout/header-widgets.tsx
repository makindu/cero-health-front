import { Bell, Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { Dropdown } from '@/components/ui/dropdown';
import { env } from '@/core/config/env';
import { useFormatters } from '@/core/i18n/useFormatters';
import { useMarkNotifications, useNotifications } from '@/modules/notifications/use-notifications';
import { unreadCount } from '@/modules/notifications/notification-rules';
import { formatQty } from '@/utils/numbers';
import { PersonName } from '@/components/ui/avatar';

/** Sélecteur d'établissement : squelette. Liste réelle et changement : phase 2 (dépend de CERO ID CORE). */
export function FacilitySwitcher() {
  const { t } = useTranslation();
  return (
    <Dropdown
      label={t('facility.label')}
      align="start"
      trigger={
        <>
          <Building2 aria-hidden className="size-5" />
          <span className="hidden max-w-40 truncate text-sm sm:inline">{t('facility.notConnected')}</span>
        </>
      }
    >
      <p className="px-3 py-2 text-sm text-muted-foreground">{t('facility.none')}</p>
    </Dropdown>
  );
}

/** Centre de notifications. En mode local : les notifications adressées à l'utilisateur connecté (jamais envoyées hors de l'appareil). */
export function NotificationCenter() {
  return env.localMode ? <LocalNotificationCenter /> : <EmptyNotificationCenter />;
}

function EmptyNotificationCenter() {
  const { t } = useTranslation();
  return (
    <Dropdown label={t('notifications.title')} trigger={<Bell aria-hidden className="size-5" />}>
      <div className="px-3 py-4 text-center">
        <p className="text-sm font-medium">{t('notifications.empty')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('notifications.emptyHint')}</p>
      </div>
    </Dropdown>
  );
}

function LocalNotificationCenter() {
  const { t } = useTranslation();
  const f = useFormatters();
  const list = useNotifications();
  const mark = useMarkNotifications();
  const items = list.data ?? [];
  const unread = unreadCount(items);
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
          {items.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-sm font-medium">{t('notifications.empty')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('notifications.emptyHint')}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-muted-foreground">{t('notifications.unread', { count: unread })}</span>
                <button type="button" disabled={unread === 0} onClick={() => mark.all.mutate()} className="text-xs font-medium text-primary-ink underline disabled:opacity-50">{t('notifications.markAll')}</button>
              </div>
              <ul className="divide-y divide-border">
                {items.map((n) => (
                  <li key={n.id} className={n.readAt ? 'px-3 py-2 opacity-75' : 'bg-warning-soft px-3 py-2'}>
                    <p className="text-sm font-medium">{t('notifications.rxDeviation.title', { number: n.payload.rxNumber })}</p>
                    <div className="mt-1"><PersonName name={n.payload.patientName} size="sm" sub={t('notifications.rxDeviation.metaShort', { by: n.payload.by, at: f.dateTime(n.createdAt) })} /></div>
                    <ul className="mt-1 space-y-1 text-xs">
                      {n.payload.lines.map((l, i) => (
                        <li key={i}>
                          <span className="font-medium">{l.rxLabel}</span> → {l.itemLabel} × {formatQty(l.quantity)}
                          <span className="block text-muted-foreground">{l.kinds.map((k) => t(`notifications.rxDeviation.${k}`)).join(' · ')} — {l.reason}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex gap-3 text-xs">
                      <NavLink to="/prescriptions" onClick={() => { mark.one.mutate(n.id); close(); }} className="font-medium text-primary-ink underline">{t('notifications.openRx')}</NavLink>
                      {!n.readAt && <button type="button" onClick={() => mark.one.mutate(n.id)} className="underline">{t('notifications.markRead')}</button>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Dropdown>
  );
}
