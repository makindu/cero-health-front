import { Ban, CircleCheck, Hourglass, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Column } from '@/components/tables/data-table';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import { useFormatters } from '@/core/i18n/useFormatters';
import { stockLevel, type Product, type StockLevel } from './data';

const LEVEL_STYLE: Record<StockLevel, { tone: StatusTone; icon: typeof Ban }> = {
  ok: { tone: 'success', icon: CircleCheck },
  low: { tone: 'warning', icon: TriangleAlert },
  out: { tone: 'danger', icon: Ban },
  expiring: { tone: 'warning', icon: Hourglass },
};

export const STOCK_LEVELS = Object.keys(LEVEL_STYLE) as StockLevel[];

export function StockLevelBadge({ product }: { product: Product }) {
  const { t } = useTranslation('inventory');
  const level = stockLevel(product);
  return (
    <StatusBadge tone={LEVEL_STYLE[level].tone} icon={LEVEL_STYLE[level].icon}>
      {t(`level.${level}`)}
    </StatusBadge>
  );
}

export function useProductColumns(): Column<Product>[] {
  const { t } = useTranslation('inventory');
  const f = useFormatters();
  return [
    { id: 'name', header: t('columns.name'), cell: (p) => <span className="font-medium">{p.name}</span>, sortable: true, primary: true },
    { id: 'category', header: t('columns.category'), cell: (p) => t(`category.${p.category}`) },
    { id: 'quantity', header: t('columns.quantity'), cell: (p) => `${f.number(p.quantity)} ${p.unit}`, sortable: true, className: 'text-end tabular-nums' },
    { id: 'minLevel', header: t('columns.minLevel'), cell: (p) => f.number(p.minLevel), className: 'text-end tabular-nums' },
    { id: 'expiresAt', header: t('columns.expiry'), cell: (p) => (p.expiresAt ? f.date(p.expiresAt) : '—'), sortable: true },
    { id: 'level', header: t('columns.level'), cell: (p) => <StockLevelBadge product={p} /> },
  ];
}
