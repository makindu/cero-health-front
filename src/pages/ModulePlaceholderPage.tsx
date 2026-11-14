import { Construction } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/feedback/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import type { NavItem } from '@/core/navigation/nav-config';

/** Page d'un module non encore développé : le dit clairement, sans fausses données. */
export default function ModulePlaceholderPage({ item }: { item: NavItem }) {
  const { t } = useTranslation();
  const module = t(item.labelKey);
  return (
    <>
      <PageHeader title={module} />
      <Card>
        <EmptyState
          icon={Construction}
          title={t('placeholder.title')}
          description={`${t('placeholder.description', { module, phase: item.phase })} ${t('placeholder.apiHint')}`}
        />
      </Card>
    </>
  );
}
