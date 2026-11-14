import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useFormatters } from '@/core/i18n/useFormatters';

interface PaginationProps {
  page: number;
  perPage: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, perPage, total, onPageChange }: PaginationProps) {
  const { t } = useTranslation();
  const f = useFormatters();
  const pages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  return (
    <nav
      aria-label={t('pagination.label')}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground"
    >
      <p>
        {t('table.rowsRange', { from: f.number(from), to: f.number(to), total: f.number(total) })}
      </p>
      <div className="flex items-center gap-2">
        <span aria-live="polite">{t('table.page', { page, pages })}</span>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('pagination.previous')}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft aria-hidden className="size-4 rtl:rotate-180" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('pagination.next')}
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight aria-hidden className="size-4 rtl:rotate-180" />
        </Button>
      </div>
    </nav>
  );
}
