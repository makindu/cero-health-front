import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export interface BreadcrumbItem {
  label: string;
  /** Absent sur la page courante. */
  to?: string;
}

export function Breadcrumbs({ items }: { items: readonly BreadcrumbItem[] }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('breadcrumb.label')} className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              <li>
                {item.to && !last ? (
                  <Link to={item.to} className="rounded-sm hover:text-foreground hover:underline">
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current={last ? 'page' : undefined} className={last ? 'text-foreground' : ''}>
                    {item.label}
                  </span>
                )}
              </li>
              {!last && (
                <li aria-hidden className="flex">
                  <ChevronRight className="size-4 rtl:rotate-180" />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
