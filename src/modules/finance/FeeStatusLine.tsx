import { CalendarCheck, CalendarX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '@/components/ui/badge';
import { useFormatters } from '@/core/i18n/useFormatters';
import { useFeeStatus } from './use-finance';

/** Validité des frais de consultation d'un patient à la date du jour (accueil, caisse, fiche patient). */
export function FeeStatusLine({ patientId }: { patientId: string }) {
  const { t } = useTranslation('finance');
  const f = useFormatters();
  const status = useFeeStatus(patientId);
  if (!status.data) return null;
  const s = status.data;
  if (s.state === 'valid') {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge tone="success" icon={CalendarCheck}>{t('fee.valid')}</StatusBadge>
        {t('fee.until', { date: f.date(s.validUntil ?? ''), days: s.daysLeft ?? 0 })}{s.source === 'exemption' ? ` · ${t('fee.exempted')}` : ''}
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <StatusBadge tone="warning" icon={CalendarX}>{s.state === 'expired' ? t('fee.expired') : t('fee.none')}</StatusBadge>
      {s.state === 'expired' ? t('fee.expiredOn', { date: f.date(s.validUntil ?? '') }) : t('fee.noneHint')}
    </p>
  );
}
