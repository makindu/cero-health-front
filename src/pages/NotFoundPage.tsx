import { SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { EmptyState } from '@/components/feedback/empty-state';
import { buttonVariants } from '@/components/ui/button';

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={SearchX}
      title={t('notFound.title')}
      description={t('notFound.description')}
      action={
        <Link to="/" className={buttonVariants('primary')}>
          {t('notFound.backHome')}
        </Link>
      }
    />
  );
}
