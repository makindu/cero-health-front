import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatTime,
  type DateFormatOptions,
} from './formatters';

/** Formateurs liés à la langue active ; se mettent à jour au changement de langue. */
export function useFormatters() {
  const { i18n } = useTranslation();
  const locale = i18n.language;

  return useMemo(
    () => ({
      locale,
      date: (value: Parameters<typeof formatDate>[0], options?: DateFormatOptions) =>
        formatDate(value, locale, options),
      time: (value: Parameters<typeof formatTime>[0], options?: DateFormatOptions) =>
        formatTime(value, locale, options),
      dateTime: (value: Parameters<typeof formatDateTime>[0], options?: DateFormatOptions) =>
        formatDateTime(value, locale, options),
      number: (value: number | null | undefined, options?: Intl.NumberFormatOptions) =>
        formatNumber(value, locale, options),
      currency: (amount: number | null | undefined, currency: string) =>
        formatCurrency(amount, currency, locale),
    }),
    [locale],
  );
}
