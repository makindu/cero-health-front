import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import type { ValidationStatus } from '@/core/pricing/types';

const TONE: Record<ValidationStatus, StatusTone> = { pending: 'warning', validated: 'success', rejected: 'danger', suspended: 'neutral' };

export function ValidationBadge({ status }: { status: ValidationStatus }) {
  const { t } = useTranslation('finance');
  return <StatusBadge tone={TONE[status]}>{t(`validation.${status}`)}</StatusBadge>;
}

export const TabToolbar = ({ children }: { children: ReactNode }) => <div className="mb-3 flex flex-wrap items-center justify-end gap-2">{children}</div>;

export const pct = (bp: number): string => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)} %`;
export const toMinor = (text: string): number => Math.round(Number(text.replace(',', '.')) * 100);
export const fromMinor = (n: number | undefined): string => (n === undefined ? '' : (n / 100).toFixed(2));
