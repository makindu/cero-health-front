import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface CardProps {
  title?: string;
  description?: string;
  /** Actions alignées à droite de l'en-tête. */
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Card({ title, description, actions, children, className }: CardProps) {
  return (
    <section
      className={cn('rounded-card border border-border bg-surface shadow-card', className)}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children && <div className="p-4 sm:p-5">{children}</div>}
    </section>
  );
}
