import type { ReactNode } from 'react';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui/breadcrumbs';

interface PageHeaderProps {
  title: string;
  /** Élément placé avant le titre (ex. avatar du patient). */
  leading?: ReactNode;
  description?: string;
  breadcrumbs?: readonly BreadcrumbItem[];
  actions?: ReactNode;
  /** Version resserrée : moins de marge et titre plus petit, pour les pages d'exploitation. */
  compact?: boolean;
}

export function PageHeader({ title, description, breadcrumbs, actions, leading, compact }: PageHeaderProps) {
  return (
    <div className={compact ? 'mb-3 space-y-1' : 'mb-6 space-y-2'}>
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <div className="min-w-0">
          <h1 className={compact ? 'text-xl font-semibold tracking-tight' : 'text-2xl font-semibold tracking-tight'}>{title}</h1>
          {description && <p className={compact ? 'text-sm text-muted-foreground' : 'mt-1 text-sm text-muted-foreground'}>{description}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
