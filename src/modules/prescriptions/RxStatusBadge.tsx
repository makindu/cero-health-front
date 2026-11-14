import { Ban, ClipboardCheck, ClipboardList, PackageCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import type { RxStatus } from './rx-rules';

const STYLE: Record<RxStatus, { tone: StatusTone; icon: typeof Ban }> = {
  toValidate: { tone: 'warning', icon: ClipboardList },
  validated: { tone: 'info', icon: ClipboardCheck },
  dispensed: { tone: 'success', icon: PackageCheck },
  cancelled: { tone: 'neutral', icon: Ban },
};
export const RX_STATUSES = Object.keys(STYLE) as RxStatus[];

export function RxStatusBadge({ status }: { status: RxStatus }) {
  const { t } = useTranslation('prescriptions');
  return <StatusBadge tone={STYLE[status].tone} icon={STYLE[status].icon}>{t(`status.${status}`)}</StatusBadge>;
}
