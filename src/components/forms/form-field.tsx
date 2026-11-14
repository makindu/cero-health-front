import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';

export interface FieldControlProps {
  id: string;
  'aria-invalid': boolean | undefined;
  'aria-describedby': string | undefined;
  'aria-required': boolean | undefined;
}

interface FormFieldProps {
  label: string;
  /** Message d'erreur : clé i18n (messages Zod) ou texte déjà traduit. */
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  /** Reçoit les attributs d'accessibilité à poser sur le contrôle. */
  children: (control: FieldControlProps) => ReactNode;
}

/** Libellé + contrôle + aide + erreur, reliés par aria-describedby. Les clés d'erreur sont traduites ici. */
export function FormField({ label, error, hint, required, className, children }: FormFieldProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const message = error ? (i18n.exists(error) ? t(error) : error) : undefined;
  const describedBy = [hint ? hintId : null, message ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required && (
          <span aria-hidden className="ms-0.5 text-danger-ink">
            *
          </span>
        )}
      </label>
      {children({
        id,
        'aria-invalid': message ? true : undefined,
        'aria-describedby': describedBy || undefined,
        'aria-required': required || undefined,
      })}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {message && (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger-ink">
          {message}
        </p>
      )}
    </div>
  );
}
