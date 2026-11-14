import { Ban, Boxes, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { useFormatters } from '@/core/i18n/useFormatters';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { ResourcePage } from '../_shared/ResourcePage';
import { useResourceList } from '../_shared/use-resource';
import { STOCK_LEVELS, StockLevelBadge, useProductColumns } from './columns';
import { CATEGORIES, productService, stockLevel, type Product } from './data';

function StockSummary() {
  const { t } = useTranslation('inventory');
  const f = useFormatters();
  const all = useResourceList('products', productService, { page: 1, perPage: 500, search: '', filters: {}, sort: null });
  if (!all.data) return null;
  const rows = all.data.rows;
  return (
    <StatGrid>
      <StatCard icon={Boxes} label={t('summary.references')} value={f.number(all.data.total)} />
      <StatCard icon={TriangleAlert} tone="warning" label={t('summary.low')} value={rows.filter((p) => stockLevel(p) === 'low').length} />
      <StatCard icon={Ban} tone="danger" label={t('summary.out')} value={rows.filter((p) => stockLevel(p) === 'out').length} />
      <StatCard icon={TriangleAlert} tone="warning" label={t('summary.expiring')} value={rows.filter((p) => stockLevel(p) === 'expiring').length} />
    </StatGrid>
  );
}

export default function InventoryPage() {
  const { t } = useTranslation('inventory');
  const f = useFormatters();
  const columns = useProductColumns();
  return (
    <ResourcePage<Product>
      name="products"
      service={productService}
      title={t('title')}
      description={t('subtitle')}
      searchLabel={t('search')}
      columns={columns}
      summary={<StockSummary />}
      defaultSort={{ columnId: 'name', direction: 'asc' }}
      filters={[
        { id: 'category', label: t('filters.category'), options: CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`) })) },
        { id: 'level', label: t('filters.level'), options: STOCK_LEVELS.map((l) => ({ value: l, label: t(`level.${l}`) })) },
      ]}
      create={{
        permission: PERMISSIONS.inventory.receive,
        buttonLabel: t('create.button'),
        title: t('create.title'),
        submitLabel: t('create.submit'),
        fields: [
          { name: 'product', label: t('fields.product'), type: 'text', required: true, span: 2 },
          { name: 'quantity', label: t('fields.quantity'), type: 'number', required: true },
          { name: 'supplier', label: t('fields.supplier'), type: 'text' },
          { name: 'batch', label: t('fields.batch'), type: 'text' },
          { name: 'expiry', label: t('fields.expiry'), type: 'date' },
        ],
      }}
      detailTitle={(p) => p.name}
      renderDetail={(p) => (
        <div className="space-y-5">
          <p role="note" className="rounded-md bg-info-soft px-3 py-2 text-sm text-info-ink">
            {t('sourceNote')}
          </p>
          <DetailSection title={t('detail.summary')}>
            <DescriptionList
              items={[
                { label: t('columns.name'), value: p.name },
                { label: t('detail.reference'), value: p.id },
                { label: t('columns.category'), value: t(`category.${p.category}`) },
                { label: t('columns.quantity'), value: `${f.number(p.quantity)} ${p.unit}` },
                { label: t('columns.minLevel'), value: f.number(p.minLevel) },
                { label: t('columns.expiry'), value: p.expiresAt ? f.date(p.expiresAt) : '—' },
                { label: t('detail.supplier'), value: p.supplier },
                { label: t('detail.location'), value: p.location },
                { label: t('columns.level'), value: <StockLevelBadge product={p} /> },
              ]}
            />
          </DetailSection>
        </div>
      )}
    />
  );
}
