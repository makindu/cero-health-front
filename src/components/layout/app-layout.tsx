import { Menu } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { env } from '@/core/config/env';
import { usePreferences } from '@/core/preferences/preferences-store';
import { StatusBadge } from '@/components/ui/badge';
import { LocalModeBanner } from './local-mode-banner';
import { LanguageSwitcher } from './language-switcher';
import { FacilitySwitcher, NotificationCenter } from './header-widgets';
import { Sidebar, SidebarNav } from './sidebar';
import { ThemeSwitcher } from './theme-switcher';
import { UserMenu } from './user-menu';

export function AppLayout() {
  const { t } = useTranslation();
  const { sidebarCollapsed } = usePreferences();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell relative flex h-dvh overflow-hidden bg-background text-foreground">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      >
        {t('app.skipToContent')}
      </a>

      <Sidebar collapsed={sidebarCollapsed} />

      {/* Menu mobile : tiroir modal (< md). */}
      <Dialog
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        variant="drawer"
        ariaLabel={t('nav.main')}
      >
        <div className="flex h-full flex-col bg-nav text-nav-foreground">
          <div className="flex h-[var(--header-h)] items-center border-b border-nav-border px-4 font-semibold">
            {t('app.name')}
          </div>
          <SidebarNav onNavigate={() => setMenuOpen(false)} />
        </div>
      </Dialog>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {env.localMode && <LocalModeBanner />}
        <header className="no-print relative z-20 flex h-[var(--header-h)] shrink-0 items-center gap-1 border-b border-border bg-surface px-2 sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={t('nav.open')}
            onClick={() => setMenuOpen(true)}
          >
            <Menu aria-hidden className="size-5" />
          </Button>
          <FacilitySwitcher />
          {env.previewMode && (
            <span title={t('preview.hint')} className="ms-2">
              <StatusBadge tone="warning">{t('preview.badge')}</StatusBadge>
            </span>
          )}
          <div className="ms-auto flex items-center gap-0.5">
            <NotificationCenter />
            <LanguageSwitcher />
            <ThemeSwitcher />
            <UserMenu />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="app-main min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 focus:outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
