/**
 * Formatage des dates, heures, nombres et devises selon la langue active.
 * Fonctions pures (testables) ; le hook useFormatters() les lie à la langue courante.
 *
 * Les dates sont des instants (ISO 8601). Elles s'affichent dans le fuseau de l'établissement
 * (paramètre `timeZone`), pas forcément celui du poste de travail.
 */

export const EMPTY_VALUE = '—';

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    // « AAAA-MM-JJ » seul est un jour civil (ex. date de naissance) : on l'interprète en local pour que
    // le jour affiché ne dépende pas du fuseau du poste (new Date l'interpréterait en UTC).
    const civil = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (civil) return new Date(Number(civil[1]), Number(civil[2]) - 1, Number(civil[3]), 12, 0, 0, 0);
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface DateFormatOptions {
  timeZone?: string;
}

export function formatDate(value: DateInput, locale: string, options: DateFormatOptions = {}): string {
  const date = toDate(value);
  if (!date) return EMPTY_VALUE;
  return safeFormat(() => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', ...options }).format(date));
}

export function formatTime(value: DateInput, locale: string, options: DateFormatOptions = {}): string {
  const date = toDate(value);
  if (!date) return EMPTY_VALUE;
  return safeFormat(() => new Intl.DateTimeFormat(locale, { timeStyle: 'short', ...options }).format(date));
}

export function formatDateTime(
  value: DateInput,
  locale: string,
  options: DateFormatOptions = {},
): string {
  const date = toDate(value);
  if (!date) return EMPTY_VALUE;
  return safeFormat(() =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', ...options }).format(date),
  );
}

export function formatNumber(
  value: number | null | undefined,
  locale: string,
  options: Intl.NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY_VALUE;
  return safeFormat(() => new Intl.NumberFormat(locale, options).format(value));
}

/**
 * La devise est toujours fournie par l'appelant (paramètre de l'établissement) :
 * aucune devise par défaut n'est supposée.
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency: string,
  locale: string,
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return EMPTY_VALUE;
  return safeFormat(() => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount));
}

function safeFormat(format: () => string): string {
  try {
    return format();
  } catch {
    // Locale, fuseau ou devise invalide : on n'affiche pas d'erreur technique à l'utilisateur.
    return EMPTY_VALUE;
  }
}
