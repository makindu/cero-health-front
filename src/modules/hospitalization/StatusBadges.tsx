import { BedDouble, CircleCheck, Hourglass, LogOut, Sparkles, Wrench, Ban, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import type { AdmissionStatus, BedStatus } from './hospital-rules';

const ADM: Record<AdmissionStatus, { tone: StatusTone; icon: LucideIcon }> = {
  admitted: { tone: 'info', icon: CircleCheck },
  dischargePending: { tone: 'warning', icon: Hourglass },
  discharged: { tone: 'neutral', icon: LogOut },
  cancelled: { tone: 'neutral', icon: Ban },
};
export const ADMISSION_STATUSES = Object.keys(ADM) as AdmissionStatus[];
export function AdmissionStatusBadge({ status }: { status: AdmissionStatus }) {
  const { t } = useTranslation('hospitalization');
  return <StatusBadge tone={ADM[status].tone} icon={ADM[status].icon}>{t(`admissionStatus.${status}`)}</StatusBadge>;
}

/** État d'une demande d'hospitalisation (mode API). */
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'admitted';
const REQ: Record<RequestStatus, { tone: StatusTone; icon: LucideIcon }> = {
  pending: { tone: 'warning', icon: Hourglass },
  approved: { tone: 'success', icon: CircleCheck },
  rejected: { tone: 'danger', icon: Ban },
  cancelled: { tone: 'neutral', icon: Ban },
  admitted: { tone: 'info', icon: BedDouble },
};
export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const { t } = useTranslation('hospitalization');
  return <StatusBadge tone={REQ[status].tone} icon={REQ[status].icon}>{t(`hospReq.status.${status}`)}</StatusBadge>;
}

export const BED_STYLE: Record<BedStatus, { tone: StatusTone; icon: LucideIcon; ring: string }> = {
  free: { tone: 'success', icon: CircleCheck, ring: 'border-success' },
  occupied: { tone: 'info', icon: BedDouble, ring: 'border-info' },
  cleaning: { tone: 'warning', icon: Sparkles, ring: 'border-warning' },
  maintenance: { tone: 'neutral', icon: Wrench, ring: 'border-border-strong' },
};
export function BedStatusBadge({ status }: { status: BedStatus }) {
  const { t } = useTranslation('hospitalization');
  return <StatusBadge tone={BED_STYLE[status].tone} icon={BED_STYLE[status].icon}>{t(`bedStatus.${status}`)}</StatusBadge>;
}
