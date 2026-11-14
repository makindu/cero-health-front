import { Ban, CircleCheck, FlaskConical, Hourglass, TestTubes, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import type { LabStatus } from './lab-rules';

const STYLE: Record<LabStatus, { tone: StatusTone; icon: typeof Ban }> = {
  requested: { tone: 'neutral', icon: Hourglass },
  collected: { tone: 'info', icon: TestTubes },
  inProgress: { tone: 'info', icon: FlaskConical },
  resultEntered: { tone: 'warning', icon: TriangleAlert },
  validated: { tone: 'success', icon: CircleCheck },
  cancelled: { tone: 'neutral', icon: Ban },
};
export const LAB_STATUSES = Object.keys(STYLE) as LabStatus[];

export function LabStatusBadge({ status }: { status: LabStatus }) {
  const { t } = useTranslation('laboratory');
  return <StatusBadge tone={STYLE[status].tone} icon={STYLE[status].icon}>{t(`status.${status}`)}</StatusBadge>;
}
