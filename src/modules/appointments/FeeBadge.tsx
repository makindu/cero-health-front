import { useTranslation } from 'react-i18next';
import { StatusBadge } from '@/components/ui/badge';
import { FINANCE_AVAILABLE, useFeeStatus } from '../finance/use-finance';

/** Frais de consultation du patient (valides, expirés ou à payer) : l'accueil le voit AVANT d'orienter vers la consultation. */
export function FeeBadge({ patientId }: { patientId: string }) {
  const { t } = useTranslation('appointments');
  const fee = useFeeStatus(patientId);
  if (!FINANCE_AVAILABLE) return <span aria-hidden>—</span>;
  if (!fee.data) return <span className="text-muted-foreground" aria-busy="true">…</span>;
  const { state, daysLeft } = fee.data;
  const exempt = 'exemptCategory' in fee.data ? String((fee.data as { exemptCategory?: string }).exemptCategory ?? '') : '';
  if (exempt) return <StatusBadge tone="info">{t('reception.fee.category', { category: exempt })}</StatusBadge>;
  return (
    <StatusBadge tone={state === 'valid' ? 'success' : 'warning'}>
      {state === 'valid' && daysLeft !== undefined && daysLeft <= 7 ? t('reception.fee.validSoon', { count: daysLeft }) : t(`reception.fee.${state}`)}
    </StatusBadge>
  );
}
