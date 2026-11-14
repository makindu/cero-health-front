import {
  CircleAlert,
  CircleCheck,
  CircleDot,
  Info,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const tones: Record<StatusTone, { classes: string; icon: LucideIcon }> = {
  success: { classes: 'bg-success-soft text-success-ink', icon: CircleCheck },
  warning: { classes: 'bg-warning-soft text-warning-ink', icon: TriangleAlert },
  danger: { classes: 'bg-danger-soft text-danger-ink', icon: CircleAlert },
  info: { classes: 'bg-info-soft text-info-ink', icon: Info },
  neutral: { classes: 'bg-neutral-soft text-neutral-ink', icon: CircleDot },
};

interface StatusBadgeProps {
  tone: StatusTone;
  children: ReactNode;
  /** Icône spécifique ; par défaut, celle du ton. */
  icon?: LucideIcon;
  className?: string;
}

/**
 * Badge de statut : toujours une ICÔNE + un LIBELLÉ.
 * La couleur n'est jamais le seul indicateur (accessibilité, daltonisme).
 */
export function StatusBadge({ tone, children, icon, className }: StatusBadgeProps) {
  const { classes, icon: DefaultIcon } = tones[tone];
  const Icon = icon ?? DefaultIcon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        classes,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}
