import { Eye, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  message: string;
  viewLabel: string;
  closeLabel: string;
  loading?: boolean;
  onView: () => void;
  onClose: () => void;
}

/** Bandeau placé au-dessus d'une liste : annonce ce qui vient d'arriver en direct, avec « Voir » (aller à la ligne) et « Fermer ». */
export function NewArrivalsBanner({ message, viewLabel, closeLabel, loading, onView, onClose }: Props) {
  return (
    <div role="status" aria-live="polite" className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary bg-primary-soft px-3 py-2 text-sm text-primary-ink">
      <Sparkles aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 break-words font-medium">{message}</span>
      <Button size="sm" variant="outline" loading={loading} leftIcon={<Eye className="size-4" />} onClick={onView}>{viewLabel}</Button>
      <button type="button" aria-label={closeLabel} title={closeLabel} onClick={onClose} className="rounded p-1 hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
