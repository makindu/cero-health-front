import { Ban, CircleCheck, Hourglass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import type { DispensationStatus } from './pharmacy-rules';

const STYLE: Record<DispensationStatus, { tone: StatusTone; icon: typeof Ban }> = {
  prepared: { tone: 'warning', icon: Hourglass },
  dispensed: { tone: 'success', icon: CircleCheck },
  cancelled: { tone: 'neutral', icon: Ban },
};
export const DISPENSATION_STATUSES = Object.keys(STYLE) as DispensationStatus[];

export function DispensationStatusBadge({ status }: { status: DispensationStatus }) {
  const { t } = useTranslation('pharmacy');
  return <StatusBadge tone={STYLE[status].tone} icon={STYLE[status].icon}>{t(`dispensationStatus.${status}`)}</StatusBadge>;
}
