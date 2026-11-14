import { Check } from 'lucide-react';
import { useCallback, useId, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { useDismiss } from '@/hooks/useDismiss';
import { cn } from '@/utils/cn';

interface DropdownProps {
  /** Libellé accessible du bouton (obligatoire : le bouton ne contient souvent qu'une icône). */
  label: string;
  trigger: ReactNode;
  /** Le contenu reçoit `close` pour se fermer après une action. */
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end';
  className?: string;
  panelClassName?: string;
}

/**
 * Panneau déroulant (motif « disclosure ») : bouton + panneau qui se ferme au clic extérieur et à Échap.
 * Le contenu est une suite de boutons atteignables au clavier (Tab).
 */
export function Dropdown({
  label,
  trigger,
  children,
  align = 'end',
  className,
  panelClassName,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-md px-2 text-foreground transition-colors hover:bg-surface-muted"
      >
        {trigger}
      </button>
      {open && (
        <div
          id={panelId}
          className={cn(
            'absolute z-30 mt-2 min-w-56 max-w-[calc(100vw-1.5rem)] rounded-card border border-border bg-surface p-1 text-foreground shadow-popover',
            align === 'end' ? 'end-0' : 'start-0',
            panelClassName,
          )}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps extends ComponentProps<'button'> {
  selected?: boolean;
  icon?: ReactNode;
}

export function DropdownItem({ selected, icon, children, className, ...props }: DropdownItemProps) {
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm hover:bg-surface-muted',
        selected && 'font-medium text-primary-ink',
        className,
      )}
      {...props}
    >
      {icon && <span aria-hidden>{icon}</span>}
      <span className="flex-1">{children}</span>
      {selected && <Check aria-hidden className="size-4" />}
    </button>
  );
}
