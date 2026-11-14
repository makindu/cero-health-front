import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { NAV_GROUPS } from '@/core/navigation/nav-config';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { preferencesStore } from '@/core/preferences/preferences-store';
import { cn } from '@/utils/cn';

interface SidebarNavProps {
  /** Mode icônes seules (rail tablette ou menu réduit). */
  collapsed?: boolean;
  onNavigate?: () => void;
}

/** Liste de navigation filtrée par permissions (confort d'interface ; l'API revérifie). */
export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  return (
    <nav aria-label={t('nav.main')} className="scroll-nav relative flex-1 overflow-y-auto px-2 py-3">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => can(item.permission));
        if (items.length === 0) return null;
        return (
          <div key={group.id} className="mb-4">
            <h2
              className={cn(
                'px-3 pb-1 text-xs font-medium uppercase tracking-wide text-nav-muted',
                collapsed && 'sr-only',
              )}
            >
              {t(group.labelKey)}
            </h2>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const label = t(item.labelKey);
                return (
                  <li key={item.id}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      onClick={onNavigate}
                      title={collapsed ? label : undefined}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-nav-foreground transition-colors hover:bg-nav-active',
                          isActive && 'bg-nav-active font-medium',
                          collapsed && 'justify-center',
                        )
                      }
                    >
                      <Icon aria-hidden className="size-5 shrink-0" />
                      <span className={cn(collapsed && 'sr-only')}>{label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/** Barre latérale fixe : rail sur tablette (md), complète et réductible sur ordinateur (lg). */
export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const toggleLabel = collapsed ? t('nav.expand') : t('nav.collapse');
  return (
    <aside
      className={cn(
        'no-print hidden shrink-0 flex-col border-e border-nav-border bg-nav text-nav-foreground md:flex',
        'md:w-[var(--sidebar-w-rail)]',
        collapsed ? 'lg:w-[var(--sidebar-w-rail)]' : 'lg:w-[var(--sidebar-w)]',
      )}
    >
      <div className="flex h-[var(--header-h)] items-center justify-center border-b border-nav-border px-3 font-semibold">
        <span className="lg:hidden" aria-hidden>
          CH
        </span>
        <span className="hidden lg:inline">
          {collapsed ? <span aria-hidden>CH</span> : t('app.name')}
          {collapsed && <span className="sr-only">{t('app.name')}</span>}
        </span>
      </div>
      {/* Rail (icônes) sur tablette, menu complet ou réduit sur ordinateur. */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <SidebarNav collapsed />
      </div>
      <div className="hidden min-h-0 flex-1 flex-col lg:flex">
        <SidebarNav collapsed={collapsed} />
      </div>
      <button
        type="button"
        onClick={() => preferencesStore.set({ sidebarCollapsed: !collapsed })}
        aria-label={toggleLabel}
        title={toggleLabel}
        className="hidden items-center justify-center gap-2 border-t border-nav-border p-3 text-nav-muted hover:text-nav-foreground lg:flex"
      >
        {collapsed ? (
          <PanelLeftOpen aria-hidden className="size-5" />
        ) : (
          <PanelLeftClose aria-hidden className="size-5" />
        )}
      </button>
    </aside>
  );
}
