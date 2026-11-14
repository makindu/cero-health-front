import { DatabaseZap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/feedback/empty-state';
import { PageHeader } from '@/components/layout/page-header';

/** La comptabilité n'existe pas (encore) sans le serveur : on le dit, on ne simule rien. */
export function LocalOnly({ title }: { title: string }) {
  const { t } = useTranslation('finance');
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={DatabaseZap} title={t('localOnly.title')} description={t('localOnly.description')} />
    </>
  );
}
