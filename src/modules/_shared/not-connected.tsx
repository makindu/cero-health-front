import { PlugZap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/feedback/empty-state';
import { PageHeader } from '@/components/layout/page-header';

/** Module que le serveur HEALTH ne fournit pas encore : on le dit clairement au lieu d'afficher des données fictives ou une erreur. */
export function NotConnected({ title, page = true }: { title: string; page?: boolean }) {
  const { t } = useTranslation();
  const body = <EmptyState icon={PlugZap} title={t('module.notConnected.title')} description={t('module.notConnected.description')} />;
  return page ? <><PageHeader title={title} />{body}</> : body;
}
