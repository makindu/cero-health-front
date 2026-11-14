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
