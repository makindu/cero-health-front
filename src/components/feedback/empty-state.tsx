import { Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon: Icon = Inbox, action }: EmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
        <Icon aria-hidden className="size-6" />
      </span>
      <h3 className="text-base font-semibold text-foreground">{title ?? t('states.empty')}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description ?? t('states.emptyHint')}</p>
      {action}
    </div>
  );
}
