import type { TFunction } from 'i18next';
import type { Reason } from '@/core/pricing/types';

const MONEY_KEYS = new Set(['amount', 'cap', 'wanted', 'unit']);

/** Texte lisible d'un code de justification du moteur (montants et taux mis en forme). */
export function reasonText(t: TFunction, reason: Reason, money: (minor: number) => string): string {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(reason.params ?? {})) {
    if (MONEY_KEYS.has(k) && typeof v === 'number') params[k] = money(v);
    else if (k === 'bp' && typeof v === 'number') params[k] = `${(v / 100).toFixed(v % 100 === 0 ? 0 : 2)} %`;
    else params[k] = v;
  }
  return t(`reason.${reason.code}`, { ...params, defaultValue: reason.code });
}
