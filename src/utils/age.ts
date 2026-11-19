import { useTranslation } from 'react-i18next';
import { ageBreakdown } from './dates';

/**
 * Âge lisible, précis chez le jeune enfant : « 12 j », « 6 mois », « 1 an et 3 mois », puis « 7 ans » à partir de 5 ans.
 * Retourne une fonction de formatage ; les textes viennent de l'espace de noms commun (age.*).
 */
export function useAgeLabel(): (birthDate: string | null | undefined, reference?: Date) => string {
  const { t } = useTranslation('common');
  return (birthDate, reference) => {
    const a = ageBreakdown(birthDate, reference);
    if (!a) return '—';
    if (a.years === 0 && a.months === 0) return t('age.days', { count: a.days });
    if (a.years === 0) return t('age.months', { count: a.months });
    if (a.years < 5 && a.months > 0) return t('age.yearsMonths', { years: a.years, months: a.months });
    return t('age.years', { count: a.years });
  };
}
