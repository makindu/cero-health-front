import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** Bandeau « brouillon retrouvé » affiché en tête d'un formulaire dont la saisie a été restaurée. */
export function DraftNotice({ onDiscard }: { onDiscard: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-info-soft px-3 py-2 text-sm text-info-ink"
    >
      <span>{t('draft.restored')}</span>
      <Button variant="ghost" size="sm" onClick={onDiscard}>
        <RotateCcw aria-hidden className="size-4" />
        {t('draft.discard')}
      </Button>
    </div>
  );
}
