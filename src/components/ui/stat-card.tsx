import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/utils/cn';
import type { StatusTone } from './badge';

const toneClasses: Record<StatusTone, string> = {
  success: 'bg-success-soft text-success-ink',
  warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-danger-soft text-danger-ink',
  info: 'bg-info-soft text-info-ink',
  neutral: 'bg-primary-soft text-primary-ink',
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: LucideIcon;
  tone?: StatusTone;
  /** Lien vers la rubrique concernée. */
  to?: string;
}

/** Indicateur chiffré. L'icône et le libellé portent le sens ; la couleur n'est qu'un renfort. */
export function StatCard({ label, value, hint, icon: Icon, tone = 'neutral', to }: StatCardProps) {
  const body = (
    <div className="flex items-start gap-3">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-md', toneClasses[tone])}>
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
  const classes = 'block rounded-card border border-border bg-surface p-4 shadow-card';
  return to ? (
    <Link to={to} className={cn(classes, 'transition-colors hover:bg-surface-muted')}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

export interface StatStripItem {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: StatusTone;
}

/** Bande d'indicateurs sur une seule ligne : même information que StatGrid pour le tiers de la hauteur. */
export function StatStrip({ items }: { items: readonly StatStripItem[] }) {
  return (
    <div className="mb-4 grid grid-cols-2 divide-border rounded-card border border-border bg-surface shadow-card sm:grid-cols-3 sm:divide-x lg:grid-cols-5">
      {items.map(({ label, value, icon: Icon, tone = 'neutral' }) => (
        <div key={label} className="flex items-center gap-3 px-4 py-2.5">
          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', toneClasses[tone])}>
            <Icon aria-hidden className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold leading-tight tabular-nums text-foreground">{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
