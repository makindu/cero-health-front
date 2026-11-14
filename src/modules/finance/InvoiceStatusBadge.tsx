import { Ban, CircleCheck, FileClock, FilePen, Hourglass, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import type { InvoiceStatus } from '@/core/billing/invoice';

const STYLE: Record<InvoiceStatus, { tone: StatusTone; icon: typeof Ban }> = {
  draft: { tone: 'neutral', icon: FilePen },
  awaitingPayment: { tone: 'info', icon: FileClock },
  partiallyPaid: { tone: 'warning', icon: Hourglass },
  paid: { tone: 'success', icon: CircleCheck },
  creditAuthorized: { tone: 'warning', icon: ShieldAlert },
  cancelled: { tone: 'neutral', icon: Ban },
};

export const INVOICE_STATUSES = Object.keys(STYLE) as InvoiceStatus[];

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { t } = useTranslation('finance');
  const s = STYLE[status];
  return <StatusBadge tone={s.tone} icon={s.icon}>{t(`status.${status}`)}</StatusBadge>;
}
